import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Translator } from '../i18n';
import type { MathResult } from '../lib/math/types';
import type { HistoryEntry, Settings } from '../lib/storage';
import { MathKeyboard, type KeyInsert } from '../components/MathKeyboard';
import { ResultCard } from '../components/ResultCard';
import { QUICK_EXAMPLES } from '../components/TopicsModal';
import { Icon } from '../components/Icons';

interface Props {
  t: Translator;
  themeKey: string;
  input: string;
  onInputChange: (value: string) => void;
  onSolve: () => void;
  result: MathResult | null;
  settings: Settings;
  favorite: boolean;
  recent: HistoryEntry[];
  busy: boolean;
  onCopy: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onOpenGraph: () => void;
  onOpenScan: () => void;
  onOpenTopics: () => void;
  onPickExample: (expression: string) => void;
  onPickRecent: (entry: HistoryEntry) => void;
}

export function SolveView(props: Props) {
  const { t, input, onInputChange, onSolve, result, settings, recent } = props;
  const [keyboardOpen, setKeyboardOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);

  const insert = ({ text, caretBack = 0 }: KeyInsert) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const next = input.slice(0, start) + text + input.slice(end);
    onInputChange(next);
    pendingCaret.current = start + text.length - caretBack;
    setTimeout(() => {
      const node = textareaRef.current;
      if (!node || pendingCaret.current === null) return;
      node.focus();
      node.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }, 0);
  };

  const backspace = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    if (start !== end) onInputChange(input.slice(0, start) + input.slice(end));
    else if (start > 0) onInputChange(input.slice(0, start - 1) + input.slice(start));
    setTimeout(() => {
      const pos = start !== end ? start : Math.max(0, start - 1);
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSolve();
    }
  };

  return (
    <div>
      <div className="hero">
        <span className="eyebrow"><Icon name="sparkles" size={14} style={{ verticalAlign: '-2px' }} /> {t('app.name')}</span>
        <h1>{t('solve.greeting')}</h1>
        <p>{t('solve.subtitle')}</p>
      </div>

      <section className="card input-card" aria-label={t('solve.inputLabel')}>
        <div className="input-card-head">
          <span className="input-label"><Icon name="solve" size={16} />{t('solve.inputLabel')}</span>
          <button
            type="button" className="button small ghost" aria-expanded={keyboardOpen}
            aria-label={t(keyboardOpen ? 'solve.hideKeyboard' : 'solve.showKeyboard')}
            onClick={() => setKeyboardOpen((v) => !v)}
          >
            <Icon name="keyboard" size={16} />
            <span className="hidden-sm">{t(keyboardOpen ? 'solve.hideKeyboard' : 'solve.showKeyboard')}</span>
          </button>
        </div>
        <textarea
          ref={textareaRef} className="math-input math" value={input}
          onChange={(e) => onInputChange(e.target.value)} onKeyDown={onKeyDown}
          placeholder={t('solve.inputPlaceholder')} aria-label={t('solve.inputLabel')}
          spellCheck={false} autoCapitalize="off" autoCorrect="off" inputMode="text"
          data-testid="math-input" rows={2}
        />
        <div className="input-footer">
          <span className="input-hint">{t('solve.tip')}</span>
          <div className="input-actions">
            <button type="button" className="button small" onClick={props.onOpenScan} data-testid="open-scan">
              <Icon name="camera" size={16} />{t('solve.scan')}
            </button>
            <button type="button" className="button small" onClick={() => onInputChange('')}>
              <Icon name="close" size={15} />{t('common.clear')}
            </button>
            <button type="button" className="button primary" onClick={onSolve} disabled={props.busy || !input.trim()} data-testid="solve-button">
              {props.busy ? <span className="spinner" /> : <Icon name="arrowRight" size={17} />}
              {t('solve.solveButton')}
            </button>
          </div>
        </div>
        {keyboardOpen && (
          <div style={{ padding: '0 16px 16px' }}>
            <MathKeyboard
              t={t} onInsert={insert} onBackspace={backspace}
              onClear={() => { onInputChange(''); textareaRef.current?.focus(); }}
              onSolve={onSolve}
            />
          </div>
        )}
      </section>

      <div className="section-head">
        <h2>{t('solve.examples')}</h2>
        <button type="button" className="button small ghost" onClick={props.onOpenTopics}>
          <Icon name="book" size={15} />{t('solve.topics')}
        </button>
      </div>
      <div className="chips">
        {QUICK_EXAMPLES.map((example) => (
          <button type="button" className="chip math" key={example} onClick={() => props.onPickExample(example)}>
            {example}
          </button>
        ))}
      </div>

      <div className="section-head"><h2>{t('result.workspace')}</h2></div>
      {props.busy && (
        <div className="card" role="status"><span className="spinner" /> {t('solve.processing')}</div>
      )}
      {!props.busy && result && (
        <ResultCard
          result={result} t={t} themeKey={props.themeKey}
          showSteps={settings.showSteps} showGraph={settings.showGraph}
          favorite={props.favorite} onCopy={props.onCopy} onShare={props.onShare}
          onFavorite={props.onFavorite} onOpenGraph={props.onOpenGraph}
        />
      )}
      {!props.busy && !result && (
        <div className="card empty-state" data-testid="empty-result">
          <div className="empty-icon"><Icon name="sparkles" size={34} /></div>
          <h3>{t('solve.emptyResult')}</h3>
          <p>{t('solve.emptyResultHint')}</p>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="section-head"><h2>{t('solve.recent')}</h2></div>
          <div className="chips">
            {recent.map((entry) => (
              <button type="button" className="chip math" key={entry.id} onClick={() => props.onPickRecent(entry)}>
                {entry.expression}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
