const debug = require("debug")("GT:Client");
const logError = require("debug")("GT:Error");
const EventEmitter = require("events");
const http = require("http");
const Queue = require("mnemonist/queue");
const crypto = require("crypto");

const EOB_TOKEN = "!!!";
const FREE_WS_SERVER_TIMEOUT = 5000;

class Client extends EventEmitter {
  constructor(argv, subdomain) {
    super();
    this.argv = argv;
    this.subdomain = subdomain;
    this.bufferedData = "";
    this.isActive = false;
    this.socket = undefined;
    this.websocketServer = undefined;
    this.incomingRequests = new Queue();
    this.responseLookup = new Queue();
    this.details = {};

    this.upgradeHttpToWebSocket = this._upgradeHttpToWebSocket.bind(this);
    this.triggerResponseProcessing = this._triggerResponseProcessing.bind(this);
    this.triggerRequestProcessing = this._triggerRequestProcessing().bind(this);
  }

  close() {
    return new Promise((resolve) => {
      debug(
        "Closing client: %s connected to port: %d",
        this.subdomain,
        this.websocketServer.address().port
      );
      setTimeout(() => {
        this.socket.destroy();
        this.websocketServer.close((err) => {
          if (err) logError(err);
          resolve();
        });
      }, FREE_WS_SERVER_TIMEOUT);
    });
  }

  initialise() {
    return new Promise((resolve, reject) => {
      try {
        this.websocketServer = http.createServer();
        this.websocketServer.on("upgrade", this.upgradeHttpToWebSocket);
        this.websocketServer.listen(() => {
          const webSocketPort = this.websocketServer.address().port;
          debug(
            "Started websocket server for subdomain: %s listening on port: %d",
            this.subdomain,
            webSocketPort
          );
          this.details = {
            assignedSubdomain: this.subdomain,
            assignedHttpURL: `http://${this.subdomain}.${this.argv.domain}:${this.argv.port}`,
            assignedWebSocketURL: `ws://${this.subdomain}.${this.argv.domain}:${webSocketPort}`,
            webSocketRequestOptions: {
              port: webSocketPort,
              host: `${this.subdomain}.${this.argv.domain}`,
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
          "Something went wrong while starting websocketServer for: %s",
          this.subdomain
        );
        reject({ message: error.message });
      }
    });
  }

  pipe(req, res, body) {
    debug("User incoming request added to client queue: %s", req.url);
    const responseLookupID = crypto
      .randomBytes(Math.ceil(16 / 2))
      .toString("hex")
      .slice(0, 16);
    this.responseLookup.enqueue({ res, responseLookupID });
    this.incomingRequests.enqueue({ req, body, responseLookupID });
    this.triggerRequestProcessing();
  }

  _upgradeHttpToWebSocket(req, socket, head) {
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
        this.triggerResponseProcessing(JSON.parse(extractedBuffer));
      }
    });
    socket.once("end", () => {
      this.emit("close", this.subdomain);
    });
    this.isActive = true;
    this.socket = socket;
  }

  _triggerRequestProcessing() {
    let block = false;
    return () => {
      if (block) return;
      block = true;
      while (this.incomingRequests.size) {
        const { req, body, responseLookupID } = this.incomingRequests.dequeue();
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
      }
      block = false;
    };
  }

  _triggerResponseProcessing(parsedData) {
    if (
      this.responseLookup.peek()?.responseLookupID ===
      parsedData.responseLookupID
    ) {
      const { res } = this.responseLookup.dequeue();
      Object.entries(parsedData.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.write(Buffer.from(parsedData.body.data));
      res.end();
    } else {
      /// -----------------
      setTimeout(() => {
        this.triggerRequestProcessing(parsedData);
      }, 2000);
      /// -----------------
      logError(
        "No response object was found for the lookup ID: %s",
        parsedData.responseLookupID
      );
    }
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
}

module.exports = Client;
