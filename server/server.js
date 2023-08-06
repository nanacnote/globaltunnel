const debug = require("debug")("GT:Server");
const logInfo = require("debug")("GT:Info");
const fs = require("fs");
const path = require("path");
const http = require("http");
const url = require("url");

const ClientManager = require("./ClientManager");

function InitialiseHTTPServer(argv) {
  return new Promise((resolve, reject) => {
    const clientManager = new ClientManager(argv);
    const server = http.createServer();

    server.on("request", async (req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const route = req.url;
      const host = req.headers.host;
      const subdomain = host
        .substring(0, host.indexOf(argv.domain))
        .replace(/\.$/, "");
      const client = clientManager.get(subdomain);

      if (!host) {
        res.statusCode = 400;
        res.end("Host header is required");
        return;
      }

      if (!subdomain) {
        switch (route) {
          case "/api/status": {
            debug("Serving status page");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                tunnels: clientManager.stats.tunnels,
                mem: process.memoryUsage(),
              })
            );
            break;
          }
          case route.match(/^\/api\/tunnels\/[^/]+\/status$/)?.input: {
            const segments = route.split("/");
            const id = segments[segments.length - 2];
            debug("Serving status page for client with id %s", id);
            res.setHeader("Content-Type", "application/json");
            if (clientManager.has(id)) {
              res.writeHead(200);
              res.end(JSON.stringify(clientManager.get(id).details));
            } else {
              res.writeHead(404);
              res.end(JSON.stringify({ message: "404 Not Found" }));
            }
            break;
          }
          case route.match(/^\/\?subdomain=[^/]+$/)?.input: {
            debug("Creating new gt client connection");
            const details = await clientManager.add(
              parsedUrl.query["subdomain"]
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(details));
            break;
          }
          default: {
            debug("Serving landing page");
            res.setHeader("Content-Type", "text/html");
            fs.readFile(
              path.join(__dirname, "html", "index.html"),
              "utf8",
              (err, htmlString) => {
                if (err) {
                  res.writeHead(500);
                  res.end("Error reading HTML file");
                } else {
                  res.writeHead(200);
                  res.end(htmlString);
                }
              }
            );
            break;
          }
        }
        return;
      }

      if (!client) {
        res.statusCode = 404;
        res.end(`No clients associated with ${subdomain}`);
        return;
      }

      const chunks = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        const body = Buffer.concat(chunks);
        client.pipe(req, res, body);
      });
    });

    server.listen(argv.port, () => {
      logInfo("server listening on port: %s", server.address().port);
      resolve(server);
    });
    server.on("close", () => {
      clientManager.removeAll();
    });
    server.on("error", reject);
  });
}

module.exports = InitialiseHTTPServer;
