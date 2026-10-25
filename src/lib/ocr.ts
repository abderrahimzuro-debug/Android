export interface OcrStatus {
  configured: boolean;
  provider: string | null;
  message?: string;
}

export interface OcrResult {
  latex: string;
  expression: string;
  confidence: number | null;
  provider: string;
  warnings: string[];
}

export class OcrError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = 'OcrError';
  }
}

export function ocrErrorCode(error: unknown): string {
  if (error instanceof OcrError) return error.code;
  return 'ocr.network';
}

/** No key, no fake result: this endpoint only reports whether the server has credentials. */
export async function fetchOcrStatus(signal?: AbortSignal): Promise<OcrStatus> {
  const response = await fetch('/api/ocr/status', { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new OcrError('ocr.unknown');
  return (await response.json()) as OcrStatus;
}

export async function recognizeImage(imageDataUrl: string, signal?: AbortSignal): Promise<OcrResult> {
  let response: Response;
  try {
    response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ image: imageDataUrl }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new OcrError('ocr.network');
  }
  let body: Record<string, unknown> = {};
  try { body = await response.json(); } catch { /* fall through to generic error */ }
  if (!response.ok) {
    const code = typeof body.code === 'string' ? body.code : 'ocr.unknown';
    throw new OcrError(code.startsWith('ocr.') ? code : `ocr.${code}`, typeof body.message === 'string' ? body.message : undefined);
  }
  const latex = typeof body.latex === 'string' ? body.latex : '';
  if (!latex.trim()) throw new OcrError('ocr.noText');
  const converted = latexToExpression(latex);
  const confidence = typeof body.confidence === 'number' && body.confidence >= 0 && body.confidence <= 1
    ? body.confidence : null;
  return {
    latex,
    expression: converted.expression,
    confidence,
    provider: typeof body.provider === 'string' ? body.provider : 'unknown',
    warnings: converted.warnings,
  };
}

const SYMBOLS: Record<string, string> = {
  pi: 'π', tau: 'τ', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', phi: 'φ', omega: 'ω',
  cdot: '*', times: '*', ast: '*', div: '/', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', sim: '~', equiv: '≡', infty: '∞', ldots: '...', cdots: '...', vdots: '...',
  angle: '∠', degree: '°', perpendicular: '⊥', parallel: '∥', therefore: '∴', quad: ' ', qquad: ' ',
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  ln: 'ln', log: 'log', exp: 'exp', arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
};

const SKIP_COMMANDS = new Set([
  'left', 'right', 'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'middle', 'nonumber', 'tag',
  'overline', 'underline', 'hat', 'vec', 'bar', 'tilde', 'widehat', 'widetilde', 'mathcal', 'mathbf', 'mathbb',
  ',', ';', ':', '!', ' ', 'mathrm', 'operatorname', 'text', 'textbf', 'mbox', 'boldsymbol', 'operatorname*',
]);

function readGroup(src: string, index: number): { value: string; next: number } {
  if (src[index] !== '{') {
    if (src[index] === '\\') {
      const m = src.slice(index + 1).match(/^[A-Za-z]+/);
      if (m) return { value: `\\${m[0]}`, next: index + 1 + m[0].length };
    }
    return { value: src[index] ?? '', next: index + 1 };
  }
  let depth = 0;
  for (let i = index; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return { value: src.slice(index + 1, i), next: i + 1 };
    }
  }
  return { value: src.slice(index + 1), next: src.length };
}

/**
 * Converts recognised LaTeX into MathFlow's plain-text notation. Anything that
 * cannot be represented is left visible (or reported as a warning) so the user
 * can correct it instead of us silently inventing a different problem.
 */
export function latexToExpression(latex: string): { expression: string; warnings: string[] } {
  const warnings: string[] = [];
  let src = latex
    .replace(/\$+/g, '')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, '')
    .replace(/\\\[/g, '').replace(/\\\]/g, '')
    .replace(/\\\(/g, '').replace(/\\\)/g, '')
    .replace(/\\%/g, '%')
    .replace(/%.*$/gm, '')
    .replace(/\\\\/g, '\n')
    .replace(/\\newline/g, '\n');

  if (src.includes('\n')) {
    const lines = src.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) warnings.push('scan.multilineWarning');
    src = lines[0] ?? '';
  }

  const convert = (text: string): string => {
    let out = '';
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        const m = text.slice(i + 1).match(/^([A-Za-z]+|.)/);
        if (!m) { i++; continue; }
        const command = m[1];
        i += 1 + command.length;
        if (command === 'frac' || command === 'dfrac' || command === 'tfrac' || command === 'cfrac') {
          const a = readGroup(text, i); i = a.next;
          const b = readGroup(text, i); i = b.next;
          out += `((${convert(a.value)})/(${convert(b.value)}))`;
          continue;
        }
        if (command === 'sqrt') {
          let root = '';
          if (text[i] === '[') {
            const close = text.indexOf(']', i);
            if (close !== -1) { root = convert(text.slice(i + 1, close)); i = close + 1; }
          }
          const g = readGroup(text, i); i = g.next;
          const value = `sqrt(${convert(g.value)})`;
          out += root ? `((${value})^(1/(${root})))` : value;
          continue;
        }
        if (command === 'boxed' || command === 'mathrm' || command === 'text' || command === 'operatorname' || command === 'boldsymbol') {
          const g = readGroup(text, i); i = g.next;
          out += convert(g.value);
          continue;
        }
        if (SKIP_COMMANDS.has(command)) continue;
        if (SYMBOLS[command]) { out += SYMBOLS[command]; continue; }
        warnings.push('scan.unsupportedLatex');
        out += ` ${command} `;
        continue;
      }
      if (c === '{' || c === '[') {
        const close = c === '{' ? '}' : ']';
        const start = i + 1;
        let depth = 1;
        let j = start;
        for (; j < text.length && depth > 0; j++) {
          if (text[j] === c) depth++;
          else if (text[j] === close) depth--;
        }
        out += `(${convert(text.slice(start, j - 1))})`;
        i = j;
        continue;
      }
      if (c === '}' || c === ']') { i++; continue; }
      if (c === '^' || c === '_') {
        let j = i + 1;
        while (text[j] === ' ') j++;
        if (c === '_') {
          // Subscripts are not supported: keep them visible for manual correction.
          warnings.push('scan.subscriptWarning');
          if (text[j] === '{') {
            let depth = 0, k = j;
            for (; k < text.length; k++) {
              if (text[k] === '{') depth++;
              if (text[k] === '}') { depth--; if (depth === 0) break; }
            }
            out += `[${convert(text.slice(j + 1, k))}]`;
            i = k + 1;
          }
          continue;
        }
        if (text[j] === '{') {
          let depth = 0, k = j;
          for (; k < text.length; k++) {
            if (text[k] === '{') depth++;
            if (text[k] === '}') { depth--; if (depth === 0) break; }
          }
          out += `^(${convert(text.slice(j + 1, k))})`;
          i = k + 1;
        } else {
          const one = readGroup(text, j);
          out += `^(${convert(one.value)})`;
          i = one.next;
        }
        continue;
      }
      if (c === '|') { out += '|'; i++; continue; }
      out += c;
      i++;
    }
    return out;
  };

  let expression = convert(src)
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  // A trailing percent or stray braces are common OCR artefacts.
  if (expression.endsWith('%')) { expression = expression.slice(0, -1).trim(); warnings.push('scan.cleanedLatex'); }
  if (!expression) warnings.push('scan.noText');
  return { expression, warnings: [...new Set(warnings)] };
}
