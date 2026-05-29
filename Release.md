# FXTZ Arena Release Artifacts

Every `v*` tag publishes these artifacts:

1. `fxtz-arena-frontend-<version>.zip`: static frontend build.
2. GitHub Pages: the same frontend build deployed to the repository Pages site.
3. `fxtz-arena-dedicated-server-<version>.tar.gz`: Node 20 dedicated-server bundle, entry point `dist/index.js`.
4. `fxtz-arena-dedicated-server-image-<version>.tar.gz`: Docker image archive for the dedicated server.

## Frontend Zip

Unzip it and serve the contents with any static file server. The build includes the workspace packages needed by the browser client.

## GitHub Pages

The release page links to the deployed GitHub Pages build. The client shows the build label in the home/settings UI, for example:

```text
v1.0.0+23456
```

## Dedicated Server Bundle

Run with Node 20+:

```bash
node dist/index.js
```

Without certificate options, the server runs in plain WS/HTTP mode:

```text
Dedicated server listening on ws://0.0.0.0:22334 and ws://[::]:22334
HTTP echo endpoint: http://0.0.0.0:22334/echo
```

Optional bind settings:

```bash
HOST=0.0.0.0 PORT=22334 node dist/index.js
```

To let the server create and reuse a local self-signed certificate pair, pass a PEM directory:

```bash
node dist/index.js --pem-dir=/path/to/pems
```

If `/path/to/pems/cert.pem` and `/path/to/pems/key.pem` both exist, they are used. If neither exists, the server runs OpenSSL to create them:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```

The private key is created on the user's machine and is not shipped in release artifacts.

To use an existing certificate pair directly, run:

```bash
node dist/index.js --cert=/path/to/cert.pem --key=/path/to/key.pem
```

`--cert` and `--key` must be provided together. Do not combine them with `--pem-dir`.

When TLS is enabled, startup logs should include:

```text
Dedicated server listening on wss://0.0.0.0:22334 and wss://[::]:22334
HTTP echo endpoint: https://0.0.0.0:22334/echo
```

For self-signed certificates, open the echo endpoint in the browser before connecting from the game, then accept/trust the certificate warning:

```text
https://<server-host>:22334/echo
```

After trust is granted, use the matching WebSocket address in the game:

```text
wss://<server-host>:22334/
```

## Docker Image

Load the image:

```bash
docker load -i fxtz-arena-dedicated-server-image-v1.0.0+23456.tar.gz
```

Run the image:

```bash
docker run --rm -p 22334:22334 fxtz-arena-dedicated-server:v1.0.0
```
