interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** True when running inside a native Capacitor APK (not a browser tab). */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installListeners.forEach((l) => l(false));
  });
}

export function onInstallAvailability(listener: (available: boolean) => void): () => void {
  installListeners.add(listener);
  listener(Boolean(deferredInstallPrompt));
  return () => installListeners.delete(listener);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;
  const prompt = deferredInstallPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  deferredInstallPrompt = null;
  installListeners.forEach((l) => l(false));
  return choice.outcome === 'accepted';
}

/** Registers the generated service worker in production builds only. */
export function registerServiceWorker(onUpdate: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((registration) => {
      registration.addEventListener('updatefound', () => {
        const incoming = registration.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) onUpdate();
        });
      });
      // Check for a new version when returning to the tab.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => {});
      });
    }).catch(() => { /* Offline first load or unsupported browser: app still works online. */ });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export function applyUpdate(): void {
  navigator.serviceWorker?.getRegistration().then((registration) => {
    if (!registration?.waiting) { window.location.reload(); return; }
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }).catch(() => window.location.reload());
}
