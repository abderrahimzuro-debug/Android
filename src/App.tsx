import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Language, Translator } from './i18n';
import { isRtl, translate } from './i18n';
import { solve, type MathResult } from './lib/math/solve';
import {
  MAX_HISTORY, clearAllData, defaultSettings, downloadText, exportHistory,
  loadHistory, loadSettings, newId, saveHistory, saveSettings,
  type EntrySource, type HistoryEntry, type Settings, type Theme,
} from './lib/storage';
import { fetchOcrStatus, type OcrStatus } from './lib/ocr';
import { copyText, shareContent } from './lib/share';
import { applyUpdate, initInstallPrompt, isStandalone, onInstallAvailability, promptInstall, registerServiceWorker } from './lib/pwa';
import { Icon, BrandMark, type IconName } from './components/Icons';
import { TopicsModal } from './components/TopicsModal';
import { SolveView } from './views/SolveView';
import { GraphView } from './views/GraphView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { ScanView } from './views/ScanView';

type View = 'solve' | 'graph' | 'history' | 'settings';
type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; key: string; tone: Tone; action?: 'update' }

const NAV: Array<{ id: View; icon: IconName }> = [
  { id: 'solve', icon: 'solve' },
  { id: 'graph', icon: 'graph' },
  { id: 'history', icon: 'history' },
  { id: 'settings', icon: 'settings' },
];

function summaryOf(result: MathResult): string {
  if (result.type === 'error') return '';
  const value = result.fraction ? `${result.fraction.numerator}/${result.fraction.denominator}` : result.result;
  return value.slice(0, 120);
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [view, setView] = useState<View>('solve');
  const [input, setInput] = useState('');
  const [graphInput, setGraphInput] = useState('y = x^2 − 4');
  const [result, setResult] = useState<MathResult | null>(null);
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus | null>(null);
  const [ocrStatusError, setOcrStatusError] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const toastId = useRef(0);
  const historyRef = useRef(history);
  historyRef.current = history;

  const t: Translator = useCallback((key, params) => translate(settings.language, key, params), [settings.language]);
  const resolvedTheme: Theme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  const themeKey = `${resolvedTheme}-${settings.language}`;

  const showToast = useCallback((key: string, tone: Tone = 'success', action?: 'update') => {
    const id = ++toastId.current;
    setToasts((items) => [...items.slice(-2), { id, key, tone, action }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), action ? 12000 : 3600);
  }, []);

  // Persist settings whenever they change.
  useEffect(() => { saveSettings(settings); }, [settings]);

  // Layout effect: the graph canvas reads CSS variables in a passive effect,
  // so the theme must be on <html> before child effects run.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.lang = settings.language;
    root.dir = isRtl(settings.language) ? 'rtl' : 'ltr';
    root.dataset.theme = resolvedTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', resolvedTheme === 'dark' ? '#071624' : '#0b1f31');
  }, [settings.language, resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener?.('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }, []);

  useEffect(() => {
    const onOnline = () => { setOnline(true); showToast('toast.online', 'success'); };
    const onOffline = () => { setOnline(false); showToast('toast.offline', 'info'); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [showToast]);

  const checkOcr = useCallback(async () => {
    setOcrStatusError(false);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      const status = await fetchOcrStatus(controller.signal);
      window.clearTimeout(timeout);
      setOcrStatus(status);
    } catch {
      setOcrStatus(null);
      setOcrStatusError(true);
    }
  }, []);

  useEffect(() => { void checkOcr(); }, [checkOcr, online]);

  // PWA shortcuts open /?view=solve|graph|scan|history|settings.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    if (requested === 'scan') setScanOpen(true);
    else if (['solve', 'graph', 'history', 'settings'].includes(requested ?? '')) setView(requested as View);
  }, []);

  useEffect(() => {
    initInstallPrompt();
    registerServiceWorker(() => {
      setUpdateAvailable(true);
      showToast('toast.updateAvailable', 'info', 'update');
    });
    return onInstallAvailability((available) => {
      setInstallAvailable(available);
      if (!available && isStandalone()) setInstalled(true);
    });
  }, [showToast]);

  const commitHistory = useCallback((next: HistoryEntry[]) => {
    historyRef.current = next;
    setHistory(next);
    if (!saveHistory(next)) showToast('toast.storageFull', 'error');
  }, [showToast]);

  const runSolve = useCallback((expression: string, source: EntrySource = 'keyboard') => {
    const trimmed = expression.trim();
    if (!trimmed) { showToast('errors.empty', 'error'); return; }
    setInput(trimmed);
    setBusy(true);
    // Yield once so the loading state can paint before the (synchronous) engine runs.
    window.setTimeout(() => {
      const computed = solve(trimmed);
      setResult(computed);
      setBusy(false);
      setView('solve');
      if (computed.type !== 'error') {
        const current = historyRef.current;
        const existing = current.find((entry) => entry.expression === trimmed);
        const entry: HistoryEntry = existing
          ? { ...existing, createdAt: Date.now(), summary: summaryOf(computed), type: computed.type }
          : { id: newId(), expression: trimmed, summary: summaryOf(computed), createdAt: Date.now(), favorite: false, source, type: computed.type };
        commitHistory([entry, ...current.filter((e) => e.id !== entry.id)].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY));
        setCurrentEntryId(entry.id);
      } else {
        setCurrentEntryId(null);
      }
    }, 30);
  }, [commitHistory, showToast]);

  const favorite = useMemo(
    () => currentEntryId ? Boolean(history.find((e) => e.id === currentEntryId)?.favorite) : false,
    [currentEntryId, history],
  );

  const toggleFavorite = useCallback(() => {
    if (currentEntryId) {
      const target = history.find((e) => e.id === currentEntryId);
      commitHistory(history.map((e) => e.id === currentEntryId ? { ...e, favorite: !e.favorite } : e));
      showToast(target?.favorite ? 'toast.favoriteRemoved' : 'toast.favoriteAdded', 'success');
      return;
    }
    // Favouriting a result that was not stored (e.g. an error) stores it explicitly.
    if (result) {
      const entry: HistoryEntry = {
        id: newId(), expression: result.input, summary: summaryOf(result),
        createdAt: Date.now(), favorite: true, source: 'keyboard', type: result.type,
      };
      commitHistory([entry, ...history].slice(0, MAX_HISTORY));
      setCurrentEntryId(entry.id);
      showToast('toast.favoriteAdded', 'success');
    }
  }, [currentEntryId, history, result, commitHistory, showToast]);

  const copyResult = useCallback(async () => {
    if (!result) return;
    showToast(await copyText(result.copyText) ? 'toast.copied' : 'toast.copyFailed', 'success');
  }, [result, showToast]);

  const shareResult = useCallback(async () => {
    if (!result) return;
    const outcome = await shareContent('MathFlow', result.copyText);
    if (outcome === 'shared') showToast('toast.shared', 'success');
    else if (outcome === 'unavailable') showToast('toast.shareFailed', 'error');
  }, [result, showToast]);

  const copyAny = useCallback(async (text: string) => {
    showToast(await copyText(text) ? 'toast.copied' : 'toast.copyFailed', 'success');
  }, [showToast]);

  const shareEntry = useCallback(async (entry: HistoryEntry) => {
    const outcome = await shareContent('MathFlow', `${entry.expression}\n${entry.summary}`);
    if (outcome === 'shared') showToast('toast.shared', 'success');
    else if (outcome === 'unavailable') showToast('toast.shareFailed', 'error');
  }, [showToast]);

  const exportData = useCallback(() => {
    downloadText('mathflow-history.json', exportHistory(history));
    showToast('toast.dataExported', 'success');
  }, [history, showToast]);

  const clearData = useCallback(() => {
    clearAllData();
    setHistory([]);
    setResult(null);
    setCurrentEntryId(null);
    setInput('');
    setSettings(defaultSettings());
    showToast('toast.historyCleared', 'success');
  }, [showToast]);

  const openGraph = useCallback(() => {
    if (result) setGraphInput(result.input);
    setView('graph');
  }, [result]);

  const pickExample = useCallback((expression: string) => {
    setTopicsOpen(false);
    setInput(expression);
    runSolve(expression, 'example');
  }, [runSolve]);

  const openEntry = useCallback((entry: HistoryEntry) => {
    setInput(entry.expression);
    setCurrentEntryId(entry.id);
    setView('solve');
    setBusy(true);
    window.setTimeout(() => {
      setResult(solve(entry.expression));
      setBusy(false);
    }, 20);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const cycleTheme = useCallback(() => {
    setSettings((current) => ({ ...current, theme: current.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const toggleLanguage = useCallback(() => {
    setSettings((current) => ({ ...current, language: current.language === 'en' ? 'ar' : 'en' }));
  }, []);

  const install = useCallback(async () => {
    const accepted = await promptInstall();
    if (accepted) { setInstalled(true); showToast('toast.installed', 'success'); }
  }, [showToast]);

  const checkUpdate = useCallback(async () => {
    if (updateAvailable) { applyUpdate(); return; }
    const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
    if (registration) await registration.update().catch(() => {});
    showToast('toast.updateAvailable', 'info');
  }, [updateAvailable, showToast]);

  const navButton = (id: View, icon: IconName, label: string, className: string) => (
    <button
      key={id} type="button" className={`${className} ${view === id ? 'active' : ''}`}
      aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}
    >
      <span className="nav-icon"><Icon name={icon} size={20} /></span>
      <span className="nav-label">{label}</span>
    </button>
  );

  return (
    <div className="app-shell">
      <a className="sr-only" href="#main-content">{t('nav.solve')}</a>

      <aside className="sidebar" aria-label={t('app.name')}>
        <div className="sidebar-brand">
          <BrandMark size={38} />
          <div className="brand-text">
            <div className="brand-name">MathFlow</div>
            <div className="brand-tagline">{t('app.tagline')}</div>
          </div>
        </div>
        <button type="button" className="sidebar-new" onClick={() => { setInput(''); setResult(null); setCurrentEntryId(null); setView('solve'); }} data-testid="new-problem">
          <Icon name="plus" size={18} /><span>{t('nav.newProblem')}</span>
        </button>
        <nav className="nav-list" aria-label={t('app.name')}>
          {NAV.map((item) => navButton(item.id, item.icon, t(`nav.${item.id}`), 'nav-item'))}
          <button type="button" className="nav-item" onClick={() => setScanOpen(true)}>
            <span className="nav-icon"><Icon name="camera" size={20} /></span>
            <span className="nav-label">{t('nav.scan')}</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <strong>{t('settings.limits')}</strong>
          {t('settings.limitsText')}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-brand"><BrandMark size={32} /><span className="brand-name">MathFlow</span></div>
          <span className="topbar-title">{t(`nav.${view}`)}</span>
          <div className="topbar-actions">
            <span className={`online-pill ${online ? '' : 'offline'}`} title={t(online ? 'header.online' : 'header.offlineDetail')} data-testid="online-pill">
              <Icon name={online ? 'online' : 'offline'} size={14} />
              <span>{t(online ? 'header.online' : 'header.offline')}</span>
            </span>
            <button
              type="button" className="icon-button" onClick={cycleTheme}
              aria-label={t('header.theme')} title={t('header.theme')} data-testid="theme-toggle"
            >
              <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <button
              type="button" className="icon-button" onClick={toggleLanguage}
              aria-label={t('header.language')} title={t('header.language')} data-testid="language-toggle"
            >
              <span style={{ fontSize: 12, fontWeight: 800 }}>{settings.language === 'en' ? 'ع' : 'EN'}</span>
            </button>
            <button type="button" className="icon-button" onClick={() => setView('settings')} aria-label={t('nav.settings')} title={t('nav.settings')}>
              <Icon name="settings" size={18} />
            </button>
          </div>
        </header>

        {!online && (
          <div style={{ padding: '12px clamp(16px, 4vw, 40px) 0', maxWidth: 'var(--content-max)', marginInline: 'auto', width: '100%' }}>
            <div className="banner offline" role="status" data-testid="offline-banner">
              <Icon name="offline" size={18} />
              <span><strong>{t('header.offline')}.</strong> {t('header.offlineDetail')}</span>
            </div>
          </div>
        )}

        <main className={`content ${view === 'graph' ? 'wide' : ''}`} id="main-content">
          {view === 'solve' && (
            <SolveView
              t={t} themeKey={themeKey} input={input} onInputChange={setInput}
              onSolve={() => runSolve(input, 'keyboard')} result={result} settings={settings}
              favorite={favorite} recent={history.slice(0, 4)} busy={busy}
              onCopy={copyResult} onShare={shareResult} onFavorite={toggleFavorite}
              onOpenGraph={openGraph} onOpenScan={() => setScanOpen(true)}
              onOpenTopics={() => setTopicsOpen(true)} onPickExample={pickExample}
              onPickRecent={openEntry}
            />
          )}
          {view === 'graph' && (
            <GraphView
              t={t} themeKey={themeKey} input={graphInput} onInputChange={setGraphInput}
              onSolveInput={(expression) => runSolve(expression, 'graph')}
            />
          )}
          {view === 'history' && (
            <HistoryView
              t={t} language={settings.language as Language} history={history}
              onOpen={openEntry}
              onToggleFavorite={(id) => {
                const target = history.find((e) => e.id === id);
                commitHistory(history.map((e) => e.id === id ? { ...e, favorite: !e.favorite } : e));
                showToast(target?.favorite ? 'toast.favoriteRemoved' : 'toast.favoriteAdded', 'success');
              }}
              onDelete={(id) => { commitHistory(history.filter((e) => e.id !== id)); showToast('toast.deleted', 'success'); }}
              onClear={() => { commitHistory([]); showToast('toast.historyCleared', 'success'); }}
              onExport={exportData} onCopy={copyAny} onShare={shareEntry}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              t={t} settings={settings} onChange={updateSettings} online={online}
              ocrStatus={ocrStatus} ocrStatusError={ocrStatusError} onCheckOcr={() => void checkOcr()}
              installAvailable={installAvailable} installed={installed} onInstall={() => void install()}
              updateAvailable={updateAvailable} onApplyUpdate={applyUpdate} onCheckUpdate={() => void checkUpdate()}
              onExport={exportData} onClearData={clearData}
            />
          )}
        </main>
      </div>

      <nav className="bottom-nav" aria-label={t('app.name')}>
        {NAV.slice(0, 2).map((item) => navButton(item.id, item.icon, t(`nav.${item.id}`), 'bottom-item'))}
        <button type="button" className="bottom-item scan" onClick={() => setScanOpen(true)} aria-label={t('nav.scan')} data-testid="bottom-scan">
          <span className="scan-fab"><Icon name="camera" size={23} /></span>
          <span className="label">{t('nav.scan')}</span>
        </button>
        {NAV.slice(2).map((item) => navButton(item.id, item.icon, t(`nav.${item.id}`), 'bottom-item'))}
      </nav>

      {topicsOpen && (
        <TopicsModal t={t} onPick={pickExample} onClose={() => setTopicsOpen(false)} />
      )}
      {scanOpen && (
        <ScanView
          t={t} online={online} ocrStatus={ocrStatus}
          onClose={() => setScanOpen(false)}
          onSolve={(expression) => { setScanOpen(false); runSolve(expression, 'camera'); }}
          onManual={(expression) => {
            setScanOpen(false);
            setView('solve');
            if (expression !== undefined) setInput(expression);
          }}
        />
      )}

      <div className="toast-region" aria-live="polite" data-testid="toast-region">
        {toasts.map((toast) => (
          <div className={`toast ${toast.tone}`} key={toast.id} role="status">
            <Icon name={toast.tone === 'error' ? 'alert' : toast.tone === 'info' ? 'info' : 'checkCircle'} size={16} />
            <span>{t(toast.key)}</span>
            {toast.action === 'update' && <button type="button" onClick={applyUpdate}>{t('settings.reload')}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
