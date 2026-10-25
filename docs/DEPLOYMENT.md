# Deployment guide

MathFlow is one Node.js process that serves:

1. the built SPA (`dist/`) — completely static, precached by the service worker;
2. `/api/ocr/status` and `/api/ocr` — the only server-side logic, holding the
   OCR credentials.

Because the frontend and API share one origin, there is no CORS configuration
and no browser-visible key.

---

## 1. Build

```bash
git clone <your-repo> && cd Android
npm ci
npm run build        # typecheck + Vite build + dist/sw.js generation
node scripts/check-build.mjs
```

Copy `dist/`, `server/`, `package.json`, `package-lock.json` and (optionally)
`.env` to the host. `npm ci --omit=dev` is fine **at runtime**; devDependencies
are only needed for `npm run build`.

---

## 2. Run

```bash
NODE_ENV=production PORT=3000 HOST=0.0.0.0 npm start
```

Environment variables (all optional except OCR credentials for scanning):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address (keep `0.0.0.0` behind a reverse proxy) |
| `OCR_PROVIDER` | `mathpix` | `mathpix` or `custom` |
| `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` | — | Mathpix credentials, server-side only |
| `OCR_ENDPOINT` | Mathpix `/v3/text` | Custom endpoint override (HTTPS, or localhost HTTP) |
| `OCR_API_KEY` | — | Bearer token for the custom provider |
| `OCR_TIMEOUT_MS` | `25000` | Upstream timeout |
| `OCR_MAX_IMAGE_BYTES` | `8388608` | Max decoded image size (8 MB) |
| `OCR_RATE_LIMIT` / `OCR_RATE_WINDOW_MS` | `20` / `600000` | Per-IP request budget |

Check the deployment:

```bash
curl -s https://your-domain/api/health
# {"ok":true,"app":"MathFlow","version":"1.0.0","ocrConfigured":true}
curl -s https://your-domain/api/ocr/status
# {"configured":true,"provider":"mathpix", ...}   ← no secrets
```

### systemd unit

```ini
[Unit]
Description=MathFlow PWA
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/mathflow
EnvironmentFile=/srv/mathflow/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /srv/mathflow/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now mathflow`.

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
EXPOSE 3000
CMD ["node", "server/index.mjs"]
```

Pass secrets with `--env-file .env` (do **not** bake `.env` into the image).
Mount nothing writable: the app stores no photos and no user data server-side.

### Render / Railway / Fly.io

- Build command: `npm ci && npm run build`
- Start command: `NODE_ENV=production npm start`
- Set `PORT` if the platform injects one (MathFlow reads it automatically).
- Add the OCR variables in the platform's secret manager, not in the repo.
- Health check path: `/api/health`.

---

## 3. HTTPS is required

Camera capture (`getUserMedia`), service workers and installation require a
secure context. Terminate TLS at Nginx/Caddy/the platform edge, then proxy to
port 3000. Minimal Nginx block:

```nginx
server {
  listen 443 ssl http2;
  server_name mathflow.example.com;

  ssl_certificate     /etc/letsencrypt/live/mathflow.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/mathflow.example.com/privkey.pem;

  client_max_body_size 12m;   # OCR images are capped at 8 MB by the server

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Upgrade $http_upgrade;   # only needed for Vite dev
    proxy_set_header   Connection "upgrade";   # only needed for Vite dev
  }
}
```

The production server already sets a Content-Security-Policy, `nosniff`,
referrer and permissions policies. If you add your own CSP, keep
`script-src 'self'`, `style-src 'self' 'unsafe-inline'` (React uses inline
`style` attributes), `img-src 'self' data: blob:`, `connect-src 'self'` and
`worker-src 'self'`.

---

## 4. Static frontend + separate OCR backend (advanced)

The SPA can be hosted on any static host (Netlify, Cloudflare Pages, S3). In
that case:

- Deploy `server/` separately on Node and set an environment variable/base URL
  for the API; the client currently uses same-origin relative `/api/...` URLs,
  so either reverse-proxy `/api/*` on the static host to the Node service
  (recommended) or change `src/lib/ocr.ts` to use an absolute API base.
- Ensure `/sw.js` and `/manifest.webmanifest` are served with the correct MIME
  types and that `/sw.js` is **not** cached long-term (`no-cache`).
- All other paths should fall back to `index.html` for client-side navigation.
- The static host must serve the precached hashed assets immutably
  (`Cache-Control: public, max-age=31536000, immutable`).

---

## 5. Updates and caching

`npm run build` regenerates `dist/sw.js` with a new cache version derived from
the asset list. The service worker cleans old caches on activation and the UI
offers **Update now** when a new version is ready. Users must reload once to
get the new assets; navigation is network-first, so a reload on a working
connection picks up the new shell immediately.

If you change the OCR configuration, restart the Node process — configuration
is read once at startup. The SPA does not need rebuilding for config changes.

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| "Recognition is not configured" | No OCR credentials in the server environment; restart the server after editing `.env`. |
| Camera blocked on a deployment | Site is not HTTPS, or browser permission was denied. Upload an image or type the problem. |
| Offline mode not active | Service worker is only registered in production builds; use `npm run build && npm start` and load the app once while online. |
| Old version after deploy | Hard-reload once, or use Settings → Check for updates. Check `/sw.js` is served with `no-cache`. |
| OCR returns 413/429 | Image exceeds `OCR_MAX_IMAGE_BYTES`, or the per-IP rate limit was hit. |
| Logs show `[ocr] ocr.upstream` | The provider rejected the request (bad key, quota, unsupported image). The server never forwards the upstream body; check the provider dashboard. |
