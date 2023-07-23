const debug = require("debug")("GT:Client");
const logError = require("debug")("GT:Error");
const EventEmitter = require("events");
const http = require("http");
const Queue = require("mnemonist/queue");
const crypto = require("crypto");

const EOB_TOKEN = "!!!";

module.exports = class Client extends EventEmitter {
  constructor(opt, subdomain) {
    super();
    this.opt = opt;
    this.subdomain = subdomain;
    this.bufferedData = "";
    this.isActive = false;
    this.socket = undefined;
    this.websocketServer = undefined;
    this.userRequests = new Queue();
    this.responseSubscribers = new Map();
    this.details = {};

    this.handleUpgradeHttpToWebSocket =
      this.handleUpgradeHttpToWebSocket.bind(this);
    this.triggerUserRequestProcessing =
      this._triggerUserRequestProcessing().bind(this);
  }

  close() {
    // TODO: do a comprehensive error check
    // TODO: there may be a memory leak here where closed servers are not garbage collected
    // possible solution is to have a fix set of ports to choose from
    return new Promise((resolve) => {
      debug(
        "Closing client (%s) connected to port %d",
        this.subdomain,
        this.websocketServer.address().port
      );
      this.websocketServer.close();
      resolve();
    });
  }

  createWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.websocketServer = http.createServer();
        this.websocketServer.on("upgrade", this.handleUpgradeHttpToWebSocket);
        this.websocketServer.listen(() => {
          const webSocketPort = this.websocketServer.address().port;
          debug(
            "Started websocket server for subdomain (%s) listening on port %d",
            this.subdomain,
            webSocketPort
          );
          this.details = {
            assignedSubdomain: this.subdomain,
            assignedHttpURL: `http://${this.subdomain}.${this.opt.domain}:${this.opt.port}`,
            assignedWebSocketURL: `ws://${this.subdomain}.${this.opt.domain}:${webSocketPort}`,
            webSocketRequestOptions: {
              port: webSocketPort,
              host: `${this.subdomain}.${this.opt.domain}`,
              headers: {
                Connection: "Upgrade",
                Upgrade: "websocket",
                "Sec-WebSocket-Version": "13",
                "Sec-WebSocket-Key": Buffer.from(
                  crypto.randomBytes(16)
                ).toString("base64"),
              },
            },
          };
          resolve(this.details);
        });
      } catch (error) {
        debug(
          "Something went wrong while starting websocketServer for %s",
          this.subdomain
        );
        reject({ message: error.message });
      }
    });
  }

  handleUpgradeHttpToWebSocket(req, socket, head) {
    const headers =
      [
        "HTTP/1.1 101 Web Socket Protocol Handshake",
        "Upgrade: WebSocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${this._generateWebSocketAccept(
          req.headers["sec-websocket-key"]
        )}`,
        "",
      ].join("\r\n") + "\r\n";
    socket.write(headers);
    socket.on("data", (data) => {
      this.bufferedData += data.toString();
      const eobTokenIndex = this.bufferedData.indexOf(EOB_TOKEN);
      if (eobTokenIndex !== -1) {
        const extractedBuffer = this.bufferedData.slice(0, eobTokenIndex);
        const remainingBuffer = this.bufferedData.slice(
          eobTokenIndex + EOB_TOKEN.length
        );
        this.bufferedData = remainingBuffer;
        const parsedData = JSON.parse(extractedBuffer);
        if (this.responseSubscribers.has(parsedData.responseLookupID)) {
          const res = this.responseSubscribers.get(parsedData.responseLookupID);
          this.responseSubscribers.delete(parsedData.responseLookupID);
          Object.entries(parsedData.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
          res.write(Buffer.from(parsedData.body.data));
          res.end();
        } else {
          logError(
            "Not user response object was found for the lookup ID: %s",
            parsedData.responseLookupID
          );
        }
      }
    });
    socket.on("end", () => {
      this.emit("close", this.subdomain);
    });
    this.isActive = true;
    this.socket = socket;
  }

  handleUserSubdomainRequest(req, res, body) {
    debug("User incoming request added to client queue: %s", req.url);
    const responseLookupID = crypto
      .randomBytes(Math.ceil(16 / 2))
      .toString("hex")
      .slice(0, 16);
    this.responseSubscribers.set(responseLookupID, res);
    // console.log(
    //   `${req.method} ${req.url} HTTP/${
    //     req.httpVersion
    //   }\r\n${req.rawHeaders.join("\r\n")}\r\n\r\n`
    // );
    this.userRequests.enqueue({ req, body, responseLookupID });
    this.triggerUserRequestProcessing();
  }

  _triggerUserRequestProcessing() {
    let block = false;
    return () => {
      if (block) return;
      block = true;
      while (this.userRequests.size) {
        const { req, body, responseLookupID } = this.userRequests.dequeue();
        this.socket.cork();
        this.socket.write(
          JSON.stringify({
            req: {
              method: req.method,
              url: req.url,
              headers: req.headers,
            },
            body,
            responseLookupID,
          }) + EOB_TOKEN
        );
        this.socket.uncork();
      }
      block = false;
    };
  }

  _generateWebSocketAccept(webSocketKey) {
    if (webSocketKey) {
      const magicString = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
      const concatenatedKey = webSocketKey + magicString;
      const sha1 = crypto.createHash("sha1");
      sha1.update(concatenatedKey);
      return sha1.digest("base64");
    } else {
      return "";
    }
  }
};
