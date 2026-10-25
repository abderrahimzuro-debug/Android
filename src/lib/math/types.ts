import type { Expr } from './parser';

/** A structured step: the UI localises `key` and renders `math` verbatim. */
export interface Step {
  key: string;
  params?: Record<string, string>;
  math?: string;
}

export interface GraphCurve {
  label: string;
  expr: Expr;
  color: 'primary' | 'secondary' | 'accent';
}

export interface GraphPoint {
  x: number;
  y: number;
  label: string;
  kind: 'root' | 'intercept' | 'extremum' | 'solution';
}

export interface GraphSpec {
  title: string;
  variable: string;
  curves: GraphCurve[];
  points: GraphPoint[];
}

export interface Solution {
  exact: string;
  approx: number;
  verified: boolean;
  exactCheck: boolean;
}

export type ResultType = 'calculation' | 'equation' | 'function' | 'error';

export interface MathResult {
  input: string;
  type: ResultType;
  topic: string;
  titleKey: string;
  result: string;
  resultPrefix?: string;
  fraction?: { numerator: string; denominator: string };
  approximate: boolean;
  steps: Step[];
  notes: Array<{ key: string; params?: Record<string, string> }>;
  verification?: { key: string; params?: Record<string, string>; ok: boolean; math?: string };
  graph: GraphSpec | null;
  solutions: Solution[];
  derivative?: { result: string; steps: Step[] };
  copyText: string;
  errorCode?: string;
}
