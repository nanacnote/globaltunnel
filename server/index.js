process.env.DEBUG = process.env.DEBUG || "GT:Info|Error|GT:*"; // change to * to get all debug messages or set the DEBUG env before starting the server (eg. export DEBUG=*)

const optimist = require("optimist");
const logError = require("debug")("GT:Error");

const InitialiseHTTPServer = require("./server");

const argv = optimist
  .usage("Usage: $0 --port [num]")
  .options("domain", {
    default: "localhost",
    describe:
      "Specify the base domain name (eg. example.com or gt.example.com)",
  })
  .options("port", {
    default: "80",
    describe: "listen on this port for outside requests",
  })
  .options("address", {
    default: "0.0.0.0",
    describe: "IP address to bind to",
  })
  .options("domain", {
    describe:
      "Specify the base domain name. This is optional if hosting globaltunnel from a regular example.com domain. This is required if hosting a globaltunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)",
  })
  .options("max-tcp-sockets", {
    default: 10,
    describe:
      "maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)",
  }).argv;

if (argv.help) {
  optimist.showHelp();
  process.exit();
}

InitialiseHTTPServer(argv);

process.on("SIGINT", () => {
  server.close(() => {
    process.exit();
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit();
  });
});

process.on("uncaughtException", (err) => {
  logError(err);
});

process.on("unhandledRejection", (reason, promise) => {
  logError(reason);
});
