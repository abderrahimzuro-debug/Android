import type { Expr } from './parser';
import { evaluateNumeric, findRoots, findExtrema } from './numeric';
import { formatNumber } from './format';
import type { GraphPoint, GraphSpec } from './types';

export function valueAt(expr: Expr, variable: string, x: number): number {
  return evaluateNumeric(expr, { [variable]: x });
}

export function expressionGraph(title: string, variable: string, expr: Expr): GraphSpec {
  return {
    title,
    variable,
    curves: [{ label: title, expr, color: 'primary' }],
    points: [],
  };
}

export function equationGraph(
  title: string,
  variable: string,
  left: Expr,
  right: Expr,
  roots: number[],
): GraphSpec {
  const points: GraphPoint[] = [];
  for (const x of roots) {
    const y = valueAt(left, variable, x);
    if (!Number.isFinite(y)) continue;
    points.push({ x, y, kind: 'solution', label: `${variable} = ${formatNumber(x)}` });
  }
  return {
    title,
    variable,
    curves: [
      { label: 'LHS', expr: left, color: 'primary' },
      { label: 'RHS', expr: right, color: 'accent' },
    ],
    points,
  };
}

/** Points found inside the current viewport. All are approximate, by construction. */
export function usefulPoints(spec: GraphSpec, a: number, b: number): GraphPoint[] {
  if (spec.curves.length === 0) return spec.points;
  const variable = spec.variable;
  const points: GraphPoint[] = [];
  if (spec.curves.length === 1) {
    const expr = spec.curves[0].expr;
    const f = (x: number) => valueAt(expr, variable, x);
    for (const x of findRoots(f, a, b, 700)) {
      points.push({ x, y: 0, kind: 'root', label: `${variable} = ${formatNumber(x)}` });
    }
    const yAtZero = f(0);
    if (Number.isFinite(yAtZero) && 0 >= a && 0 <= b) {
      points.push({ x: 0, y: yAtZero, kind: 'intercept', label: `y = ${formatNumber(yAtZero)}` });
    }
    for (const p of findExtrema(f, a, b, 350)) {
      points.push({ ...p, label: `${formatNumber(p.x)}, ${formatNumber(p.y)}` });
    }
  }
  return [...spec.points, ...points].sort((p, q) => p.x - q.x).slice(0, 24);
}

/** Approximate real roots of lhs - rhs over a given interval (explicitly numerical). */
export function numericEquationRoots(left: Expr, right: Expr, variable: string, a = -20, b = 20): number[] {
  const f = (x: number) => valueAt(left, variable, x) - valueAt(right, variable, x);
  return findRoots(f, a, b, 2000);
}
