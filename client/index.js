process.env.DEBUG = process.env.DEBUG || "GT:Info|Error|GT:*"; // change to * to get all debug messages or set the DEBUG env before starting the server (eg. export DEBUG=*)

const logError = require("debug")("GT:Error");
const optimist = require("optimist");

const initialiseWebSocketClient = require("./client");

const argv = optimist
  .usage("Usage: $0 --port [num] --host [string]")
  .options("port", {
    describe: "Port of app to be exposed",
  })
  .options("host", {
    describe: "Globaltunnel server orchestrating connections",
  })
  .options("subdomain", {
    default: "",
    describe: "Request this subdomain",
  }).argv;

if (argv.help) {
  optimist.showHelp();
  process.exit();
}

initialiseWebSocketClient(argv)
  .then((socket) => {
    process.on("SIGINT", () => {
      socket.end(() => {
        process.exit();
      });
    });

    process.on("SIGTERM", () => {
      socket.end(() => {
        process.exit();
      });
    });

    process.on("uncaughtException", (err) => {
      logError(err);
    });

    process.on("unhandledRejection", (reason, promise) => {
      logError(reason);
    });
  })
  .catch((error) => {
    logError(error);
    process.exit();
  });
