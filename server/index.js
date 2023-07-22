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
  }).argv;

if (argv.help) {
  optimist.showHelp();
  process.exit();
}

const server = InitialiseHTTPServer(argv);

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
