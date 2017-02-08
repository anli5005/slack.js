'use strict';

const https = require("https");
const querystring = require("querystring");
const websocket = require("websocket");
const EventEmitter = require("events");

class Integration extends EventEmitter {
  constructor(token) {
    super();

    this.token = token;
    this.isStarted = false;
  }

  call(api, args) {
    var token = this.token;

    return new Promise(function(resolve, reject) {
      args.token = args.token || token;

      var req = https.request({
        hostname: "slack.com",
        path: `/api/${api}`,
        port: 443,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }, function(res) {
        var json = "";
        res.on("data", function(chunk) {
          json += chunk;
        });
        res.on("end", function() {
          var data = JSON.parse(json);
          if (data.ok) {
            resolve(data);
          } else {
            reject(data);
          }
        });
      });
      req.on("error", function() {
        reject({});
      });
      req.write(querystring.stringify(args));
      req.end();
    });
  }

  connectToRTM() {
    var integration = this;

    this.call("rtm.start", {token: this.token}).then(function(data) {
      var client = new websocket.client();
      client.on("connect", function(connection) {
        connection.on("message", function(message) {
          if (message.type == "utf8") {
            var event = JSON.parse(message.utf8Data);
            integration.emit(event.type, event, integration);
          }
        }).on("close", function(reasonCode, description) {
          integration.emit("close", {reasonCode: reasonCode, description: description}, integration);
        });
      });
      client.connect(data.url);

      var properties = ["self", "team", "users", "channels", "groups", "mpims", "ims", "bots"];
      for (var p of properties) {
        integration[p] = data[p];
      }
    });
  }

  start() {
    if (this.token) {
      this.connectToRTM();
    }
    this.isStarted = true;
    return this;
  }

  sendMessage(message) {
    if (message.as_user !== false) {
      message.as_user = true;
    }
    if (message.attachments) {
      message.attachments = JSON.stringify(message.attachments);
    }
    return this.call("chat.postMessage", message);
  }
};

module.exports = function(token) {
  return new Integration(token);
};
