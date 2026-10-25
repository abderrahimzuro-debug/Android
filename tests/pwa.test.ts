import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('installable PWA assets', () => {
  it('has a valid manifest with real, bundled icons', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'));
    expect(manifest.name).toContain('MathFlow');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of manifest.icons) {
      expect(fs.existsSync(path.join(root, 'public', icon.src))).toBe(true);
      expect(fs.statSync(path.join(root, 'public', icon.src)).size).toBeGreaterThan(1000);
    }
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true);
  });

  it('has an app shell that declares the manifest, theme and viewport', () => {
    const html = read('index.html');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('id="root"');
  });

  it('generates a service worker that precaches assets and never caches OCR', () => {
    const generator = read('scripts/build-sw.mjs');
    expect(generator).toContain("'/index.html'");
    expect(generator).toContain("url.pathname.startsWith('/api/')");
    expect(generator).toContain('OFFLINE_PAGE');
    expect(generator).toContain('self.clients.claim()');
    expect(generator).toContain('PRECACHE');
    if (fs.existsSync(path.join(root, 'dist', 'sw.js'))) {
      const sw = read('dist/sw.js');
      const assets = fs.readdirSync(path.join(root, 'dist', 'assets'));
      for (const asset of assets) expect(sw).toContain(`/assets/${asset}`);
      expect(sw).not.toMatch(/app_key|MATHPIX_APP_KEY|OCR_API_KEY/);
    }
  });
});
