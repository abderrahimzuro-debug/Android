import { Rational, bigIntFloorSqrt } from './rational';
import {
  MathInputError, collectVariables, parseInput,
  type Expr, type ParsedInput,
} from './parser';
import { Polynomial, PolynomialError, toPolynomial } from './polynomial';
import { evaluateNumeric } from './numeric';
import { expressionGraph, equationGraph, numericEquationRoots, valueAt } from './graph';
import { formatExpr, formatNumber, formatRational } from './format';
import type { GraphSpec, MathResult, Solution, Step } from './types';

const MINUS = '−';
const ARROW = ' → ';

function step(key: string, math?: string, params?: Record<string, string>): Step {
  return math === undefined ? (params ? { key, params } : { key }) : (params ? { key, math, params } : { key, math });
}
function note(key: string, params?: Record<string, string>) { return { key, ...(params ? { params } : {}) }; }

function baseResult(input: string): MathResult {
  return {
    input, type: 'calculation', topic: 'arithmetic', titleKey: 'result.value',
    result: '', approximate: false, steps: [], notes: [], graph: null,
    solutions: [], copyText: input,
  };
}

function withCopy(result: MathResult): MathResult {
  const lines = [result.input];
  if (result.result) {
    lines.push(`${result.resultPrefix ? result.resultPrefix + ' ' : ''}${result.fraction ? `${result.fraction.numerator}/${result.fraction.denominator}` : result.result}`);
  }
  for (const s of result.steps) if (s.math) lines.push(s.math);
  return { ...result, copyText: lines.join('\n') };
}

export function makeError(input: string, code: string): MathResult {
  return withCopy({
    ...baseResult(input), type: 'error', titleKey: 'result.error',
    topic: 'error', errorCode: code, result: '',
    steps: [], notes: [note(`errors.${code}`), note('errors.hint')],
  });
}

function errorCodeOf(err: unknown): string {
  if (err instanceof MathInputError) return err.code;
  if (err instanceof PolynomialError) return err.code;
  if (err instanceof Error && err.message === 'Division by zero') return 'divisionByZero';
  return 'internal';
}

// ---------------------------------------------------------------------------
// Numeric evaluation with real, generated steps
// ---------------------------------------------------------------------------

interface Evaluated {
  value: number;
  exact: Rational | null;
  display: string;
  approx: boolean;
  steps: Step[];
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { const t = a % b; a = b; b = t; }
  return a || 1n;
}
function lcm(a: bigint, b: bigint): bigint { return (a / gcd(a, b)) * b; }

function show(exact: Rational | null, value: number): string {
  return exact ? formatRational(exact) : formatNumber(value);
}
function paren(display: string): string {
  return display.startsWith(MINUS) ? `(${display})` : display;
}

const OP_KEY: Record<string, string> = {
  '+': 'op.add', '-': 'op.subtract', '*': 'op.multiply', '/': 'op.divide', '^': 'op.power',
};
const OP_SYMBOL: Record<string, string> = {
  '+': ' + ', '-': ` ${MINUS} `, '*': ' × ', '/': ' / ', '^': '^',
};
const FUNC_KEY: Record<string, string> = {
  sqrt: 'op.sqrt', abs: 'op.abs', sin: 'op.sin', cos: 'op.cos', tan: 'op.tan',
  asin: 'op.asin', acos: 'op.acos', atan: 'op.atan', ln: 'op.ln', log: 'op.log',
  log2: 'op.log2', exp: 'op.exp', floor: 'op.floor', ceil: 'op.ceil',
  round: 'op.round', sign: 'op.sign',
};

/** Evaluates a variable-free expression exactly when possible, recording every operation. */
export function evaluateWithSteps(expr: Expr): Evaluated {
  const independentValue = evaluateNumeric(expr, {});
  switch (expr.type) {
    case 'num':
      return { value: expr.value.toNumber(), exact: expr.value, display: formatRational(expr.value), approx: false, steps: [] };
    case 'const': {
      const value = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI }[expr.name];
      const display = formatNumber(value);
      return { value, exact: null, display, approx: true, steps: [step('constant', `${{ pi: 'π', e: 'e', tau: 'τ' }[expr.name]} ≈ ${display}`)] };
    }
    case 'var':
      throw new MathInputError('unexpectedVariable');
    case 'unary': {
      const child = evaluateWithSteps(expr.arg);
      if (expr.op === '+') return child;
      const exact = child.exact ? child.exact.neg() : null;
      const value = -child.value;
      const display = show(exact, value);
      return {
        value, exact, display, approx: child.approx || !exact,
        steps: [...child.steps, step('op.negate', `${MINUS}(${child.display}) = ${display}`)],
      };
    }
    case 'func': {
      const child = evaluateWithSteps(expr.arg);
      let exact: Rational | null = null;
      if (child.exact) {
        switch (expr.name) {
          case 'sqrt': exact = child.exact.sqrt(); break;
          case 'abs': exact = child.exact.abs(); break;
          case 'floor': case 'ceil': case 'round':
            exact = new Rational(BigInt(Math.round(child.exact.toNumber())));
            break;
          case 'sign': exact = new Rational(BigInt(child.exact.sign)); break;
          default: break;
        }
      }
      const value = independentValue;
      const display = show(exact, value);
      return {
        value, exact, display, approx: child.approx || !exact,
        steps: [...child.steps, step(FUNC_KEY[expr.name] ?? 'op.function', `${expr.name}(${child.display}) ${exact ? '=' : '≈'} ${display}`)],
      };
    }
    case 'binary': {
      const left = evaluateWithSteps(expr.left);
      const right = evaluateWithSteps(expr.right);
      let exact: Rational | null = null;
      if (left.exact && right.exact) {
        try {
          switch (expr.op) {
            case '+': exact = left.exact.add(right.exact); break;
            case '-': exact = left.exact.sub(right.exact); break;
            case '*': exact = left.exact.mul(right.exact); break;
            case '/': if (right.exact.isZero()) throw new MathInputError('divisionByZero'); exact = left.exact.div(right.exact); break;
            case '^': {
              if (right.exact.isInteger()) {
                const e = right.exact.toNumber();
                if (Math.abs(e) <= 1000) exact = left.exact.pow(e);
              }
              break;
            }
          }
        } catch (err) {
          if (err instanceof MathInputError) throw err;
          exact = null;
        }
      }
      const value = independentValue;
      const display = show(exact, value);
      const steps = [...left.steps, ...right.steps];
      // Explain a common denominator whenever two fractions are added/subtracted.
      if ((expr.op === '+' || expr.op === '-') && left.exact && right.exact
          && left.exact.d > 1n && right.exact.d > 1n && left.exact.d !== right.exact.d) {
        const d = lcm(left.exact.d, right.exact.d);
        const lNum = left.exact.n * (d / left.exact.d);
        const rNum = right.exact.n * (d / right.exact.d);
        const effectiveRight = expr.op === '-' ? -rNum : rNum;
        const resultNum = lNum + effectiveRight;
        const raw = (n: bigint) => n < 0n ? `${MINUS}${(-n).toString()}/${d}` : `${n}/${d}`;
        const rightTerm = effectiveRight < 0n
          ? `${MINUS} ${(-effectiveRight).toString()}/${d}`
          : `+ ${effectiveRight}/${d}`;
        const reduced = raw(resultNum);
        steps.push(step('fraction.common',
          `${raw(lNum)} ${rightTerm} = ${reduced === display ? display : `${reduced} = ${display}`}`,
          { denominator: d.toString() }));
      }
      steps.push(step(OP_KEY[expr.op], `${paren(left.display)}${OP_SYMBOL[expr.op]}${paren(right.display)} = ${exact ? display : `≈ ${display}`}`));
      return { value, exact, display, approx: left.approx || right.approx || !exact, steps };
    }
  }
}

function numericCheck(expr: Expr, expected: number): boolean {
  const value = evaluateNumeric(expr, {});
  return Number.isFinite(value) && Math.abs(value - expected) <= 1e-9 * Math.max(1, Math.abs(value), Math.abs(expected));
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

function calculationResult(parsed: ParsedInput & { kind: 'expression' }, input: string): MathResult {
  const vars = collectVariables(parsed.expr);
  if (vars.size > 1) return makeError(input, 'tooManyVariables');

  if (vars.size === 0) {
    const evaluated = evaluateWithSteps(parsed.expr);
    const steps = [step('read', formatExpr(parsed.expr)), ...evaluated.steps];
    const ok = numericCheck(parsed.expr, evaluated.value);
    const result: MathResult = {
      ...baseResult(input),
      topic: 'arithmetic',
      titleKey: 'result.value',
      result: evaluated.display,
      resultPrefix: evaluated.approx ? '≈' : undefined,
      fraction: evaluated.exact && evaluated.exact.d > 1n
        ? { numerator: formatRational(new Rational(evaluated.exact.n)), denominator: evaluated.exact.d.toString() }
        : undefined,
      approximate: evaluated.approx,
      steps,
      notes: evaluated.approx ? [note('notes.approximate')] : [],
      verification: { key: ok ? (evaluated.approx ? 'verify.numeric' : 'verify.exact') : 'verify.failed', ok, math: `${formatExpr(parsed.expr)} = ${evaluated.display}` },
    };
    return withCopy(result);
  }

  const variable = [...vars][0];
  const graph = expressionGraph(`y = ${formatExpr(parsed.expr)}`, variable, parsed.expr);
  try {
    const poly = toPolynomial(parsed.expr, variable);
    const canonical = poly.toString(variable);
    const original = formatExpr(parsed.expr);
    const samples = [-3, 0.5, 2, 7];
    const ok = samples.every((x) => {
      const a = evaluateNumeric(parsed.expr, { [variable]: x });
      const b = poly.evalNumber(x);
      return Number.isFinite(a) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
    });
    const derivative = poly.derivative();
    const result: MathResult = {
      ...baseResult(input),
      topic: 'algebra',
      titleKey: 'result.simplified',
      result: canonical,
      steps: [
        step('read', original),
        step(original === canonical ? 'combine' : 'expand', `${original}${ARROW}${canonical}`),
        step('polynomial', `P(${variable}) = ${canonical}`),
      ],
      verification: { key: ok ? 'verify.symbolic' : 'verify.failed', ok, params: { count: String(samples.length) }, math: `${original} = ${canonical}` },
      graph,
      derivative: {
        result: derivative.toString(variable),
        steps: [
          step('derivative.rule', `d/d${variable} (${canonical})`),
          step('derivative.result', `= ${derivative.toString(variable)}`),
        ],
      },
    };
    return withCopy(result);
  } catch {
    // Transcendental or otherwise non-polynomial: do not pretend to simplify it.
    const atZero = valueAt(parsed.expr, variable, 0);
    const result: MathResult = {
      ...baseResult(input),
      topic: 'functions',
      titleKey: 'result.function',
      result: `f(${variable}) = ${formatExpr(parsed.expr)}`,
      steps: [
        step('read', `f(${variable}) = ${formatExpr(parsed.expr)}`),
        step('noSymbolic', Number.isFinite(atZero) ? `f(0) = ${formatNumber(atZero)}` : 'f(0) is undefined'),
      ],
      notes: [note('notes.noSymbolic')],
      graph,
    };
    return withCopy(result);
  }
}

function functionResult(parsed: ParsedInput & { kind: 'function' }, input: string): MathResult {
  const vars = collectVariables(parsed.expr);
  if (vars.size > 1) return makeError(input, 'tooManyVariables');
  const variable = vars.size === 1 ? [...vars][0] : 'x';
  if (vars.size === 1 && variable !== 'x') return makeError(input, 'graphNeedsX');
  const result: MathResult = {
    ...baseResult(input),
    topic: 'graphs',
    titleKey: 'result.function',
    result: `y = ${formatExpr(parsed.expr)}`,
    steps: [step('read', `y = ${formatExpr(parsed.expr)}`)],
    notes: [note('notes.graphHint')],
    graph: expressionGraph(`y = ${formatExpr(parsed.expr)}`, 'x', parsed.expr),
  };
  return withCopy(result);
}

// ---------------------------------------------------------------------------
// Equations
// ---------------------------------------------------------------------------

/** Splits an integer into its largest square factor: 8 -> k=2, m=2. */
function squarePart(n: bigint): { k: bigint; m: bigint } {
  let k = 1n;
  let m = n;
  let f = bigIntFloorSqrt(m);
  while (f > 1n) {
    if (m % (f * f) === 0n) {
      k *= f;
      m /= f * f;
      f = bigIntFloorSqrt(m);
    } else {
      f--;
    }
  }
  return { k, m };
}

/** Writes sqrt(delta) as k·sqrt(m), with k rational and m square-free-ish. */
function radicalCoefficient(delta: Rational): { k: Rational; m: Rational } {
  const numerator = squarePart(delta.n);
  const denominator = squarePart(delta.d);
  return {
    k: new Rational(numerator.k, denominator.k),
    m: new Rational(numerator.m, denominator.m),
  };
}

function radicalString(k: Rational, m: Rational): string {
  const inner = m.isInteger() ? m.n.toString() : `(${formatRational(m)})`;
  if (m.isOne()) return formatRational(k);
  if (k.isOne()) return `√${inner}`;
  if (k.isNegativeOne()) return `${MINUS}√${inner}`;
  return `${formatRational(k)}√${inner}`;
}

interface QuadraticForm { p: Rational; k: Rational; m: Rational; q: Rational }

/** Reduces (−b ± k√m) / (2a) by cancelling a common factor. */
function quadraticForm(a: Rational, b: Rational, deltaAbs: Rational): QuadraticForm {
  const { k, m } = radicalCoefficient(deltaAbs);
  const q0 = a.mul(new Rational(2n));
  const flip = q0.sign < 0; // keep the denominator positive; ± already covers both roots
  const p0 = flip ? b : b.neg();
  const qBase = flip ? q0.neg() : q0;
  const D = lcm(lcm(p0.d, k.d), qBase.d);
  const P = p0.n * (D / p0.d);
  const K = k.n * (D / k.d);
  const Q = qBase.n * (D / qBase.d);
  const abs = (x: bigint) => (x < 0n ? -x : x);
  const g = gcd(gcd(abs(P), abs(K)), abs(Q)) || 1n;
  return {
    p: new Rational(P / g, D),
    k: new Rational(K / g, D),
    m,
    q: new Rational(Q / g, D),
  };
}

function quadraticRootStrings(form: QuadraticForm): [string, string] {
  const rad = radicalString(form.k, form.m);
  const plus = form.p.isZero() ? rad : `${formatRational(form.p)} + ${rad}`;
  const minus = form.p.isZero() ? `${MINUS}${rad}` : `${formatRational(form.p)} ${MINUS} ${rad}`;
  const wrap = (s: string) => form.q.isOne() ? s : `(${s}) / ${formatRational(form.q)}`;
  return [wrap(minus), wrap(plus)];
}

function complexRootString(form: QuadraticForm): string {
  const realPart = form.p.isZero() ? '' : (form.q.isOne() ? formatRational(form.p) : `(${formatRational(form.p)}) / ${formatRational(form.q)}`);
  const coefficient = form.m.isOne() && form.k.isOne() ? '' : radicalString(form.k, form.m);
  const imaginary = form.q.isOne() ? `${coefficient}i` : `(${coefficient}i) / ${formatRational(form.q)}`;
  return realPart ? `${realPart} ± ${imaginary}` : `±${imaginary}`;
}

function coefficientTerm(r: Rational, variable: string): string {
  return r.isInteger() ? `${formatRational(r)}${variable}` : `(${formatRational(r)})${variable}`;
}

function factorTerm(variable: string, r: Rational): string {
  if (r.isZero()) return variable;
  if (r.sign < 0) return `${variable} + ${formatRational(r.abs())}`;
  return `${variable} ${MINUS} ${formatRational(r)}`;
}

function verificationForEquation(
  left: Expr, right: Expr, variable: string, roots: Array<{ value: number; exact: Rational | null }>,
  diff?: Polynomial,
): { solutions: Solution[]; ok: boolean; allExact: boolean } {
  const solutions: Solution[] = roots.map(({ value, exact }) => {
    let verified = false;
    let exactCheck = false;
    if (exact && diff) {
      exactCheck = diff.evalRational(exact).isZero();
      verified = exactCheck;
    }
    if (!verified) {
      const lhs = valueAt(left, variable, value);
      const rhs = valueAt(right, variable, value);
      verified = Number.isFinite(lhs) && Number.isFinite(rhs)
        && Math.abs(lhs - rhs) <= 1e-6 * Math.max(1, Math.abs(lhs), Math.abs(rhs));
    }
    return {
      exact: exact ? formatRational(exact) : `≈ ${formatNumber(value)}`,
      approx: value,
      verified,
      exactCheck,
    };
  });
  return { solutions, ok: solutions.length > 0 && solutions.every((s) => s.verified), allExact: solutions.every((s) => s.exactCheck) };
}

function equationResult(parsed: ParsedInput & { kind: 'equation' }, input: string): MathResult {
  const { left, right } = parsed;
  const variables = new Set([...collectVariables(left), ...collectVariables(right)]);
  const lhsText = formatExpr(left);
  const rhsText = formatExpr(right);
  const rhsIsZero = right.type === 'num' && right.value.isZero();
  const differenceText = rhsIsZero ? lhsText : `${lhsText} ${MINUS} (${rhsText})`;
  const readStep = step('read', `${lhsText} = ${rhsText}`);

  // Equality of two constant expressions, e.g. 2 + 3 × 4 = 14.
  if (variables.size === 0) {
    const l = evaluateWithSteps(left);
    const r = evaluateWithSteps(right);
    const equal = l.exact && r.exact ? l.exact.compare(r.exact) === 0
      : Math.abs(l.value - r.value) <= 1e-9 * Math.max(1, Math.abs(l.value), Math.abs(r.value));
    const display = l.display;
    const ok = numericCheck(left, l.value) && numericCheck(right, r.value);
    const result: MathResult = {
      ...baseResult(input),
      topic: 'arithmetic',
      titleKey: equal ? 'result.true' : 'result.false',
      result: equal ? display : `${l.display} ≠ ${r.display}`,
      resultPrefix: equal && l.approx ? '≈' : undefined,
      fraction: equal && l.exact && l.exact.d > 1n
        ? { numerator: formatRational(new Rational(l.exact.n)), denominator: l.exact.d.toString() }
        : undefined,
      approximate: l.approx || r.approx,
      steps: [readStep, ...l.steps, ...r.steps, step('compare', `${l.display} ${equal ? '=' : '≠'} ${r.display}`)],
      verification: { key: equal ? (ok ? 'verify.true' : 'verify.failed') : 'verify.false', ok: equal && ok, math: `${lhsText} = ${display}` },
    };
    return withCopy(result);
  }
  if (variables.size > 1) return makeError(input, 'tooManyVariables');
  const variable = [...variables][0];
  const graph = () => equationGraph(`${lhsText} = ${rhsText}`, variable, left, right, []);

  let diff: Polynomial;
  try {
    diff = toPolynomial(left, variable).sub(toPolynomial(right, variable));
  } catch {
    return numericEquationResult(input, left, right, variable, readStep, null);
  }

  const moveStep = step('move', `${differenceText} = 0${ARROW}${diff.toString(variable)} = 0`);
  const degree = diff.degree;

  if (diff.isZero()) {
    const result: MathResult = {
      ...baseResult(input), topic: 'algebra', titleKey: 'result.allReal', result: 'ℝ',
      steps: [readStep, moveStep, step('identity', '0 = 0')],
      notes: [note('notes.identity')],
      graph: graph(),
      verification: { key: 'verify.identity', ok: true },
    };
    return withCopy(result);
  }
  if (degree < 0 || (degree === 0 && !diff.get(0).isZero())) {
    const result: MathResult = {
      ...baseResult(input), topic: 'algebra', titleKey: 'result.noSolution', result: '∅',
      steps: [readStep, moveStep, step('contradiction', `${diff.toString(variable)} = 0`)],
      notes: [note('notes.contradiction')],
      graph: graph(),
      verification: { key: 'verify.noSolution', ok: true },
    };
    return withCopy(result);
  }

  if (degree === 1) {
    const a = diff.get(1);
    const b = diff.get(0);
    const root = b.neg().div(a);
    const { solutions, ok } = verificationForEquation(left, right, variable, [{ value: root.toNumber(), exact: root }], diff);
    const lhsAt = valueAt(left, variable, root.toNumber());
    const rhsAt = valueAt(right, variable, root.toNumber());
    const result: MathResult = {
      ...baseResult(input), topic: 'algebra', titleKey: 'result.solution',
      result: `${variable} = ${formatRational(root)}`,
      steps: [
        readStep, moveStep,
        step('linear.isolate', `${coefficientTerm(a, variable)} = ${formatRational(b.neg())}`),
        step('linear.divide', `${variable} = ${formatRational(b.neg())} / ${a.isInteger() ? formatRational(a) : `(${formatRational(a)})`} = ${formatRational(root)}`, { a: formatRational(a) }),
        step('check', `${variable} = ${formatRational(root)}: ${lhsText} = ${formatNumber(lhsAt)} = ${formatNumber(rhsAt)}`),
      ],
      solutions,
      verification: { key: ok ? 'verify.roots' : 'verify.failed', ok, params: { count: '1' } },
      graph: equationGraph(`${lhsText} = ${rhsText}`, variable, left, right, [root.toNumber()]),
    };
    return withCopy(result);
  }

  if (degree === 2) {
    const a = diff.get(2), b = diff.get(1), c = diff.get(0);
    const delta = b.mul(b).sub(new Rational(4n).mul(a).mul(c));
    const denominator = a.mul(new Rational(2n));
    const discriminantStep = step('discriminant', `Δ = b² ${MINUS} 4ac = (${formatRational(b)})² ${MINUS} 4(${formatRational(a)})(${formatRational(c)}) = ${formatRational(delta)}`,
      { delta: formatRational(delta) });
    const formulaStep = step('formula', `${variable} = (${MINUS}b ± √Δ) / 2a`);

    if (delta.sign < 0) {
      const complex = complexRootString(quadraticForm(a, b, delta.abs()));
      const result: MathResult = {
        ...baseResult(input), topic: 'algebra', titleKey: 'result.noReal', result: '∅',
        steps: [readStep, moveStep, step('coefficients', `a = ${formatRational(a)}, b = ${formatRational(b)}, c = ${formatRational(c)}`), discriminantStep, formulaStep,
          step('negativeDelta', `Δ < 0 ${ARROW} ${variable} = ${complex}`)],
        notes: [note('notes.negativeDelta')],
        graph: graph(),
        verification: { key: 'verify.noReal', ok: true },
      };
      return withCopy(result);
    }

    if (delta.isZero()) {
      const root = b.neg().div(denominator);
      const { solutions, ok } = verificationForEquation(left, right, variable, [{ value: root.toNumber(), exact: root }], diff);
      const result: MathResult = {
        ...baseResult(input), topic: 'algebra', titleKey: 'result.solution', result: `${variable} = ${formatRational(root)}`,
        steps: [readStep, moveStep, discriminantStep, formulaStep,
          step('doubleRoot', `${variable} = ${formatRational(b.neg())} / ${formatRational(denominator)} = ${formatRational(root)}`),
          step('check', `${diff.toString(variable)} = 0 at ${variable} = ${formatRational(root)}`)],
        solutions,
        verification: { key: ok ? 'verify.roots' : 'verify.failed', ok, params: { count: '1' } },
        graph: equationGraph(`${lhsText} = ${rhsText}`, variable, left, right, [root.toNumber()]),
      };
      return withCopy(result);
    }

    const sqrt = delta.sqrt();
    const r1 = b.neg().sub(sqrt ?? Rational.ZERO).div(denominator);
    const r2 = b.neg().add(sqrt ?? Rational.ZERO).div(denominator);
    const low = r1.compare(r2) <= 0 ? r1 : r2;
    const high = low === r1 ? r2 : r1;
    const approx1 = (-b.toNumber() - Math.sqrt(delta.toNumber())) / (2 * a.toNumber());
    const approx2 = (-b.toNumber() + Math.sqrt(delta.toNumber())) / (2 * a.toNumber());

    let rootStep: Step;
    let roots: Array<{ value: number; exact: Rational | null }>;
    let exactStrings: [string, string];
    if (sqrt) {
      const leading = a.isOne() ? '' : `${formatRational(a)}`;
      rootStep = step('factor', `${leading}(${factorTerm(variable, low)})(${factorTerm(variable, high)}) = 0`);
      roots = [{ value: low.toNumber(), exact: low }, { value: high.toNumber(), exact: high }];
      exactStrings = [formatRational(low), formatRational(high)];
    } else {
      exactStrings = quadraticRootStrings(quadraticForm(a, b, delta));
      const [rootA, rootB] = exactStrings;
      rootStep = step('radical', `${variable} = ${rootA}, ${variable} = ${rootB}`);
      roots = [{ value: Math.min(approx1, approx2), exact: null }, { value: Math.max(approx1, approx2), exact: null }];
    }
    const { solutions, ok } = verificationForEquation(left, right, variable, roots, diff);
    solutions[0].exact = exactStrings[0];
    solutions[1].exact = exactStrings[1];
    const values = roots.map((r) => r.value);
    const result: MathResult = {
      ...baseResult(input), topic: 'algebra', titleKey: 'result.solutions',
      result: `${variable} = ${solutions[0].exact}, ${variable} = ${solutions[1].exact}`,
      steps: [readStep, moveStep, step('coefficients', `a = ${formatRational(a)}, b = ${formatRational(b)}, c = ${formatRational(c)}`),
        discriminantStep, formulaStep, rootStep,
        step('check', `${formatNumber(values[0])} and ${formatNumber(values[1])} make ${differenceText} = 0`)],
      solutions,
      verification: { key: ok ? 'verify.roots' : 'verify.failed', ok, params: { count: '2' } },
      graph: equationGraph(`${lhsText} = ${rhsText}`, variable, left, right, values),
    };
    return withCopy(result);
  }

  // Higher degree: exact symbolic solving is intentionally NOT claimed.
  return numericEquationResult(input, left, right, variable, readStep, diff, moveStep);
}

function rootSummary(variable: string, roots: number[], max = 4): string {
  if (roots.length === 0) return 'none in [−20, 20]';
  const shown = roots.slice(0, max).map((r) => `${variable} ≈ ${formatNumber(r)}`).join(', ');
  return roots.length > max ? `${shown}, … (+${roots.length - max} more)` : shown;
}

function numericEquationResult(
  input: string, left: Expr, right: Expr, variable: string,
  readStep: Step, diff: Polynomial | null, moveStep?: Step,
): MathResult {
  const roots = numericEquationRoots(left, right, variable, -20, 20);
  const { solutions, ok } = verificationForEquation(left, right, variable, roots.map((value) => ({ value, exact: null })));
  const rhsIsZero = right.type === 'num' && right.value.isZero();
  const differenceText = rhsIsZero ? formatExpr(left) : `${formatExpr(left)} ${MINUS} (${formatExpr(right)})`;
  const steps = [readStep, ...(moveStep ? [moveStep] : [step('nonPolynomial', `${differenceText} = 0`)])];
  steps.push(step('numericRoots', rootSummary(variable, roots), { count: String(roots.length) }));
  const result: MathResult = {
    ...baseResult(input), topic: diff ? 'algebra' : 'functions',
    titleKey: roots.length ? 'result.approxSolutions' : 'result.noSolutionFound',
    result: roots.length ? rootSummary(variable, roots) : '—',
    approximate: roots.length > 0,
    steps,
    notes: [note(diff ? 'notes.higherDegree' : 'notes.transcendental', { degree: String(diff?.degree ?? 0) }), note('notes.numericRange')],
    solutions,
    verification: roots.length ? { key: ok ? 'verify.numericRoots' : 'verify.failed', ok, params: { count: String(roots.length) } } : undefined,
    graph: equationGraph(`${formatExpr(left)} = ${formatExpr(right)}`, variable, left, right, roots),
  };
  return withCopy(result);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function solve(input: string): MathResult {
  try {
    const parsed = parseInput(input);
    switch (parsed.kind) {
      case 'equation': return equationResult(parsed, input);
      case 'function': return functionResult(parsed, input);
      case 'expression': return calculationResult(parsed, input);
    }
  } catch (err) {
    return makeError(input, errorCodeOf(err));
  }
}

/** Exposed for unit tests and for the topic examples. */
export function solveExpression(expr: Expr): Rational | null {
  return evaluateWithSteps(expr).exact;
}

export function polynomialDerivative(expr: Expr, variable = 'x'): string {
  return toPolynomial(expr, variable).derivative().toString(variable);
}

export type { GraphSpec, MathResult, Solution, Step };
