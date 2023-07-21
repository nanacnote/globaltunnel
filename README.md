# globaltunnel (a fork of localtunnel)

Many thanks to the developers of [localtunnel](https://github.com/localtunnel)

globaltunnel (localtunnel) exposes your localhost to the world for easy testing and sharing! No need to mess with DNS or deploy just to have others test out your changes.

## Setup

```shell
# pick a place where the files will live
git clone git://github.com/nanacnote/globaltunnel.git
cd globaltunnel
npm install

# server set to run on port 1234
npm start
# or
node server/index --port 1234
```

The globaltunnel server is now running and waiting for client requests on port 1234. You will most likely want to set up a reverse proxy to listen on port 80 (or start globaltunnel on port 80 directly).

**NOTE** By default, globaltunnel will use subdomains for clients, if you plan to host your globaltunnel server itself on a subdomain you will need to use the _--domain_ option and specify the domain name behind which you are hosting globaltunnel. (i.e. my-globaltunnel-server.example.com)

## Usage

There is a accompany client in this repo which is use to connect to the globaltunnel server it mimics how [ngrok](https://ngrok.com/) cli works.
You can now use your domain with the `--host` flag for the `gt` client.

```shell
gt --host http://sub.example.com:1234 --port 9000
```

You will be assigned a URL similar to `heavy-puma-9.sub.example.com:1234`.

## REST API

> #### POST /api/tunnels
>
> Create a new tunnel. A globaltunnel client posts to this endpoint to request a new tunnel with a specific name or a randomly assigned name.

> #### GET /api/status
>
> General server information.

notes
/etc/host
127.0.0.1 globaltunnel.localhost

add above for dev to work

use node16
