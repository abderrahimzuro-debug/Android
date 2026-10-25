import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom lacks several browser APIs used by the app. These stubs keep tests
// focused on behaviour; the real implementations run in a browser.
const context2d = new Proxy({}, {
  get: (_target, prop) => {
    if (prop === 'canvas') return null;
    if (prop === 'measureText') return () => ({ width: 10 });
    return () => undefined;
  },
  set: () => true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () => context2d,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  writable: true,
  value: () => 'data:image/jpeg;base64,AAAA',
});
Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 400 });
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  writable: true,
  value: () => Promise.resolve(),
});
Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:test' });
Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => undefined });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = 'en';
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

if (!('ResizeObserver' in window)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock });
}
