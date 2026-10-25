import { useEffect, useState } from 'react';
import type { Translator } from '../i18n';
import type { MathResult } from '../lib/math/types';
import { GraphCanvas } from './GraphCanvas';
import { Icon } from './Icons';

interface Props {
  result: MathResult;
  t: Translator;
  themeKey: string;
  showSteps: boolean;
  showGraph: boolean;
  favorite: boolean;
  onCopy: () => void;
  onShare: () => void;
  onFavorite: () => void;
  onOpenGraph: () => void;
}

export function ResultCard({
  result, t, themeKey, showSteps, showGraph, favorite,
  onCopy, onShare, onFavorite, onOpenGraph,
}: Props) {
  const [stepsOpen, setStepsOpen] = useState(showSteps);
  const [derivativeOpen, setDerivativeOpen] = useState(false);
  const isError = result.type === 'error';
  useEffect(() => { setStepsOpen(showSteps); }, [showSteps, result]);

  return (
    <section className="card result-card" aria-live="polite" data-testid="result-card">
      <div className="result-head">
        <span className="eyebrow">{t(result.titleKey)}</span>
        {result.verification && (
          <span className={`badge ${result.verification.ok ? 'success' : 'error'}`}>
            <Icon name={result.verification.ok ? 'checkCircle' : 'alert'} size={13} />
            {t(result.verification.key, result.verification.params)}
          </span>
        )}
        {result.approximate && <span className="badge warn">≈ {t('common.approx')}</span>}
      </div>

      {isError ? (
        <div className="error-box" data-testid="result-error">
          <Icon name="alert" size={20} />
          <div>
            <strong>{t(result.notes[0]?.key ?? 'errors.internal')}</strong>
            {result.notes.slice(1).map((n, i) => <span className="hint" key={i}>{t(n.key, n.params)}</span>)}
          </div>
        </div>
      ) : (
        <>
          <div className="result-value math" data-testid="result-value">
            {result.resultPrefix && <span className="result-prefix">{result.resultPrefix}</span>}
            {result.fraction ? (
              <span className="fraction">
                <span className="num">{result.fraction.numerator}</span>
                <span className="den">{result.fraction.denominator}</span>
              </span>
            ) : result.result}
          </div>

          {result.solutions.length > 0 && (
            <div className="solutions-list" aria-label={t('result.solutionsList')}>
              {result.solutions.map((s, i) => (
                <span className="solution-chip" key={i}>
                  {s.exact}
                  {s.verified && <Icon name="check" size={14} style={{ color: 'var(--success)' }} />}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="result-actions">
        <button type="button" className="button small" onClick={onCopy}><Icon name="copy" size={15} />{t('common.copy')}</button>
        <button type="button" className="button small" onClick={onShare}><Icon name="share" size={15} />{t('common.share')}</button>
        <button
          type="button" className={`button small ${favorite ? 'soft' : ''}`}
          aria-pressed={favorite} onClick={onFavorite}
        >
          <Icon name="star" size={15} filled={favorite} />
          {t(favorite ? 'common.unfavorite' : 'common.favorite')}
        </button>
        <span className="spacer" />
        {result.graph && !isError && (
          <button type="button" className="button small ghost" onClick={onOpenGraph}>
            <Icon name="graph" size={15} />{t('solve.graphAction')}
          </button>
        )}
      </div>

      {result.graph && showGraph && !isError && (
        <div style={{ marginTop: 18 }}>
          <GraphCanvas spec={result.graph} t={t} themeKey={themeKey} />
        </div>
      )}

      {!isError && result.steps.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button type="button" className="collapse-btn" aria-expanded={stepsOpen} onClick={() => setStepsOpen((v) => !v)}>
            <Icon name="chevronDown" size={16} />
            {t(stepsOpen ? 'result.hideSteps' : 'result.showSteps')}
            <span className="badge info" style={{ marginInlineStart: 6 }}>{result.steps.length}</span>
          </button>
          {stepsOpen && (
            <ol className="steps" style={{ marginTop: 14 }}>
              {result.steps.map((s, i) => (
                <li className="step" key={`${s.key}-${i}`}>
                  <span className="step-number">{i + 1}</span>
                  <div className="step-body">
                    <p className="step-title">{t(`steps.${s.key}`, s.params)}</p>
                    {s.math && <div className="step-math math">{s.math}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {result.verification?.math && stepsOpen && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
              <Icon name="checkCircle" size={14} style={{ verticalAlign: '-3px', marginInlineEnd: 5 }} />
              <span className="math">{result.verification.math}</span>
            </p>
          )}
        </div>
      )}

      {result.derivative && !isError && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <button type="button" className="collapse-btn" aria-expanded={derivativeOpen} onClick={() => setDerivativeOpen((v) => !v)}>
            <Icon name="chevronDown" size={16} />{t('result.derivative')}
          </button>
          {derivativeOpen && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>{t('result.derivativeTitle')}</p>
              <div className="step-math math">d/d{result.graph?.variable ?? 'x'} = {result.derivative.result}</div>
              <ol className="steps" style={{ marginTop: 12 }}>
                {result.derivative.steps.map((s, i) => (
                  <li className="step" key={i}>
                    <span className="step-number">{i + 1}</span>
                    <div className="step-body">
                      <p className="step-title">{t(`steps.${s.key}`, s.params)}</p>
                      {s.math && <div className="step-math math">{s.math}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {!isError && result.notes.length > 0 && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <h3 className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>{t('result.notes')}</h3>
          <ul className="notes">
            {result.notes.map((n, i) => <li key={i}>{t(n.key, n.params)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
