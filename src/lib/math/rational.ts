/**
 * Exact rational arithmetic on BigInt. No floating point is used for exact
 * calculations, so 1/2 + 1/3 is exactly 5/6 and never 0.8333333333333333.
 */

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1n;
}

export function bigIntSqrt(n: bigint): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  // Integer Newton iteration, guaranteed to terminate.
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2) + 1);
  let y = (x + n / x) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x * x === n ? x : null;
}

/** Floor of the integer square root (for exact radical simplification). */
export function bigIntFloorSqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  let y = (x + n / x) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}

export class Rational {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint | number | string, d: bigint | number | string = 1n) {
    let num = BigInt(n);
    let den = BigInt(d);
    if (den === 0n) throw new Error('Division by zero');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den);
    this.n = num / g;
    this.d = den / g;
  }

  static readonly ZERO = new Rational(0n);
  static readonly ONE = new Rational(1n);

  /** Best rational approximation with a bounded denominator (continued fraction). */
  static fromNumber(value: number, maxDenominator = 1_000_000_000n): Rational {
    if (!Number.isFinite(value)) throw new Error('Cannot convert a non-finite number to a fraction');
    const sign = value < 0 ? -1n : 1n;
    let x = Math.abs(value);
    let p0 = 0n, q0 = 1n, p1 = 1n, q1 = 0n;
    for (let i = 0; i < 40; i++) {
      const a = BigInt(Math.floor(x));
      const p2 = a * p1 + p0;
      const q2 = a * q1 + q0;
      if (q2 > maxDenominator) {
        return new Rational(sign * p1, q1);
      }
      p0 = p1; q0 = q1; p1 = p2; q1 = q2;
      const frac = x - Math.floor(x);
      if (frac < 1e-12) break;
      x = 1 / frac;
    }
    return new Rational(sign * p1, q1);
  }

  add(o: Rational): Rational { return new Rational(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o: Rational): Rational { return new Rational(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o: Rational): Rational { return new Rational(this.n * o.n, this.d * o.d); }
  div(o: Rational): Rational {
    if (o.isZero()) throw new Error('Division by zero');
    return new Rational(this.n * o.d, this.d * o.n);
  }
  neg(): Rational { return new Rational(-this.n, this.d); }
  abs(): Rational { return new Rational(this.n < 0n ? -this.n : this.n, this.d); }
  inv(): Rational {
    if (this.isZero()) throw new Error('Division by zero');
    return new Rational(this.d, this.n);
  }
  pow(exp: number): Rational {
    if (!Number.isInteger(exp) || Math.abs(exp) > 1000) throw new Error('Unsupported exponent');
    if (exp === 0) return Rational.ONE;
    const e = exp > 0 ? exp : -exp;
    const n = this.n ** BigInt(e);
    const d = this.d ** BigInt(e);
    return exp > 0 ? new Rational(n, d) : new Rational(d, n);
  }
  sqrt(): Rational | null {
    const n = bigIntSqrt(this.n);
    const d = bigIntSqrt(this.d);
    if (n === null || d === null) return null;
    return new Rational(n, d);
  }
  compare(o: Rational): number {
    const diff = this.n * o.d - o.n * this.d;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  }
  get sign(): number { return this.n < 0n ? -1 : this.n > 0n ? 1 : 0; }
  isZero(): boolean { return this.n === 0n; }
  isOne(): boolean { return this.n === 1n && this.d === 1n; }
  isNegativeOne(): boolean { return this.n === -1n && this.d === 1n; }
  isInteger(): boolean { return this.d === 1n; }
  toNumber(): number { return Number(this.n) / Number(this.d); }
  toString(): string { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
  toJSON(): string { return this.toString(); }
}
