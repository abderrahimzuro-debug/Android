import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, ocrConfigProblems, ocrConfigured } from './config.mjs';
import { OcrServiceError, callOcrProvider, validateImage } from './ocr.mjs';

const app = express();
const httpServer = http.createServer(app);
const dist = path.join(config.root, 'dist');
const configured = ocrConfigured();
const problems = ocrConfigProblems();

app.disable('x-powered-by');
// Only trust X-Forwarded-For from a loopback reverse proxy, so clients cannot
// spoof their IP to bypass the OCR rate limit.
app.set('trust proxy', 'loopback');

if (!config.dev) {
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });
}

app.use(express.json({ limit: `${Math.ceil(config.ocr.maxBodyBytes / 1024)}kb`, strict: true }));

// Very small in-memory rate limiter (single-process deployments). No user data stored.
const hits = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const windowStart = now - config.ocr.rateWindowMs;
  const recent = (hits.get(key) || []).filter((time) => time > windowStart);
  if (recent.length >= config.ocr.rateMax) {
    return res.status(429).json({ code: 'ocr.rateLimited', configured, provider: config.ocr.provider });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => t <= windowStart)) hits.delete(k);
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'MathFlow', version: '1.0.0', ocrConfigured: configured });
});

/** Reports readiness only — never returns keys, endpoints or other secrets. */
app.get('/api/ocr/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    configured,
    provider: configured ? config.ocr.provider : null,
    message: configured ? 'Image recognition is available.' : 'Image recognition is not configured on this server.',
  });
});

app.post('/api/ocr', rateLimit, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured) {
    return res.status(503).json({ code: 'ocr.notConfigured', message: 'OCR credentials are not configured.' });
  }
  let image;
  try {
    image = validateImage(req.body?.image);
  } catch (error) {
    const e = error instanceof OcrServiceError ? error : new OcrServiceError('ocr.badImage', 400);
    return res.status(e.status).json({ code: e.code });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ocr.timeoutMs);
  let cancelled = false;
  // `close` on the *response* means the client disconnected. Using req here
  // would abort as soon as the request body finishes being read.
  res.on('close', () => { if (!res.writableEnded) { cancelled = true; controller.abort(); } });
  try {
    const result = await callOcrProvider(image.dataUrl, controller.signal);
    if (cancelled) return;
    res.json({ latex: result.latex, confidence: result.confidence, provider: config.ocr.provider });
  } catch (error) {
    if (cancelled) return;
    const e = error instanceof OcrServiceError ? error : new OcrServiceError('ocr.unknown', 502);
    // Log only a short, non-sensitive diagnostic. Never log the image or the response body.
    console.warn(`[ocr] ${e.code}${e.detail ? ` (${e.detail})` : ''}`);
    res.status(e.status).json({ code: e.code });
  } finally {
    clearTimeout(timer);
  }
});

// Unknown API routes return JSON rather than the SPA shell.
app.use('/api', (_req, res) => res.status(404).json({ code: 'ocr.unknown' }));

if (config.dev) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: config.root,
    appType: 'custom',
    server: { middlewareMode: true, allowedHosts: true, hmr: { server: httpServer } },
  });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      let html = await fs.readFile(path.join(config.root, 'index.html'), 'utf8');
      html = await vite.transformIndexHtml(req.originalUrl, html);
      res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
} else {
  let distExists = false;
  try { await fs.access(path.join(dist, 'index.html')); distExists = true; } catch { /* built files missing */ }

  if (!distExists) {
    app.get('*path', (_req, res) => {
      res.status(503).type('text/plain').send('MathFlow has not been built yet. Run `npm run build` then restart the server.');
    });
  } else {
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(path.join(dist, 'sw.js'));
    });
    app.get('/manifest.webmanifest', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.type('application/manifest+json').sendFile(path.join(dist, 'manifest.webmanifest'));
    });
    app.use(express.static(dist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }));
    app.get('*path', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
}

// Friendly JSON errors for malformed bodies instead of Express' HTML page.
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error?.type === 'entity.too.large') return res.status(413).json({ code: 'ocr.tooLarge' });
  if (error instanceof SyntaxError) return res.status(400).json({ code: 'ocr.badImage' });
  console.error('[server]', error?.message || error);
  return res.status(500).json({ code: 'ocr.unknown' });
});

httpServer.listen(config.port, config.host, () => {
  console.log(`MathFlow ${config.dev ? 'dev server' : 'production server'} listening on http://${config.host}:${config.port}`);
  if (configured) console.log(`OCR provider: ${config.ocr.provider} (keys kept server-side)`);
  else console.log(`OCR disabled — configure it in .env (${problems.join('; ') || 'no credentials'})`);
});
