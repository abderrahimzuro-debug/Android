import { useEffect } from 'react';
import type { Translator } from '../i18n';
import { Icon } from './Icons';

const TOPICS: Array<{ key: string; examples: string[] }> = [
  { key: 'arithmetic', examples: ['2+3×4', '8−(3+2)', '4^2 + 3^2', '15÷3+2', '2+3×4=14'] },
  { key: 'fractions', examples: ['1/2+1/3', '3/4 × 2/5', '(2/3)^2', '5/6 − 1/4'] },
  { key: 'powers', examples: ['√9', '√(1/4)', '2^-2', '2^3^2', '√2'] },
  { key: 'linear', examples: ['2x+3=11', '5x−7=3x+1', '(x/2)+4=9'] },
  { key: 'quadratic', examples: ['x²−5x+6=0', 'x^2−4x+4=0', 'x^2−2=0', 'x^2+1=0'] },
  { key: 'simplify', examples: ['2x+3x−4', '(x+1)(x−1)', '3(x+2)−x'] },
  { key: 'graphs', examples: ['y=x^2−4', 'y=sin(x)', 'y=1/x', 'x^2−4=0'] },
  { key: 'functions', examples: ['√(x+1)', 'sin(x)', 'ln(x)', 'sin(x)=0'] },
];

export const QUICK_EXAMPLES = ['2+3×4', '1/2+1/3', '2x+3=11', 'x²−5x+6=0', '√2', 'y=x^2−4'];

interface Props { t: Translator; onPick: (expression: string) => void; onClose: () => void }

export function TopicsModal({ t, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="topics-title">
        <div className="modal-header">
          <div>
            <h2 id="topics-title">{t('topics.title')}</h2>
            <p>{t('topics.subtitle')}</p>
          </div>
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="topic-grid">
          {TOPICS.map((topic) => (
            <div className="topic-card" key={topic.key}>
              <h3>{t(`topics.${topic.key}`)}</h3>
              <div className="example-list">
                {topic.examples.map((example) => (
                  <button type="button" className="example math" key={example} onClick={() => onPick(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
