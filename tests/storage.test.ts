import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_KEY, SETTINGS_KEY, clearAllData, exportHistory, loadHistory, loadSettings,
  saveHistory, saveSettings, type HistoryEntry,
} from '../src/lib/storage';

const entry = (id: string, favorite = false): HistoryEntry => ({
  id, expression: `${id} + 1`, summary: 'result', createdAt: Date.now(),
  favorite, source: 'keyboard', type: 'calculation',
});

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('persistent settings and history', () => {
  it('round-trips settings and uses safe defaults', () => {
    expect(loadSettings().theme).toBe('system');
    expect(loadSettings().showSteps).toBe(true);
    saveSettings({ language: 'ar', theme: 'dark', showSteps: false, showGraph: false });
    expect(loadSettings()).toEqual({ language: 'ar', theme: 'dark', showSteps: false, showGraph: false });
  });

  it('survives corrupted local storage', () => {
    localStorage.setItem(SETTINGS_KEY, '{broken');
    localStorage.setItem(HISTORY_KEY, '{"not":"an array"}');
    expect(loadSettings().language).toBe('en');
    expect(loadHistory()).toEqual([]);
  });

  it('filters malformed history entries and keeps newest first', () => {
    const older = { ...entry('a'), createdAt: 1000 };
    const newer = { ...entry('b'), createdAt: 2000 };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([older, { garbage: true }, newer]));
    const loaded = loadHistory();
    expect(loaded.map((e) => e.id)).toEqual(['b', 'a']);
    expect(loaded[0].source).toBe('keyboard');
  });

  it('caps history and survives a full quota', () => {
    const many = Array.from({ length: 260 }, (_, i) => ({ ...entry(String(i)), createdAt: i }));
    expect(saveHistory(many)).toBe(true);
    expect(loadHistory()).toHaveLength(200);

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockImplementationOnce(() => { throw new DOMException('QuotaExceededError'); });
    setItem.mockImplementationOnce(() => { throw new DOMException('QuotaExceededError'); });
    expect(saveHistory([entry('x')])).toBe(false);
  });

  it('exports JSON and clears all data', () => {
    saveSettings({ language: 'ar', theme: 'dark', showSteps: true, showGraph: true });
    saveHistory([entry('a', true)]);
    const exported = JSON.parse(exportHistory(loadHistory()));
    expect(exported.app).toBe('MathFlow');
    expect(exported.history[0].favorite).toBe(true);
    clearAllData();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(loadHistory()).toEqual([]);
  });
});
