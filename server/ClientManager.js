const debug = require("debug")("GT:ClientManager");
const { hri } = require("human-readable-ids");

const Client = require("./Client");

module.exports = class ClientManager {
  constructor(opt) {
    this.opt = opt;
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

  create(subdomain) {
    return new Promise((resolve, reject) => {
      const assignedSubdomain = this.clients.has(subdomain)
        ? hri.random()
        : subdomain;
      const client = new Client(this.opt, assignedSubdomain);
      client.on("close", this.remove);
      client
        .createWebSocket()
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
                "Client assigned with subdomain %s did not connect in time",
                assignedSubdomain
              );
              this.remove(assignedSubdomain);
            }
          }, 5000);
        });
    });
  }
};
