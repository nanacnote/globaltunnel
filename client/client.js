const logInfo = require("debug")("GT:Info");
const logError = require("debug")("GT:Error");
const EventEmitter = require("events");
const querystring = require("querystring");
const http = require("http");
const { URL } = require("url");

const EOB_TOKEN = "!!!";

class HttpRequestManager {
  constructor(argv, options) {
    const parsedUrl = options.url ? new URL(options.url) : {};
    this.hostname = options.hostname || parsedUrl.hostname;
    this.port =
      options.port ||
      parsedUrl.port ||
      (parsedUrl.protocol === "https:" ? "443" : "80");
    this.path =
      options.path || parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
    this.method = options.method;
    this.headers = options.headers || {};
    this.body = options.body || [];
    this.argv = argv;
  }

  send() {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.hostname,
          port: this.port,
          path: this.path,
          method: this.method,
          headers: this.headers,
        },
        (res) => {
          const chunks = [];
          res.on("data", (data) => {
            chunks.push(data);
          });
          res.on("end", () => {
            const headers = res.headers;
            let body = Buffer.concat(chunks);
            switch (headers["content-type"].split(";")[0].trim()) {
              case "application/json":
                body = JSON.parse(body);
                break;
              case "application/x-www-form-urlencoded":
                body = querystring.parse(body);
                break;
              default:
                break;
            }
            resolve({ headers, body });
          });
        }
      );
      req.on("error", reject);
      req.write(Buffer.from(this.body));
      req.end();
    });
  }
}

class BufferManager extends EventEmitter {
  constructor(argv, socket) {
    super();
    this.argv = argv;
    this.socket = socket;
    this.buffer = "";

    this.add = this.add.bind(this);
  }

  add(incomingBuffer) {
    this.buffer += incomingBuffer.toString();
    this._triggerBufferProcessing();
  }

  _triggerBufferProcessing() {
    const eobTokenIndex = this.buffer.indexOf(EOB_TOKEN);
    if (eobTokenIndex !== -1) {
      const extracted = this.buffer.slice(0, eobTokenIndex);
      const remaining = this.buffer.slice(eobTokenIndex + EOB_TOKEN.length);
      this.buffer = remaining;
      this.emit("ready", this.argv, this.socket, JSON.parse(extracted));
    }
  }
}

function pipeRequestToLocalhost(argv, socket, incomingPayload) {
  new HttpRequestManager(argv, {
    hostname: "localhost",
    port: argv.port,
    path: incomingPayload.req.url,
    method: incomingPayload.req.method,
    headers: incomingPayload.req.headers,
    body: incomingPayload.body,
  })
    .send()
    .then(({ headers, body }) => {
      socket.write(
        JSON.stringify({
          headers,
          body,
          responseLookupID: incomingPayload.responseLookupID,
        }) + EOB_TOKEN
      );
    })
    .catch((err) => {
      logError("Piping incoming request to localhost failed");
      logError(err);
      process.kill(process.pid, "SIGTERM");
    });
}

function connectToWebSocket(argv, details) {
  return new Promise((resolve, reject) => {
    const req = http.request(details.webSocketRequestOptions);
    req.on("upgrade", (res, socket, head) => {
      logInfo(`Tunnel is ready @ -> ${details.assignedHttpURL}`);
      const bufferManager = new BufferManager(argv, socket);
      bufferManager.on("ready", pipeRequestToLocalhost);
      socket.on("data", bufferManager.add);
      socket.on("close", () => {
        process.kill(process.pid, "SIGTERM");
      });
      resolve(socket);
    });
    req.on("error", reject);
    req.end();
  });
}

function requestSocketCredentials(argv) {
  return new Promise((resolve, reject) => {
    new HttpRequestManager(argv, {
      method: "GET",
      url: `http://${argv.host}/?subdomain=${argv.subdomain}`,
    })
      .send()
      .then(({ headers, body }) => connectToWebSocket(argv, body))
      .then(resolve)
      .catch((err) => {
        logError("Connection to websocket failed");
        reject(err);
      });
  });
}

module.exports = requestSocketCredentials;

// node ./client/index.js --port 9000 --host 127.0.0.1:3000 --subdomain globaltunnel
