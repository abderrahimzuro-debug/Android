import { useMemo, useState } from 'react';
import type { Language, Translator } from '../i18n';
import type { HistoryEntry } from '../lib/storage';
import { Icon } from '../components/Icons';

interface Props {
  t: Translator;
  language: Language;
  history: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: () => void;
  onCopy: (text: string) => void;
  onShare: (entry: HistoryEntry) => void;
}

function groupFor(timestamp: number): 'today' | 'yesterday' | 'earlier' {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfToday) return 'today';
  if (timestamp >= startOfToday - 86400000) return 'yesterday';
  return 'earlier';
}

export function HistoryView({ t, language, history, onOpen, onToggleFavorite, onDelete, onClear, onExport, onCopy, onShare }: Props) {
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => history.filter((entry) => {
    if (filter === 'favorites' && !entry.favorite) return false;
    return entry.expression.toLowerCase().includes(query.trim().toLowerCase())
      || entry.summary.toLowerCase().includes(query.trim().toLowerCase());
  }), [history, filter, query]);

  const groups = useMemo(() => {
    const map: Record<string, HistoryEntry[]> = { today: [], yesterday: [], earlier: [] };
    for (const entry of filtered) map[groupFor(entry.createdAt)].push(entry);
    return map;
  }, [filtered]);

  const formatter = new Intl.DateTimeFormat(language === 'ar' ? 'ar-DZ' : 'en', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });

  return (
    <div>
      <div className="view-header">
        <span className="eyebrow"><Icon name="history" size={14} style={{ verticalAlign: '-2px' }} /> {t('history.localOnly')}</span>
        <h1>{t('history.title')}</h1>
        <p>{t('history.subtitle')}</p>
      </div>

      <div className="toolbar-row">
        <div className="search-box">
          <Icon name="search" size={17} />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('history.search')} aria-label={t('history.search')} data-testid="history-search"
          />
        </div>
        <div className="segmented" role="group" aria-label={t('history.title')}>
          <button type="button" className={`segment ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>{t('history.all')}</button>
          <button type="button" className={`segment ${filter === 'favorites' ? 'active' : ''}`} onClick={() => setFilter('favorites')}>{t('history.favorites')}</button>
        </div>
      </div>

      <div className="toolbar-row">
        <button type="button" className="button small" onClick={onExport} disabled={history.length === 0}>
          <Icon name="download" size={15} />{t('history.export')}
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        {confirmClear ? (
          <>
            <span className="muted" style={{ fontSize: 12.5 }}>{t('history.clearConfirm')}</span>
            <button type="button" className="button small danger" onClick={() => { onClear(); setConfirmClear(false); }}>{t('common.yes')}</button>
            <button type="button" className="button small ghost" onClick={() => setConfirmClear(false)}>{t('common.cancel')}</button>
          </>
        ) : (
          <button type="button" className="button small danger" onClick={() => setConfirmClear(true)} disabled={history.length === 0}>
            <Icon name="trash" size={15} />{t('history.clear')}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state" data-testid="history-empty">
          <div className="empty-icon"><Icon name={query || filter === 'favorites' ? 'search' : 'history'} size={34} /></div>
          <h3>{query || filter === 'favorites' ? t('history.noResults') : t('history.empty')}</h3>
          <p>{query || filter === 'favorites' ? '' : t('history.emptyHint')}</p>
        </div>
      ) : (
        <div className="history-list">
          {(['today', 'yesterday', 'earlier'] as const).map((group) => groups[group].length > 0 && (
            <div key={group}>
              <div className="history-group-title">
                {group === 'today' ? t('common.today') : group === 'yesterday' ? t('common.yesterday') : t('common.earlier')}
              </div>
              {groups[group].map((entry) => (
                <div className="history-item" key={entry.id} data-testid="history-item">
                  <button type="button" className="history-main" onClick={() => onOpen(entry)}>
                    <div className="history-expression">{entry.expression}</div>
                    {entry.summary && <div className="history-summary">{entry.summary}</div>}
                    <div className="history-meta">
                      <span>{formatter.format(new Date(entry.createdAt))}</span>
                      <span>· {t(`history.source.${entry.source}`)}</span>
                    </div>
                  </button>
                  <div className="history-actions">
                    <button
                      type="button" className="icon-button" aria-label={t(entry.favorite ? 'common.unfavorite' : 'common.favorite')}
                      aria-pressed={entry.favorite} onClick={() => onToggleFavorite(entry.id)}
                      style={{ color: entry.favorite ? 'var(--accent)' : undefined }}
                    >
                      <Icon name="star" size={17} filled={entry.favorite} />
                    </button>
                    <button type="button" className="icon-button" aria-label={t('common.copy')} onClick={() => onCopy(entry.expression)}><Icon name="copy" size={16} /></button>
                    <button type="button" className="icon-button" aria-label={t('common.share')} onClick={() => onShare(entry)}><Icon name="share" size={16} /></button>
                    <button type="button" className="icon-button danger" aria-label={t('history.delete')} onClick={() => onDelete(entry.id)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
