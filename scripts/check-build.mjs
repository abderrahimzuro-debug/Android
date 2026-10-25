/** Smoke-checks the production bundle and the generated service worker. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const problems = [];

const required = ['index.html', 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];
for (const file of required) {
  try { await fs.access(path.join(dist, file)); } catch { problems.push(`missing dist/${file}`); }
}

const sw = await fs.readFile(path.join(dist, 'sw.js'), 'utf8');
if (!/const PRECACHE = \[/.test(sw)) problems.push('sw.js has no precache list');
if (!sw.includes("'/index.html'")) problems.push('sw.js does not precache the app shell');
if (!sw.includes("url.pathname.startsWith('/api/')")) problems.push('sw.js does not treat /api as network-only');
if (/Mathpix|app_key|API_KEY|apiKey|secret/i.test(sw)) problems.push('sw.js contains something that looks like a secret');

const assets = await fs.readdir(path.join(dist, 'assets')).catch(() => []);
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
const fonts = assets.filter((f) => f.endsWith('.woff2'));
if (js.length === 0) problems.push('no JavaScript bundles');
if (css.length === 0) problems.push('no CSS bundles');
if (fonts.length === 0) problems.push('no bundled fonts (offline typography would depend on the network)');
for (const asset of [...js, ...css, ...fonts]) {
  if (!sw.includes(`/assets/${asset}`)) problems.push(`sw.js does not precache assets/${asset}`);
}
const allJs = (await Promise.all(js.map((f) => fs.readFile(path.join(dist, 'assets', f), 'utf8')))).join('\n');
if (/MATHPIX_APP_KEY|OCR_API_KEY|app_key/.test(allJs)) problems.push('client bundle contains OCR credential names/values');
if (allJs.includes('Mathpix') && allJs.includes('app_key')) problems.push('client bundle contains upstream credentials');

if (problems.length) {
  console.error('[check-build] FAILED:');
  for (const problem of problems) console.error('  -', problem);
  process.exit(1);
}
console.log(`[check-build] OK — ${js.length} JS, ${css.length} CSS, ${fonts.length} fonts precached.`);
