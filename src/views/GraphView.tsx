import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Translator } from '../i18n';
import { solve } from '../lib/math/solve';
import { GraphCanvas } from '../components/GraphCanvas';
import { Icon } from '../components/Icons';

const PRESETS = ['y=x^2−4', 'y=sin(x)', 'y=1/x', 'y=√(x)', 'y=ln(x)', 'x^2−4=0', 'y=2x+1', 'y=x^3−x'];

interface Props {
  t: Translator;
  themeKey: string;
  input: string;
  onInputChange: (value: string) => void;
  onSolveInput: (expression: string) => void;
}

export function GraphView({ t, themeKey, input, onInputChange, onSolveInput }: Props) {
  const [draft, setDraft] = useState(input);
  useEffect(() => { setDraft(input); }, [input]);
  const result = useMemo(() => {
    const expression = draft.trim();
    if (!expression) return null;
    try { return solve(expression.startsWith('y') || expression.includes('=') ? expression : `y = ${expression}`); }
    catch { return null; }
  }, [draft]);
  const spec = result?.graph ?? null;

  const plot = (value: string) => {
    setDraft(value);
    onInputChange(value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') plot(draft);
  };

  return (
    <div>
      <div className="view-header">
        <span className="eyebrow">{t('nav.graph')}</span>
        <h1>{t('graph.title')}</h1>
        <p>{t('graph.subtitle')}</p>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <label className="input-label" htmlFor="graph-input">{t('graph.inputLabel')}</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            id="graph-input" className="math-input math" data-testid="graph-input"
            style={{ flex: '1 1 240px', minHeight: 52, padding: '12px 14px', fontSize: 20, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)' }}
            value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown}
            placeholder={t('graph.placeholder')} spellCheck={false} autoCorrect="off"
          />
          <button type="button" className="button primary" onClick={() => plot(draft)} data-testid="graph-plot">
            <Icon name="graph" size={16} />{t('graph.plot')}
          </button>
          <button type="button" className="button" onClick={() => onSolveInput(draft)}>
            <Icon name="solve" size={16} />{t('common.solve')}
          </button>
        </div>
        <div className="section-head" style={{ margin: '18px 0 10px' }}><h2>{t('graph.presets')}</h2></div>
        <div className="chips">
          {PRESETS.map((preset) => (
            <button type="button" className="chip math" key={preset} onClick={() => plot(preset)}>{preset}</button>
          ))}
        </div>
      </section>

      {spec ? (
        <GraphCanvas spec={spec} t={t} themeKey={themeKey} large />
      ) : (
        <div className="card empty-state">
          <div className="empty-icon"><Icon name="graph" size={34} /></div>
          <h3>{t('graph.empty')}</h3>
          {result?.type === 'error' && <p>{t('errors.internal')}</p>}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>{t('notes.approxGraph')}</p>
    </div>
  );
}
