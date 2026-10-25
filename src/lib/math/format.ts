import type { Rational } from './rational';
import type { Expr } from './parser';

const MINUS = '−';
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

export function superscript(n: number): string {
  if (n >= 0 && n <= 9) return SUP[String(n)];
  return [...String(n)].map((c) => SUP[c] ?? c).join('');
}

export function formatRational(r: Rational): string {
  return r.toString().replace('-', MINUS);
}

/** Compact decimal, used for genuinely approximate values. */
export function formatNumber(value: number, digits = 10): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : value < 0 ? `${MINUS}∞` : 'undefined';
  if (Object.is(value, -0)) return '0';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-9 || abs >= 1e12)) return value.toExponential(6).replace('-', MINUS).replace('e', ' × 10^');
  const rounded = Number(value.toPrecision(digits));
  return String(rounded).replace('-', MINUS);
}

function precedence(expr: Expr): number {
  switch (expr.type) {
    case 'binary': return { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[expr.op];
    case 'unary': return 3;
    default: return 5;
  }
}

function wrap(expr: Expr, minPrec: number): string {
  const text = formatExpr(expr);
  return precedence(expr) < minPrec ? `(${text})` : text;
}

/** Human-readable rendering of an expression tree (uses Unicode math signs). */
export function formatExpr(expr: Expr): string {
  switch (expr.type) {
    case 'num': return formatRational(expr.value);
    case 'const': return { pi: 'π', e: 'e', tau: 'τ' }[expr.name];
    case 'var': return expr.name;
    case 'unary':
      return expr.op === '+' ? formatExpr(expr.arg) : `${MINUS}${wrap(expr.arg, 3)}`;
    case 'func':
      return `${expr.name}(${formatExpr(expr.arg)})`;
    case 'binary': {
      const p = precedence(expr);
      // Nice superscripts for small integer powers.
      if (expr.op === '^' && expr.right.type === 'num' && expr.right.value.isInteger()) {
        const deg = expr.right.value.toNumber();
        if (deg >= 0 && deg <= 99) return `${wrap(expr.left, 4)}${superscript(deg)}`;
      }
      const op = { '+': ' + ', '-': ` ${MINUS} `, '*': ' × ', '/': '/', '^': '^' }[expr.op];
      const left = formatExpr(expr.left);
      const right = formatExpr(expr.right);
      const leftStr = precedence(expr.left) < p ? `(${left})` : left;
      // For - and /, an equal-precedence child on the right must be parenthesised.
      const rightStr = precedence(expr.right) < p || (p <= 2 && expr.op !== '*' && precedence(expr.right) === p)
        ? `(${right})` : right;
      return `${leftStr}${op}${rightStr}`;
    }
  }
}

/** Pretty variable power for polynomial rendering. */
export function variablePower(variable: string, degree: number): string {
  if (degree === 0) return '';
  if (degree === 1) return variable;
  return `${variable}${superscript(degree)}`;
}

export function formatCoefficient(r: Rational, degree: number): string {
  const abs = r.abs();
  if (degree === 0) return formatRational(abs);
  if (abs.isOne()) return '';
  return abs.isInteger() ? abs.toString() : `(${formatRational(abs)})`;
}
