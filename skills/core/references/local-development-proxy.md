# Local Development Proxy for Embedded Components

Use this when a locally hosted app embeds Flex, web-component dashboards, or IQ-rendered charts and the browser shows CORS errors, a reconnecting `/realtime` socket, or a misleading chart "Query failed" overlay.

## Rule

For local development, keep the Luzmo app bundle host direct and proxy only the API/realtime host through the local app origin:

- `apiHost`: set to the local app origin, for example `window.location.origin`
- `appServer`: keep pointed directly at the Luzmo app host for the same region, for example `https://app.luzmo.com` or `https://app.us.luzmo.com`
- Proxy root paths `/0.1.0` and `/realtime` from the local app origin to the matching Luzmo API host

Do not proxy or rewrite `appServer` under a sub-path. Flex and dashboard bundles are loaded from `appServer`; sub-path proxying can break module loading.

## Why This Works

Flex opens a credentialed realtime connection at `<apiHost>/realtime`. A direct `localhost` to `api.luzmo.com` credentialed browser request can fail CORS when the response uses a wildcard origin. Routing `/realtime` and `/0.1.0` through the app's own origin makes those browser requests same-origin while still sending them to the Luzmo API host from the dev server.

The realtime socket anchors at the root path `/realtime`; it does not stay under an arbitrary sub-path. Proxy the root path exactly.

## Express Example

```js
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_HOST = process.env.LUZMO_API_HOST || 'https://api.luzmo.com';

const realtimeProxy = createProxyMiddleware({
  target: API_HOST,
  changeOrigin: true,
  ws: true,
  pathFilter: path => path.startsWith('/realtime'),
});

const apiProxy = createProxyMiddleware({
  target: API_HOST,
  changeOrigin: true,
  pathFilter: path => path.startsWith('/0.1.0'),
});

app.use(realtimeProxy);
app.use(apiProxy);

const server = app.listen(PORT);
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/realtime')) {
    realtimeProxy.upgrade(req, socket, head);
  }
});
```

**Gotcha — register the proxies BEFORE any body parser.** If `express.json()` (or any body-parsing middleware) runs before these proxies, it consumes the POST request stream; the Flex component's data POSTs to `/0.1.0` then arrive empty and hang (504), silently breaking chart rendering. GET `/realtime` is unaffected, so it's easy to miss. Mount the proxies first and scope `express.json()` to your own `/api/*` routes.

Frontend component configuration:

```js
const apiHost = window.location.origin;
const appServer = 'https://app.luzmo.com'; // or https://app.us.luzmo.com
```

## Vite Example

```js
// vite.config.js
import { defineConfig } from 'vite';

const API_HOST = process.env.LUZMO_API_HOST || 'https://api.luzmo.com';

export default defineConfig({
  server: {
    proxy: {
      '/0.1.0': {
        target: API_HOST,
        changeOrigin: true,
      },
      '/realtime': {
        target: API_HOST,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
```

## Production

For production custom domains, use the documented same-domain/CNAME setup for the Luzmo API host. Do not ship a development proxy as the long-term production architecture unless your backend team intentionally owns and operates it.
