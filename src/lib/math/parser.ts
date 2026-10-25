import { Rational } from './rational';

export type BinaryOp = '+' | '-' | '*' | '/' | '^';
export type FunctionName =
  | 'sqrt' | 'abs' | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'
  | 'ln' | 'log' | 'log2' | 'exp' | 'floor' | 'ceil' | 'round' | 'sign';

export type Expr =
  | { type: 'num'; value: Rational }
  | { type: 'const'; name: 'pi' | 'e' | 'tau' }
  | { type: 'var'; name: string }
  | { type: 'unary'; op: '-' | '+'; arg: Expr }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { type: 'func'; name: FunctionName; arg: Expr };

export const FUNCTIONS: Record<string, FunctionName> = {
  sqrt: 'sqrt', abs: 'abs', sin: 'sin', cos: 'cos', tan: 'tan',
  asin: 'asin', acos: 'acos', atan: 'atan', arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  ln: 'ln', log: 'log', log2: 'log2', exp: 'exp', floor: 'floor', ceil: 'ceil', round: 'round', sign: 'sign',
};

const CONSTANTS: Record<string, 'pi' | 'e' | 'tau'> = { pi: 'pi', e: 'e', tau: 'tau' };

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/** Normalises Unicode math, Arabic-Indic digits and radicals into plain ASCII-ish notation. */
export function normalizeInput(input: string): string {
  let s = input.trim();
  s = s
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[٫،]/g, '.')
    .replace(/[×∙•∗·]/g, '*')
    .replace(/[÷∕⁄]/g, '/')
    .replace(/[−–—‐‑]/g, '-')
    .replace(/[\[\{]/g, '(')
    .replace(/[\]\}]/g, ')')
    .replace(/π/g, 'pi')
    .replace(/τ/g, 'tau')
    .replace(/[ \t\r\n]+/g, ' ');

  // Superscript digits become explicit powers: x² -> x^2, x⁻¹² -> x^(-12).
  s = s.replace(/([⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_match, group: string) => {
    const negative = group.startsWith('⁻');
    const digits = [...group].filter((c) => c in SUPERSCRIPTS).map((c) => SUPERSCRIPTS[c]).join('');
    return negative ? `^(${'-' + digits})` : `^${digits}`;
  });

  s = expandRadicals(s);
  return s.trim();
}

/** √9 -> sqrt(9), √(x+1) -> sqrt(x+1), √x -> sqrt(x). */
function expandRadicals(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== '√') { out += input[i]; continue; }
    let j = i + 1;
    while (input[j] === ' ') j++;
    if (input[j] === '(') {
      let depth = 0;
      let k = j;
      for (; k < input.length; k++) {
        if (input[k] === '(') depth++;
        if (input[k] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) throw new MathInputError('unbalancedParens');
      out += 'sqrt' + input.slice(j, k + 1);
      i = k;
    } else {
      const rest = input.slice(j);
      const primary = rest.match(/^(\d+(?:\.\d+)?|\.?\d+|[A-Za-z]+(?:\s*\([^()]*\))?|pi|e|tau)/);
      if (!primary) throw new MathInputError('sqrtArgument');
      out += `sqrt(${primary[0].replace(/\s+/g, '')})`;
      i = j + primary[0].length - 1;
    }
  }
  return out;
}

export class MathInputError extends Error {
  constructor(public code: string, public position?: number) {
    super(code);
    this.name = 'MathInputError';
  }
}

type TokenType = 'number' | 'ident' | 'const' | 'func' | 'op' | 'lparen' | 'rparen' | 'eof';
interface Token { type: TokenType; value: string; pos: number; implicit?: boolean }

function scan(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === ' ') { i++; continue; }
    const pos = i;
    if (/[0-9.]/.test(c)) {
      const m = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!m) throw new MathInputError('badNumber', pos);
      tokens.push({ type: 'number', value: m[0], pos });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      const m = source.slice(i).match(/^[A-Za-z]+/);
      const word = m![0];
      const lower = word.toLowerCase();
      if (CONSTANTS[lower] && word.length <= 3) {
        tokens.push({ type: 'const', value: CONSTANTS[lower], pos });
      } else if (FUNCTIONS[lower]) {
        tokens.push({ type: 'func', value: FUNCTIONS[lower], pos });
      } else {
        // Split unknown words into single-letter variables: xy -> x * y.
        for (const ch of lower) tokens.push({ type: 'ident', value: ch, pos });
      }
      i += word.length;
      continue;
    }
    if ('+-*/^'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos });
      i++;
      continue;
    }
    if (c === '(') { tokens.push({ type: 'lparen', value: c, pos }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: c, pos }); i++; continue; }
    if (c === ',' || c === ';') throw new MathInputError('unsupportedSeparator', pos);
    throw new MathInputError('unknownCharacter', pos);
  }
  tokens.push({ type: 'eof', value: '', pos: source.length });
  return tokens;
}

function startsPrimary(t: Token): boolean {
  return t.type === 'number' || t.type === 'ident' || t.type === 'const' || t.type === 'func' || t.type === 'lparen';
}
function endsPrimary(t: Token): boolean {
  return t.type === 'number' || t.type === 'ident' || t.type === 'const' || t.type === 'rparen';
}

function withImplicitMultiplication(raw: Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    out.push(t);
    const next = raw[i + 1];
    if (!next || t.type === 'func') continue;
    if (endsPrimary(t) && startsPrimary(next)) {
      out.push({ type: 'op', value: '*', pos: next.pos, implicit: true });
    }
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token { return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]; }
  private next(): Token { return this.tokens[this.i++]; }
  private isOp(value: string): boolean { return this.peek().type === 'op' && this.peek().value === value; }

  parse(): Expr {
    const expr = this.parseAddSub();
    if (this.peek().type !== 'eof') {
      const t = this.peek();
      throw new MathInputError(t.type === 'rparen' ? 'unbalancedParens' : 'unexpectedToken', t.pos);
    }
    return expr;
  }

  private parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().value as '+' | '-';
      left = { type: 'binary', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  private parseMulDiv(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'op' || !['*', '/'].includes(t.value)) break;
      this.next();
      const right = this.parseUnary();
      left = { type: 'binary', op: t.value as '*' | '/', left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isOp('-') || this.isOp('+')) {
      const op = this.next().value as '-' | '+';
      return { type: 'unary', op, arg: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePrimary();
    if (this.isOp('^')) {
      this.next();
      const exponent = this.parseUnary(); // right associative: 2^3^2 = 2^(3^2)
      return { type: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parsePrimary(): Expr {
    const t = this.next();
    switch (t.type) {
      case 'number': {
        const [whole, frac = ''] = t.value.split('.');
        const denominator = 10n ** BigInt(frac.length);
        const numerator = BigInt((whole || '0') + frac);
        return { type: 'num', value: new Rational(numerator, denominator) };
      }
      case 'const':
        return { type: 'const', name: t.value as 'pi' | 'e' | 'tau' };
      case 'ident':
        return { type: 'var', name: t.value };
      case 'func': {
        let arg: Expr;
        if (this.peek().type === 'lparen') {
          this.next();
          arg = this.parseAddSub();
          if (this.peek().type !== 'rparen') throw new MathInputError('unbalancedParens', this.peek().pos);
          this.next();
        } else {
          arg = this.parseUnary();
        }
        return { type: 'func', name: t.value as FunctionName, arg };
      }
      case 'lparen': {
        const inner = this.parseAddSub();
        if (this.peek().type !== 'rparen') throw new MathInputError('unbalancedParens', this.peek().pos);
        this.next();
        return inner;
      }
      case 'eof':
        throw new MathInputError('incomplete', t.pos);
      default:
        throw new MathInputError(t.type === 'rparen' ? 'unbalancedParens' : 'unexpectedToken', t.pos);
    }
  }
}

export function parseExpression(input: string): Expr {
  const normalized = normalizeInput(input);
  if (!normalized) throw new MathInputError('empty');
  if (/(?:\\|≠|≤|≥|<|>)/.test(normalized)) throw new MathInputError('unsupportedSyntax');
  const tokens = withImplicitMultiplication(scan(normalized));
  return new Parser(tokens).parse();
}

export type ParsedInput =
  | { kind: 'expression'; expr: Expr; normalized: string }
  | { kind: 'equation'; left: Expr; right: Expr; normalized: string }
  | { kind: 'function'; expr: Expr; name: string; normalized: string };

const FUNCTION_HEAD = /^(?:y|f\(\s*x\s*\)|g\(\s*x\s*\)|y\(\s*x\s*\)|f|g)\s*$/i;

/** Parses a whole user input, including `... = ...` and `y = ...` forms. */
export function parseInput(input: string): ParsedInput {
  const normalized = normalizeInput(input);
  if (!normalized) throw new MathInputError('empty');
  const eqIndex = normalized.indexOf('=');
  if (eqIndex === -1) return { kind: 'expression', expr: parseExpression(normalized), normalized };

  if (normalized.indexOf('=', eqIndex + 1) !== -1) throw new MathInputError('multipleEquals');
  const lhs = normalized.slice(0, eqIndex).trim();
  const rhs = normalized.slice(eqIndex + 1).trim();
  if (!lhs || !rhs) throw new MathInputError('incomplete');
  if (FUNCTION_HEAD.test(lhs)) {
    return { kind: 'function', expr: parseExpression(rhs), name: lhs, normalized };
  }
  return {
    kind: 'equation',
    left: parseExpression(lhs),
    right: parseExpression(rhs),
    normalized,
  };
}

export function collectVariables(expr: Expr, into = new Set<string>()): Set<string> {
  switch (expr.type) {
    case 'var': into.add(expr.name); break;
    case 'unary': collectVariables(expr.arg, into); break;
    case 'binary': collectVariables(expr.left, into); collectVariables(expr.right, into); break;
    case 'func': collectVariables(expr.arg, into); break;
    default: break;
  }
  return into;
}
