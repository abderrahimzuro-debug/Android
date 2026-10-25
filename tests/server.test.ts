import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hasBuild = fs.existsSync(path.join(root, 'dist', 'index.html'));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() - start > timeoutMs) throw new Error(`Server did not start: ${url}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

let plain: ChildProcess | null = null;
let proxy: ChildProcess | null = null;
let upstream: http.Server | null = null;
let plainPort = 0;
let proxyPort = 0;

const TINY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let upstreamSawKey = false;
let upstreamSawImage = false;

describe.skipIf(!hasBuild)('production server + secure OCR proxy', () => {
  beforeAll(async () => {
    plainPort = await freePort();
    proxyPort = await freePort();
    const upstreamPort = await freePort();
    upstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (req.headers.authorization !== 'Bearer test-secret') {
          res.writeHead(401, { 'Content-Type': 'application/json' }).end('{}');
          return;
        }
        upstreamSawKey = true;
        try {
          const parsed = JSON.parse(body);
          upstreamSawImage = /^data:image\/(png|jpeg|webp);base64,/.test(parsed.image);
        } catch { upstreamSawImage = false; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ latex: '2x + 3 = 11', confidence: 0.93 }));
      });
    });
    await new Promise<void>((resolve) => upstream!.listen(upstreamPort, '127.0.0.1', resolve));

    const baseEnv = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1' };
    plain = spawn(process.execPath, ['server/index.mjs'], {
      cwd: root, env: { ...baseEnv, PORT: String(plainPort), OCR_PROVIDER: 'mathpix', MATHPIX_APP_ID: '', MATHPIX_APP_KEY: '', OCR_ENDPOINT: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proxy = spawn(process.execPath, ['server/index.mjs'], {
      cwd: root,
      env: {
        ...baseEnv, PORT: String(proxyPort), OCR_PROVIDER: 'custom', OCR_API_KEY: 'test-secret',
        OCR_ENDPOINT: `http://127.0.0.1:${upstreamPort}/ocr`, MATHPIX_APP_ID: '', MATHPIX_APP_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await Promise.all([waitFor(`http://127.0.0.1:${plainPort}/api/health`), waitFor(`http://127.0.0.1:${proxyPort}/api/health`)]);
  }, 30000);

  afterAll(async () => {
    plain?.kill('SIGTERM');
    proxy?.kill('SIGTERM');
    await new Promise<void>((resolve) => upstream?.close(() => resolve()) ?? resolve());
  });

  it('serves the app shell, hashed assets, manifest and service worker', async () => {
    const base = `http://127.0.0.1:${plainPort}`;
    const html = await (await fetch(base)).text();
    expect(html).toContain('id="root"');
    expect(html).toContain('manifest.webmanifest');
    const jsFile = fs.readdirSync(path.join(root, 'dist', 'assets')).find((f) => f.endsWith('.js'));
    expect((await fetch(`${base}/assets/${jsFile}`)).status).toBe(200);
    expect((await fetch(`${base}/manifest.webmanifest`)).headers.get('content-type')).toContain('manifest+json');
    const sw = await fetch(`${base}/sw.js`);
    expect(sw.status).toBe(200);
    expect(sw.headers.get('cache-control')).toContain('no-cache');
    expect(await sw.text()).toContain('PRECACHE');
  });

  it('reports OCR status without leaking credentials', async () => {
    const response = await fetch(`http://127.0.0.1:${plainPort}/api/ocr/status`);
    const body = await response.json();
    expect(body.configured).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/app_key|test-secret|MATHPIX/i);
  });

  it('returns a clear error instead of faking recognition when unconfigured', async () => {
    const response = await fetch(`http://127.0.0.1:${plainPort}/api/ocr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: TINY_IMAGE }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'ocr.notConfigured' });
  });

  it('rejects bad images before contacting the upstream provider', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/ocr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'hello' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'ocr.badImage' });
  });

  it('proxies a real OCR result using server-side credentials', async () => {
    const response = await fetch(`http://127.0.0.1:${proxyPort}/api/ocr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: TINY_IMAGE }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ latex: '2x + 3 = 11', confidence: 0.93, provider: 'custom' });
    expect(JSON.stringify(body)).not.toContain('test-secret');
    expect(upstreamSawKey).toBe(true);
    expect(upstreamSawImage).toBe(true);
  });
});
