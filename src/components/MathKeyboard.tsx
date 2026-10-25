import { useState } from 'react';
import type { Translator } from '../i18n';
import { Icon } from './Icons';

export interface KeyInsert { text: string; caretBack?: number }

interface KeyDef {
  label: string;
  insert?: KeyInsert;
  action?: 'backspace' | 'clear' | 'solve';
  aria?: string;
  kind?: 'accent' | 'utility' | 'function';
}

interface KeySet { id: string; keys: KeyDef[] }

function k(label: string, text: string, caretBack?: number, aria?: string): KeyDef {
  return { label, insert: { text, caretBack }, aria };
}
function fn(label: string, text: string): KeyDef {
  return { label, insert: { text, caretBack: 1 }, kind: 'function', aria: label };
}

const KEY_SETS: KeySet[] = [
  {
    id: 'basic',
    keys: [
      k('7', '7'), k('8', '8'), k('9', '9'), k('÷', '/', 0, 'steps.op.divide'), k('(', '()', 1, 'keyboard.left'), k(')', ')'),
      k('4', '4'), k('5', '5'), k('6', '6'), k('×', '*', 0, 'steps.op.multiply'), k('x²', '^2'), k('^', '^'),
      k('1', '1'), k('2', '2'), k('3', '3'), k('−', '-', 0, 'steps.op.subtract'), k('=', '='), k('.', '.'),
      k('0', '0'), k('(', '()', 1), k(')', ')'), k('+', '+', 0, 'steps.op.add'),
      { label: '⌫', action: 'backspace', kind: 'utility', aria: 'keyboard.backspace' },
      { label: 'AC', action: 'clear', kind: 'utility', aria: 'common.clear' },
    ],
  },
  {
    id: 'fractions',
    keys: [
      k('⋯/⋯', '()/()', 4, 'keyboard.fraction'), k('1/x', '1/()', 1), k('x/y', '(x)/(y)', 5), k('½', '(1)/(2)', 0),
      k('⅓', '(1)/(3)', 0), k('⅔', '(2)/(3)', 0),
      k('√', 'sqrt()', 1, 'keyboard.sqrt'), k('∛', '()^(1/3)', 8), k('π', 'π', 0, 'keyboard.pi'), k('÷', '/', 0),
      k('( )', '()', 1), k('^½', '^(1/2)', 0), k('^−1', '^(-1)', 0), k('|x|', 'abs()', 1, 'steps.op.abs'),
      k('7', '7'), k('8', '8'), k('9', '9'), k('=', '='), k('−', '-', 0), k('+', '+', 0),
      k('4', '4'), k('5', '5'), k('6', '6'), k('1', '1'), k('2', '2'), k('3', '3'),
      k('0', '0'), k('.', '.'), k('x', 'x'), k('y', 'y'),
      { label: '⌫', action: 'backspace', kind: 'utility', aria: 'keyboard.backspace' },
      { label: 'AC', action: 'clear', kind: 'utility', aria: 'common.clear' },
    ],
  },
  {
    id: 'functions',
    keys: [
      fn('sin', 'sin()'), fn('cos', 'cos()'), fn('tan', 'tan()'), fn('√', 'sqrt()'), fn('abs', 'abs()'), fn('ln', 'ln()'),
      fn('log', 'log()'), fn('exp', 'exp()'), fn('asin', 'asin()'), fn('acos', 'acos()'), fn('atan', 'atan()'), fn('floor', 'floor()'),
      k('π', 'π'), k('e', 'e'), k('^', '^'), k('^2', '^2'), k('(', '()', 1), k(')', ')'),
      k('7', '7'), k('8', '8'), k('9', '9'), k('÷', '/'), k('×', '*'), k('−', '-'),
      k('4', '4'), k('5', '5'), k('6', '6'), k('1', '1'), k('2', '2'), k('3', '3'),
      k('0', '0'), k('.', '.'), k('+', '+'), k('=', '='), k('x', 'x'), k('y', 'y'),
    ],
  },
  {
    id: 'vars',
    keys: [
      k('x', 'x'), k('y', 'y'), k('a', 'a'), k('b', 'b'), k('c', 'c'), k('n', 'n'),
      k('=', '='), k('+', '+'), k('−', '-'), k('×', '*'), k('÷', '/'), k('^', '^'),
      k('x²', 'x^2'), k('x³', 'x^3'), k('xⁿ', 'x^n'), k('√(x)', 'sqrt(x)'), k('(x+1)', '(x+1)'), k('2x', '2x'),
      k('7', '7'), k('8', '8'), k('9', '9'), k('4', '4'), k('5', '5'), k('6', '6'),
      k('1', '1'), k('2', '2'), k('3', '3'), k('0', '0'), k('.', '.'), k('(', '()', 1),
      { label: '⌫', action: 'backspace', kind: 'utility', aria: 'keyboard.backspace' },
      { label: 'AC', action: 'clear', kind: 'utility', aria: 'common.clear' },
    ],
  },
];

interface Props {
  t: Translator;
  onInsert: (insert: KeyInsert) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSolve: () => void;
}

export function MathKeyboard({ t, onInsert, onBackspace, onClear, onSolve }: Props) {
  const [active, setActive] = useState('basic');
  const set = KEY_SETS.find((s) => s.id === active) ?? KEY_SETS[0];

  return (
    <div className="keyboard" role="group" aria-label={t('solve.keyboard')}>
      <div className="keyboard-tabs" role="tablist" aria-label={t('solve.keyboard')}>
        {KEY_SETS.map((s) => (
          <button
            key={s.id} role="tab" type="button" aria-selected={active === s.id}
            className={`keyboard-tab ${active === s.id ? 'active' : ''}`}
            onClick={() => setActive(s.id)}
          >
            {t(`keyboard.${s.id}`)}
          </button>
        ))}
        <button type="button" className="keyboard-tab" style={{ marginInlineStart: 'auto' }} onClick={onSolve}>
          {t('common.solve')} ↵
        </button>
      </div>
      <div className="key-grid">
        {set.keys.map((key, index) => {
          const className = `key ${key.kind ?? ''} ${key.insert?.text === '=' ? 'accent' : ''}`;
          const ariaLabel = key.aria ? t(key.aria) : key.label;
          return (
            <button
              key={`${key.label}-${index}`} type="button" className={className}
              aria-label={ariaLabel}
              onClick={() => {
                if (key.action === 'backspace') onBackspace();
                else if (key.action === 'clear') onClear();
                else if (key.action === 'solve') onSolve();
                else if (key.insert) onInsert(key.insert);
              }}
            >
              {key.action === 'backspace' ? <Icon name="backspace" size={19} /> : key.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
