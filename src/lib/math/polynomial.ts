import { Rational } from './rational';
import type { Expr } from './parser';
import { formatCoefficient, formatRational, variablePower } from './format';

export class PolynomialError extends Error {
  constructor(public code: string) { super(code); this.name = 'PolynomialError'; }
}

const MAX_DEGREE = 20;

/** Dense polynomial with exact rational coefficients; index = degree. */
export class Polynomial {
  readonly coeffs: Rational[];

  constructor(coeffs: Rational[] = []) {
    let end = coeffs.length;
    while (end > 0 && coeffs[end - 1].isZero()) end--;
    this.coeffs = coeffs.slice(0, end);
  }

  static zero(): Polynomial { return new Polynomial(); }
  static constant(r: Rational): Polynomial { return new Polynomial([r]); }
  static monomial(degree: number, r: Rational = Rational.ONE): Polynomial {
    const coeffs = Array.from({ length: degree + 1 }, () => Rational.ZERO);
    coeffs[degree] = r;
    return new Polynomial(coeffs);
  }

  get degree(): number { return this.coeffs.length - 1; }
  get(i: number): Rational { return this.coeffs[i] ?? Rational.ZERO; }
  isZero(): boolean { return this.coeffs.length === 0; }

  add(o: Polynomial): Polynomial {
    const out = Array.from({ length: Math.max(this.coeffs.length, o.coeffs.length) }, (_, i) => this.get(i).add(o.get(i)));
    return new Polynomial(out);
  }
  sub(o: Polynomial): Polynomial {
    const out = Array.from({ length: Math.max(this.coeffs.length, o.coeffs.length) }, (_, i) => this.get(i).sub(o.get(i)));
    return new Polynomial(out);
  }
  negate(): Polynomial { return new Polynomial(this.coeffs.map((c) => c.neg())); }
  scale(r: Rational): Polynomial { return new Polynomial(this.coeffs.map((c) => c.mul(r))); }
  mul(o: Polynomial): Polynomial {
    if (this.isZero() || o.isZero()) return Polynomial.zero();
    const out = Array.from({ length: this.degree + o.degree + 1 }, () => Rational.ZERO);
    for (let i = 0; i < this.coeffs.length; i++) {
      for (let j = 0; j < o.coeffs.length; j++) out[i + j] = out[i + j].add(this.get(i).mul(o.get(j)));
    }
    return new Polynomial(out);
  }
  pow(exp: number): Polynomial {
    let result = Polynomial.constant(Rational.ONE);
    let base: Polynomial = this;
    let e = exp;
    while (e > 0) {
      if (e % 2 === 1) result = result.mul(base);
      base = base.mul(base);
      e = Math.floor(e / 2);
    }
    return result;
  }
  derivative(): Polynomial {
    const out: Rational[] = [];
    for (let i = 1; i < this.coeffs.length; i++) out[i - 1] = this.get(i).mul(new Rational(BigInt(i)));
    return new Polynomial(out);
  }
  evalRational(x: Rational): Rational {
    let result = Rational.ZERO;
    for (let i = this.coeffs.length - 1; i >= 0; i--) result = result.mul(x).add(this.get(i));
    return result;
  }
  evalNumber(x: number): number {
    let result = 0;
    for (let i = this.coeffs.length - 1; i >= 0; i--) result = result * x + this.get(i).toNumber();
    return result;
  }
  toString(variable = 'x'): string {
    if (this.isZero()) return '0';
    let text = '';
    for (let d = this.degree; d >= 0; d--) {
      const c = this.get(d);
      if (c.isZero()) continue;
      const sign = c.sign < 0 ? ' − ' : ' + ';
      const term = `${formatCoefficient(c, d)}${variablePower(variable, d)}`;
      text = text === '' ? (c.sign < 0 ? `−${term}` : term) : `${text}${sign}${term}`;
    }
    return text;
  }
}

/** Converts an expression tree to an exact polynomial in one variable. */
export function toPolynomial(expr: Expr, variable: string): Polynomial {
  switch (expr.type) {
    case 'num': return Polynomial.constant(expr.value);
    case 'const': throw new PolynomialError('irrationalConstant');
    case 'var':
      if (expr.name !== variable) throw new PolynomialError('otherVariable');
      return Polynomial.monomial(1);
    case 'unary':
      return expr.op === '-' ? toPolynomial(expr.arg, variable).negate() : toPolynomial(expr.arg, variable);
    case 'func': throw new PolynomialError('nonPolynomial');
    case 'binary': {
      const left = toPolynomial(expr.left, variable);
      const right = toPolynomial(expr.right, variable);
      switch (expr.op) {
        case '+': return left.add(right);
        case '-': return left.sub(right);
        case '*': {
          if (left.degree + right.degree > MAX_DEGREE) throw new PolynomialError('degreeTooHigh');
          return left.mul(right);
        }
        case '/': {
          if (right.isZero()) throw new PolynomialError('divisionByZero');
          if (right.degree !== 0) throw new PolynomialError('variableDenominator');
          return left.scale(right.get(0).inv());
        }
        case '^': {
          if (expr.right.type !== 'num' || !expr.right.value.isInteger()) throw new PolynomialError('nonIntegerExponent');
          const exp = expr.right.value.toNumber();
          if (exp < 0) throw new PolynomialError('negativePower');
          if (left.degree * exp > MAX_DEGREE) throw new PolynomialError('degreeTooHigh');
          return left.pow(exp);
        }
      }
    }
  }
}

export function formatRationalPair(n: Rational, d: Rational): string {
  return d.isOne() ? formatRational(n) : `${formatRational(n)}/${formatRational(d)}`;
}
