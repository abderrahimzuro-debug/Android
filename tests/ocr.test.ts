import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OcrError, fetchOcrStatus, latexToExpression, ocrErrorCode, recognizeImage } from '../src/lib/ocr';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('LaTeX → MathFlow notation', () => {
  it('converts fractions, roots and powers', () => {
    expect(latexToExpression('\\frac{1}{2} + \\frac{1}{3}').expression).toBe('((1)/(2)) + ((1)/(3))');
    expect(latexToExpression('\\sqrt{9}').expression).toBe('sqrt(9)');
    expect(latexToExpression('x^{2} - 5x + 6 = 0').expression).toBe('x^(2) - 5x + 6 = 0');
    expect(latexToExpression('\\frac{x+1}{\\sqrt{2}}').expression).toBe('((x+1)/(sqrt(2)))');
  });

  it('converts symbols and strips LaTeX wrappers', () => {
    expect(latexToExpression('2 \\times 3 \\div 4').expression).toBe('2 * 3 / 4');
    expect(latexToExpression('\\left( x + 1 \\right)^2').expression).toBe('( x + 1 )^(2)');
    expect(latexToExpression('$\\pi + x$').expression).toBe('π + x');
  });

  it('warns about multi-line or unsupported content instead of inventing a result', () => {
    const multi = latexToExpression('x+1=2 \\\\ y-3=4');
    expect(multi.warnings).toContain('scan.multilineWarning');
    expect(multi.expression).toBe('x+1=2');
    const unsupported = latexToExpression('\\matrix{a & b}');
    expect(unsupported.warnings).toContain('scan.unsupportedLatex');
  });
});

describe('OCR client', () => {
  it('reports status without exposing secrets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ configured: true, provider: 'mathpix' })));
    const status = await fetchOcrStatus();
    expect(status).toEqual({ configured: true, provider: 'mathpix' });
  });

  it('returns a converted expression on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ latex: '2x + 3 = 11', confidence: 0.91, provider: 'mathpix' })));
    const result = await recognizeImage('data:image/jpeg;base64,AAAA');
    expect(result.expression).toBe('2x + 3 = 11');
    expect(result.confidence).toBe(0.91);
  });

  it('never fabricates recognition when the server fails or returns empty text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ code: 'ocr.upstream' }, 502)));
    await expect(recognizeImage('data:image/jpeg;base64,AAAA')).rejects.toThrow(OcrError);
    expect(ocrErrorCode(new OcrError('ocr.upstream'))).toBe('ocr.upstream');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ latex: '', confidence: null })));
    await expect(recognizeImage('data:image/jpeg;base64,AAAA')).rejects.toMatchObject({ code: 'ocr.noText' });
  });

  it('maps network failure to a friendly code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(recognizeImage('data:image/jpeg;base64,AAAA')).rejects.toMatchObject({ code: 'ocr.network' });
  });
});
