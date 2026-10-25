import type { Expr } from './parser';

/** Floating-point evaluator used for graphs and numerical checks. NaN = undefined. */
export function evaluateNumeric(expr: Expr, scope: Record<string, number> = {}): number {
  switch (expr.type) {
    case 'num': return expr.value.toNumber();
    case 'const': return { pi: Math.PI, e: Math.E, tau: 2 * Math.PI }[expr.name];
    case 'var': return scope[expr.name] ?? NaN;
    case 'unary': {
      const v = evaluateNumeric(expr.arg, scope);
      return expr.op === '-' ? -v : v;
    }
    case 'func': {
      const v = evaluateNumeric(expr.arg, scope);
      if (!Number.isFinite(v)) return NaN;
      switch (expr.name) {
        case 'sqrt': return v < 0 ? NaN : Math.sqrt(v);
        case 'abs': return Math.abs(v);
        case 'sin': return Math.sin(v);
        case 'cos': return Math.cos(v);
        case 'tan': return Math.cos(v) === 0 ? NaN : Math.tan(v);
        case 'asin': return v < -1 || v > 1 ? NaN : Math.asin(v);
        case 'acos': return v < -1 || v > 1 ? NaN : Math.acos(v);
        case 'atan': return Math.atan(v);
        case 'ln': return v <= 0 ? NaN : Math.log(v);
        case 'log': return v <= 0 ? NaN : Math.log10(v);
        case 'log2': return v <= 0 ? NaN : Math.log2(v);
        case 'exp': return Math.exp(v);
        case 'floor': return Math.floor(v);
        case 'ceil': return Math.ceil(v);
        case 'round': return Math.round(v);
        case 'sign': return Math.sign(v);
      }
      return NaN;
    }
    case 'binary': {
      const a = evaluateNumeric(expr.left, scope);
      const b = evaluateNumeric(expr.right, scope);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
      switch (expr.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? NaN : a / b;
        case '^': {
          const result = Math.pow(a, b);
          return Number.isFinite(result) ? result : NaN;
        }
      }
    }
  }
}

export interface CurvePoint { x: number; y: number; label: string; kind: 'root' | 'intercept' | 'extremum' | 'solution' }

const EPS = 1e-9;

function bisect(f: (x: number) => number, lo: number, hi: number): number | null {
  let a = lo, b = hi, fa = f(a);
  if (!Number.isFinite(fa)) return null;
  for (let i = 0; i < 90; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < EPS || (b - a) / 2 < EPS) return m;
    if ((fa < 0) !== (fm < 0)) { b = m; } else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

/** Minimises |f| on [a,b] (ternary search); used for even-multiplicity roots/extrema. */
function minimiseAbs(f: (x: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  for (let i = 0; i < 80; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (Math.abs(f(m1)) < Math.abs(f(m2))) hi = m2; else lo = m1;
  }
  return (lo + hi) / 2;
}

/**
 * Finds real zeros of f in [a,b] by sampling + bisection. Results are labelled
 * approximate: this is a viewport-based numerical search, not a proof.
 */
export function findRoots(f: (x: number) => number, a: number, b: number, samples = 1400): number[] {
  const step = (b - a) / samples;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = a + i * step;
    xs.push(x);
    ys.push(f(x));
  }
  const roots: number[] = [];
  const push = (x: number | null) => {
    if (x === null || !Number.isFinite(x) || Math.abs(f(x)) > 1e-5) return;
    if (roots.some((r) => Math.abs(r - x) < Math.max(1e-6, Math.abs(step) * 2))) return;
    roots.push(x);
  };
  for (let i = 0; i <= samples; i++) {
    if (Number.isFinite(ys[i]) && ys[i] === 0) push(xs[i]);
    if (i < samples) {
      const y0 = ys[i], y1 = ys[i + 1];
      if (Number.isFinite(y0) && Number.isFinite(y1) && y0 * y1 < 0) {
        push(bisect(f, xs[i], xs[i + 1]));
      }
    }
    // A local minimum of |f| close to zero catches roots of even multiplicity.
    if (i > 0 && i < samples && Number.isFinite(ys[i])
        && Math.abs(ys[i]) <= Math.abs(ys[i - 1]) && Math.abs(ys[i]) <= Math.abs(ys[i + 1])
        && Math.abs(ys[i]) < Math.max(1e-3, Math.abs(step))) {
      push(minimiseAbs(f, xs[i - 1], xs[i + 1]));
    }
  }
  if (Number.isFinite(ys[samples]) && ys[samples] === 0) push(xs[samples]);
  return roots.sort((p, q) => p - q);
}

/** Local maxima/minima in the visible window, found from derivative sign changes. */
export function findExtrema(f: (x: number) => number, a: number, b: number, samples = 900): CurvePoint[] {
  const step = (b - a) / samples;
  const derivative = (x: number) => {
    const h = Math.max(1e-6, Math.abs(step) / 8);
    const up = f(x + h), down = f(x - h);
    return Number.isFinite(up) && Number.isFinite(down) ? (up - down) / (2 * h) : NaN;
  };
  const points: CurvePoint[] = [];
  let prev = derivative(a);
  for (let i = 1; i < samples; i++) {
    const x = a + i * step;
    const cur = derivative(x);
    if (Number.isFinite(prev) && Number.isFinite(cur) && prev * cur < 0) {
      const root = bisect(derivative, x - step, x);
      if (root !== null) {
        const y = f(root);
        if (Number.isFinite(y) && !points.some((p) => Math.abs(p.x - root) < Math.abs(step))) {
          points.push({ x: root, y, kind: 'extremum', label: '' });
        }
      }
    }
    prev = cur;
  }
  return points;
}

/** Halves a large jump (discontinuity) so the graph does not draw a false vertical line. */
export function sampleFunction(f: (x: number) => number, a: number, b: number, count: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  for (let i = 0; i <= count; i++) {
    const x = a + (b - a) * i / count;
    const y = f(x);
    out.push({ x, y: Number.isFinite(y) && Math.abs(y) < 1e9 * scale ? y : NaN });
  }
  return out;
}
