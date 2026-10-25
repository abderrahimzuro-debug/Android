import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const provider = (process.env.OCR_PROVIDER || 'mathpix').toLowerCase().trim();
const defaultEndpoint = provider === 'mathpix' ? 'https://api.mathpix.com/v3/text' : '';
const maxImageBytes = Number(process.env.OCR_MAX_IMAGE_BYTES || 8 * 1024 * 1024);

export const config = {
  root,
  dev: process.argv.includes('--dev') || process.env.NODE_ENV !== 'production',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  ocr: {
    provider,
    endpoint: (process.env.OCR_ENDPOINT || defaultEndpoint).trim(),
    appId: process.env.MATHPIX_APP_ID || '',
    appKey: process.env.MATHPIX_APP_KEY || '',
    apiKey: process.env.OCR_API_KEY || '',
    timeoutMs: Number(process.env.OCR_TIMEOUT_MS || 25000),
    maxImageBytes,
    maxBodyBytes: Math.ceil(maxImageBytes * 1.6) + 1024,
    rateWindowMs: Number(process.env.OCR_RATE_WINDOW_MS || 10 * 60 * 1000),
    rateMax: Number(process.env.OCR_RATE_LIMIT || 20),
  },
};

/** Never returns credential material to the browser. */
export function ocrConfigured() {
  const { provider, endpoint, appId, appKey, apiKey } = config.ocr;
  if (!endpoint) return false;
  if (provider === 'mathpix') return Boolean(appId && appKey);
  if (provider === 'custom') return Boolean(apiKey);
  return false;
}

export function ocrConfigProblems() {
  const problems = [];
  const { provider, endpoint, appId, appKey, apiKey } = config.ocr;
  if (!['mathpix', 'custom'].includes(provider)) problems.push(`Unknown OCR_PROVIDER "${provider}"`);
  if (!endpoint) problems.push('OCR_ENDPOINT is empty');
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      problems.push('OCR_ENDPOINT must use https (http is only allowed for localhost)');
    }
  } catch { problems.push('OCR_ENDPOINT is not a valid URL'); }
  if (provider === 'mathpix' && (!appId || !appKey)) problems.push('MATHPIX_APP_ID / MATHPIX_APP_KEY are missing');
  if (provider === 'custom' && !apiKey) problems.push('OCR_API_KEY is missing');
  return problems;
}
