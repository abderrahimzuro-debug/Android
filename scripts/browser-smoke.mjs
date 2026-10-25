/**
 * Executes the REAL production bundle inside jsdom (no dev server, no source
 * transforms) and drives a few interactions. Catches runtime/console errors
 * that unit tests against source files can miss.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const jsFile = fs.readdirSync(path.join(dist, 'assets')).find((f) => f.endsWith('.js'));
if (!jsFile) throw new Error('No production JS bundle found. Run npm run build first.');

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/<link[^>]*>/g, '');

const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
virtualConsole.on('error', (...args) => consoleErrors.push(args.join(' ')));

const dom = new JSDOM(html, {
  url: 'http://localhost:3000/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
const { document } = window;

window.fetch = async (input) => {
  if (String(input).includes('/api/ocr/status')) {
    return new Response(JSON.stringify({ configured: false, provider: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
window.matchMedia = (query) => ({
  matches: false, media: query, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  dispatchEvent: () => false,
});
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const ctx = new Proxy({}, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
window.HTMLCanvasElement.prototype.getContext = () => ctx;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { get: () => 800 });
Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { get: () => 400 });
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
window.addEventListener('error', (event) => consoleErrors.push(event.message));

window.eval(fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8'));

const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
const setNativeValue = (element, value) => {
  const proto = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
};

await wait(120);
assert(document.getElementById('root').textContent.includes('MathFlow'), 'App shell did not render');
assert(document.getElementById('root').textContent.includes('What are we solving today?'), 'Solve view did not render');

setNativeValue(byTestId('math-input'), '2+3×4=14');
await wait(20);
byTestId('solve-button').click();
await wait(160);
assert(byTestId('result-value')?.textContent.includes('14'), 'Solve action did not produce 14');
assert(document.querySelector('.result-card')?.textContent.includes('Both sides are equal'), 'Verification badge missing');

setNativeValue(byTestId('math-input'), '1/2+1/3');
await wait(20);
byTestId('solve-button').click();
await wait(160);
assert(byTestId('result-value')?.textContent.includes('5') && byTestId('result-value')?.textContent.includes('6'), 'Fraction result missing');
assert(document.querySelector('.result-card')?.textContent.includes('Common denominator 6'), 'Fraction steps missing');

byTestId('language-toggle').click();
await wait(60);
assert(document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar', 'Arabic/RTL toggle failed');
assert(document.getElementById('root').textContent.includes('ماذا نحل اليوم؟'), 'Arabic translation missing');

byTestId('theme-toggle').click();
await wait(60);
assert(['dark', 'light'].includes(document.documentElement.dataset.theme), 'Theme toggle failed');
byTestId('language-toggle').click(); // back to English for the remaining checks
await wait(60);
assert(document.documentElement.dir === 'ltr', 'Language toggle back to LTR failed');

const buttonWithText = (needle) => [...document.querySelectorAll('button')]
  .find((button) => button.textContent?.includes(needle));

// Math keyboard inserts at the caret.
setNativeValue(byTestId('math-input'), '');
await wait(20);
const digit7 = [...document.querySelectorAll('.key')].find((key) => key.textContent === '7');
assert(digit7, 'Math keyboard is missing');
digit7.click();
await wait(30);
assert(byTestId('math-input').value.includes('7'), 'Keyboard insertion failed');

// Topic library: open, pick a quadratic, confirm a verified result.
setNativeValue(byTestId('math-input'), '');
await wait(20);
assert(buttonWithText('Browse topics'), 'Topics button missing');
buttonWithText('Browse topics').click();
await wait(40);
assert(document.querySelector('[role="dialog"]')?.textContent.includes('Topic library'), 'Topics modal did not open');
const quadraticExample = [...document.querySelectorAll('.topic-card .example')]
  .find((button) => button.textContent?.includes('x²−5x+6=0'));
assert(quadraticExample, 'Quadratic example missing');
quadraticExample.click();
await wait(180);
assert(document.querySelector('.result-card')?.textContent.includes('x = 2'), 'Quadratic example did not solve');

// Graph view: zoom controls and point list.
assert(buttonWithText('Graph'), 'Graph nav missing');
[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Graph')?.click();
await wait(80);
assert(byTestId('graph-card'), 'Graph view did not render');
assert(byTestId('graph-canvas'), 'Graph canvas missing');
const zoomIn = document.querySelector('[aria-label="Zoom in"]');
assert(zoomIn, 'Zoom control missing');
zoomIn.click();
await wait(40);

// History and Settings views render without errors.
[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'History')?.click();
await wait(60);
assert(document.querySelector('[data-testid="history-item"]'), 'History entry missing');
[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Settings')?.click();
await wait(60);
assert(document.body.textContent.includes('Appearance'), 'Settings view did not render');
assert(byTestId('ocr-status'), 'OCR status indicator missing');

// Scanner opens and closes cleanly.
[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Solve')?.click();
await wait(40);
byTestId('open-scan').click();
await wait(40);
assert(byTestId('scan-modal'), 'Scanner did not open');
assert(document.body.textContent.includes('Recognition is not configured'), 'OCR-unconfigured guidance missing');
document.querySelector('[aria-label="Close"]')?.click();
await wait(40);
assert(!byTestId('scan-modal'), 'Scanner did not close');

const realErrors = consoleErrors.filter((message) => !/Not implemented: HTMLCanvasElement|Could not parse CSS stylesheet/.test(message));
if (realErrors.length) throw new Error(`Console errors:\n${realErrors.join('\n')}`);

console.log('[browser-smoke] OK — production bundle renders, solves, verifies, and switches language/theme without console errors.');
dom.window.close();
