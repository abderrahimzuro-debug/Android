import type { Language } from '../i18n';
import { detectLanguage } from '../i18n';
import type { ResultType } from './math/types';

export type Theme = 'system' | 'light' | 'dark';
export type EntrySource = 'keyboard' | 'camera' | 'example' | 'graph';

export interface Settings {
  language: Language;
  theme: Theme;
  showSteps: boolean;
  showGraph: boolean;
}

export interface HistoryEntry {
  id: string;
  expression: string;
  summary: string;
  createdAt: number;
  favorite: boolean;
  source: EntrySource;
  type: ResultType;
}

export const SETTINGS_KEY = 'mathflow.v1.settings';
export const HISTORY_KEY = 'mathflow.v1.history';
export const MAX_HISTORY = 200;

export function defaultSettings(): Settings {
  return { language: detectLanguage(), theme: 'system', showSteps: true, showGraph: true };
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function loadSettings(): Settings {
  const fallback = defaultSettings();
  const raw = safeParse<Partial<Settings>>(localStorage.getItem(SETTINGS_KEY), {});
  const language: Language = raw.language === 'ar' || raw.language === 'en' ? raw.language : fallback.language;
  const theme: Theme = ['system', 'light', 'dark'].includes(raw.theme ?? '') ? raw.theme as Theme : fallback.theme;
  return {
    language,
    theme,
    showSteps: typeof raw.showSteps === 'boolean' ? raw.showSteps : true,
    showGraph: typeof raw.showGraph === 'boolean' ? raw.showGraph : true,
  };
}

export function saveSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch { return false; }
}

function validEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<HistoryEntry>;
  return typeof e.id === 'string' && typeof e.expression === 'string'
    && typeof e.createdAt === 'number' && Number.isFinite(e.createdAt);
}

/** Tolerates corrupted/quota-limited storage instead of crashing the app. */
export function loadHistory(): HistoryEntry[] {
  const raw = safeParse<unknown>(localStorage.getItem(HISTORY_KEY), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(validEntry).map((e) => ({
    id: e.id,
    expression: e.expression,
    summary: typeof e.summary === 'string' ? e.summary : '',
    createdAt: e.createdAt,
    favorite: Boolean(e.favorite),
    source: (['keyboard', 'camera', 'example', 'graph'].includes(e.source ?? '')
      ? e.source : 'keyboard') as EntrySource,
    type: (['calculation', 'equation', 'function', 'error'].includes(e.type ?? '')
      ? e.type : 'calculation') as ResultType,
  })).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_HISTORY);
}

export function saveHistory(entries: HistoryEntry[]): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
    return true;
  } catch {
    // Retry with fewer entries so at least recent work survives a full quota.
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, Math.max(1, Math.floor(entries.length / 2)))));
    } catch { /* storage unavailable — keep in-memory state */ }
    return false;
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clearAllData(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch { /* ignore */ }
}

export function exportHistory(entries: HistoryEntry[]): string {
  return JSON.stringify({ app: 'MathFlow', version: 1, exportedAt: new Date().toISOString(), history: entries }, null, 2);
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
