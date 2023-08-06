const debug = require("debug")("GT:ClientManager");
const { hri } = require("human-readable-ids");

const Client = require("./Client");

const SOCKET_UPGRADE_TIMEOUT = 5000;

class ClientManager {
  constructor(argv) {
    this.argv = argv;
    this.clients = new Map();

    this.remove = this.remove.bind(this);
  }

  get stats() {
    return {
      tunnels: this.clients.size,
    };
  }

  has(subdomain) {
    return this.clients.has(subdomain);
  }

  get(subdomain) {
    return this.clients.get(subdomain);
  }

  remove(subdomain) {
    if (this.clients.has(subdomain)) {
      this.clients
        .get(subdomain)
        .close()
        .then(() => {
          debug("Client: %s closed and removed successfully", subdomain);
          this.clients.delete(subdomain);
        });
    }
  }

  removeAll() {
    const clientList = Array.from(this.clients);
    Promise.all(clientList.map(([, client]) => client.close())).then(() => {
      this.clients.clear();
    });
  }

  add(subdomain) {
    return new Promise((resolve, reject) => {
      const assignedSubdomain = this.clients.has(subdomain)
        ? hri.random()
        : subdomain;
      const client = new Client(this.argv, assignedSubdomain);
      client.once("close", this.remove);
      client
        .initialise()
        .then((details) => {
          this.clients.set(assignedSubdomain, client);
          ++this.stats.tunnels;
          resolve(details);
        })
        .catch(reject)
        .finally(() => {
          setTimeout(() => {
            if (!client.isActive) {
              debug(
                "Client with subdomain: %s failed to connect within the expected time frame",
                assignedSubdomain
              );
              this.remove(assignedSubdomain);
            }
          }, SOCKET_UPGRADE_TIMEOUT);
        });
    });
  }
}

module.exports = ClientManager;
