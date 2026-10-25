import { describe, expect, it } from 'vitest';
import { solve } from '../src/lib/math/solve';
import { evaluateWithSteps } from '../src/lib/math/solve';
import { parseExpression, normalizeInput } from '../src/lib/math/parser';
import { Rational } from '../src/lib/math/rational';
import { Polynomial, toPolynomial } from '../src/lib/math/polynomial';
import { evaluateNumeric, findRoots } from '../src/lib/math/numeric';
import { formatExpr } from '../src/lib/math/format';

describe('required verification examples', () => {
  it('2+3×4=14 respects precedence and verifies', () => {
    const r = solve('2+3×4=14');
    expect(r.type).toBe('calculation');
    expect(r.titleKey).toBe('result.true');
    expect(r.result).toBe('14');
    expect(r.verification?.ok).toBe(true);
    expect(r.steps.some((s) => s.math === '3 × 4 = 12')).toBe(true);
  });

  it('1/2+1/3 = 5/6 exactly', () => {
    const r = solve('1/2+1/3');
    expect(r.result).toBe('5/6');
    expect(r.fraction).toEqual({ numerator: '5', denominator: '6' });
    expect(r.approximate).toBe(false);
    const fractionStep = r.steps.find((s) => s.key === 'fraction.common');
    // The printed common-denominator line must be mathematically correct.
    expect(fractionStep?.math).toContain('3/6 + 2/6 = 5/6');
    expect(fractionStep?.math).not.toContain('1/6 + 1/6');
  });

  it('2x+3=11 -> x=4', () => {
    const r = solve('2x+3=11');
    expect(r.result).toBe('x = 4');
    expect(r.solutions).toHaveLength(1);
    expect(r.solutions[0]).toMatchObject({ exact: '4', approx: 4, verified: true, exactCheck: true });
  });

  it('x²−5x+6=0 -> x=2 and x=3', () => {
    const r = solve('x²−5x+6=0');
    expect(r.solutions.map((s) => s.approx).sort()).toEqual([2, 3]);
    expect(r.solutions.every((s) => s.verified && s.exactCheck)).toBe(true);
    expect(r.steps.some((s) => s.key === 'factor')).toBe(true);
  });
});

describe('exact arithmetic and parser', () => {
  it('handles Unicode, Arabic-Indic digits and implicit multiplication', () => {
    expect(normalizeInput('٢ + ٣ × ٤')).toBe('2 + 3 * 4');
    expect(evaluateWithSteps(parseExpression('2(3+4)')).exact?.toString()).toBe('14');
    expect(solve('2x⁰ + 3').result).toBe('5');
  });

  it('never divides by zero silently', () => {
    expect(solve('1/0').type).toBe('error');
    expect(solve('1/0').errorCode).toBe('divisionByZero');
  });

  it('keeps rationals exact through powers and negative exponents', () => {
    expect(evaluateWithSteps(parseExpression('(2/3)^3')).exact?.toString()).toBe('8/27');
    expect(evaluateWithSteps(parseExpression('2^-2')).exact?.toString()).toBe('1/4');
    expect(new Rational(1n, 2n).add(new Rational(1n, 3n)).toString()).toBe('5/6');
  });

  it('right-associative powers and unary minus', () => {
    expect(evaluateWithSteps(parseExpression('2^3^2')).exact?.toString()).toBe('512');
    expect(evaluateWithSteps(parseExpression('-2^2')).exact?.toString()).toBe('-4');
  });

  it('supports radicals and marks irrational values as approximate', () => {
    const exact = solve('√9 + √(1/4)');
    expect(exact.result).toBe('7/2');
    const approx = solve('√2');
    expect(approx.approximate).toBe(true);
    expect(approx.result).toMatch(/1\.414/);
  });

  it('gives helpful errors for broken input', () => {
    for (const input of ['', '2+', '(2+3', '2 + $', 'x + y = 3', 'sin(x)=x']) {
      const r = solve(input);
      if (input === 'sin(x)=x') {
        // Not symbolically solvable, but it must not crash or invent exact roots.
        expect(['calculation', 'error']).toContain(r.type);
      } else {
        expect(r.type).toBe('error');
        expect(r.errorCode).toBeTruthy();
        expect(r.notes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('symbolic algebra', () => {
  it('expands and combines like terms, with a verified derivative', () => {
    const r = solve('2x + 3x - 4');
    expect(r.result).toBe('5x − 4');
    expect(r.verification?.ok).toBe(true);
    expect(r.derivative?.result).toBe('5');
    expect(r.graph).not.toBeNull();
  });

  it('solves quadratics with irrational and double roots honestly', () => {
    const irrational = solve('x^2 - 2 = 0');
    expect(irrational.solutions.map((s) => s.exact)).toEqual(['−√2', '√2']);
    expect(irrational.solutions.every((s) => s.verified)).toBe(true);
    expect(irrational.solutions.every((s) => s.exactCheck)).toBe(false);
    const golden = solve('x^2 - x - 1 = 0');
    expect(golden.solutions.map((s) => s.exact)).toEqual(['(1 − √5) / 2', '(1 + √5) / 2']);
    const double = solve('x^2 - 4x + 4 = 0');
    expect(double.solutions).toHaveLength(1);
    expect(double.solutions[0].exact).toBe('2');
  });

  it('reports no real roots for negative discriminant', () => {
    const r = solve('x^2 + 1 = 0');
    expect(r.titleKey).toBe('result.noReal');
    expect(r.graph).not.toBeNull();
    expect(r.steps.find((s) => s.key === 'negativeDelta')?.math).toContain('±i');
  });

  it('formats fractional linear coefficients unambiguously', () => {
    const r = solve('(x/2)+4=9');
    expect(r.result).toBe('x = 10');
    expect(r.steps.find((s) => s.key === 'linear.isolate')?.math).toBe('(1/2)x = 5');
    expect(r.steps.find((s) => s.key === 'linear.divide')?.math).toContain('5 / (1/2) = 10');
  });

  it('summarises long numerical root lists instead of flooding the result', () => {
    const r = solve('sin(x)=0');
    expect(r.solutions.length).toBeGreaterThan(10);
    expect(r.result).toContain('more');
    expect(r.result.length).toBeLessThan(160);
  });

  it('recognises identities and contradictions', () => {
    expect(solve('2x + 2 = 2(x+1)').titleKey).toBe('result.allReal');
    expect(solve('x + 1 = x + 2').titleKey).toBe('result.noSolution');
  });

  it('does not claim exact symbolic solving for higher-degree or transcendental equations', () => {
    const cubic = solve('x^3 - x = 0');
    expect(cubic.solutions.map((s) => Math.round(s.approx)).sort()).toEqual([-1, 0, 1]);
    expect(cubic.notes.some((n) => n.key === 'notes.higherDegree')).toBe(true);
    const trig = solve('sin(x) = 0');
    expect(trig.notes.some((n) => n.key === 'notes.transcendental')).toBe(true);
    expect(trig.solutions.every((s) => !s.exactCheck)).toBe(true);
  });

  it('polynomial arithmetic and formatting', () => {
    const p = toPolynomial(parseExpression('(x+1)(x-1)'), 'x');
    expect(p.toString()).toBe('x² − 1');
    expect(p.derivative().toString()).toBe('2x');
    expect(Polynomial.monomial(2, new Rational(3n)).toString()).toBe('3x²');
    expect(formatExpr(parseExpression('(x+1)^2'))).toBe('(x + 1)²');
  });
});

describe('graphing primitives', () => {
  it('finds roots including an even-multiplicity root', () => {
    const f = (x: number) => evaluateNumeric(parseExpression('x^2 - 5x + 6'), { x });
    const roots = findRoots(f, -2, 8);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(2, 6);
    expect(roots[1]).toBeCloseTo(3, 6);
    const double = findRoots((x) => x * x, -3, 3);
    expect(double.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(double[0])).toBeLessThan(1e-4);
  });

  it('returns NaN outside a domain instead of throwing', () => {
    expect(Number.isNaN(evaluateNumeric(parseExpression('sqrt(x)'), { x: -1 }))).toBe(true);
    expect(Number.isNaN(evaluateNumeric(parseExpression('ln(x)'), { x: 0 }))).toBe(true);
  });

  it('builds a graph for y = f(x) and for equations', () => {
    expect(solve('y = x^2 - 1').graph?.curves).toHaveLength(1);
    const eq = solve('x^2 - 5x + 6 = 0');
    expect(eq.graph?.curves).toHaveLength(2);
    expect(eq.graph?.points).toHaveLength(2);
  });
});
