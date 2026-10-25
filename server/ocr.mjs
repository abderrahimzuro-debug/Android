import { config } from './config.mjs';

export class OcrServiceError extends Error {
  constructor(code, status = 502, detail = '') {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail; // short, sanitised detail for server logs only
  }
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Validates a data URL. The decoded image only ever lives in memory for the
 * duration of one upstream request; nothing is written to disk or logged.
 */
export function validateImage(value) {
  if (typeof value !== 'string' || value.length > config.ocr.maxBodyBytes) {
    throw new OcrServiceError('ocr.badImage', 400);
  }
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) throw new OcrServiceError('ocr.badImage', 400);
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.has(mime)) throw new OcrServiceError('ocr.badImage', 400);
  const base64 = match[2].replace(/\s/g, '');
  const bytes = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes <= 0 || bytes > config.ocr.maxImageBytes) throw new OcrServiceError('ocr.tooLarge', 413);
  return { dataUrl: `data:${mime};base64,${base64}`, mime, bytes };
}

async function parseUpstream(response) {
  let body;
  try { body = await response.json(); } catch { throw new OcrServiceError('ocr.upstream', 502, 'non-JSON response'); }
  if (!response.ok) {
    // Do not forward upstream bodies: they may contain account details.
    throw new OcrServiceError('ocr.upstream', 502, `status ${response.status}`);
  }
  const latex = typeof body.latex === 'string' && body.latex.trim()
    ? body.latex
    : typeof body.latex_styled === 'string' && body.latex_styled.trim()
      ? body.latex_styled
      : typeof body.text === 'string' && body.text.trim()
        ? body.text
        : '';
  const rawConfidence = body.latex_confidence ?? body.confidence ?? body.confidence_rate ?? null;
  const confidence = typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(1, rawConfidence > 1 ? rawConfidence / 100 : rawConfidence))
    : null;
  return { latex: latex.trim(), confidence };
}

/** Calls the configured provider. Keys stay on the server, never in the browser bundle. */
export async function callOcrProvider(dataUrl, signal) {
  const { provider, endpoint, appId, appKey, apiKey } = config.ocr;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  let body;
  if (provider === 'mathpix') {
    headers.app_id = appId;
    headers.app_key = appKey;
    body = JSON.stringify({ src: dataUrl, formats: ['text', 'latex_styled'], math_inline: true });
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = JSON.stringify({ image: dataUrl, formats: ['latex'] });
  }
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers, body, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new OcrServiceError('ocr.timeout', 504);
    throw new OcrServiceError('ocr.network', 502, error?.code || 'fetch failed');
  }
  const parsed = await parseUpstream(response);
  if (!parsed.latex) throw new OcrServiceError('ocr.noText', 422);
  return parsed;
}
