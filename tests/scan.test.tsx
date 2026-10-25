import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Options { configured?: boolean; ocrResponse?: [unknown, number] }

function mockNetwork(options: Options = {}) {
  const { configured = true, ocrResponse = [{ latex: '2x+3=11', confidence: 0.95, provider: 'mathpix' }, 200] } = options;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/ocr/status')) return json({ configured, provider: configured ? 'mathpix' : null });
    if (url.includes('/api/ocr') && init?.method === 'POST') return json(ocrResponse[0], ocrResponse[1]);
    return json({});
  }));
}

async function openScanner(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByTestId('open-scan'));
  expect(screen.getByTestId('scan-modal')).toBeInTheDocument();
}

async function uploadAndReachCrop() {
  const file = new File(['fake-image-bytes'], 'equation.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('file-input'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId('crop-image')).toBeInTheDocument());
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
});

describe('camera and OCR failure handling', () => {
  it('shows a clear fallback when camera permission is denied', async () => {
    mockNetwork();
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );
    const user = userEvent.setup();
    await openScanner(user);
    await user.click(screen.getByTestId('use-camera'));
    expect(await screen.findByText('Camera access was blocked')).toBeInTheDocument();
    expect(screen.getByText('Allow camera access in your browser settings, or upload an image instead.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Enter it manually' }).length).toBeGreaterThan(0);
  });

  it('lets the user capture a camera frame and crop it before scanning', async () => {
    mockNetwork();
    const user = userEvent.setup();
    await openScanner(user);
    await user.click(screen.getByTestId('use-camera'));
    expect(await screen.findByTestId('camera-video')).toBeInTheDocument();
    await user.click(screen.getByTestId('capture-photo'));
    expect(screen.getByTestId('crop-box')).toBeInTheDocument();
    expect(screen.getByTestId('scan-selection')).toBeInTheDocument();
  });

  it('never fabricates a result when the OCR provider fails', async () => {
    mockNetwork({ ocrResponse: [{ code: 'ocr.upstream' }, 502] });
    const user = userEvent.setup();
    await openScanner(user);
    await user.click(screen.getByTestId('upload-image'));
    await uploadAndReachCrop();
    await user.click(screen.getByTestId('scan-selection'));
    expect(await screen.findByText('Recognition failed')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-correction')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scan-expression')).not.toBeInTheDocument();
    expect(screen.getByText('The OCR service could not process this image.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Enter it manually' })[0]);
    expect(screen.queryByTestId('scan-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('math-input')).toBeInTheDocument();
  });

  it('explains clearly when OCR is not configured on the server', async () => {
    mockNetwork({ configured: false });
    const user = userEvent.setup();
    await openScanner(user);
    expect(await screen.findByTestId('scan-ocr-warning')).toBeInTheDocument();
    await user.click(screen.getByTestId('upload-image'));
    await uploadAndReachCrop();
    await user.click(screen.getByTestId('scan-selection'));
    expect(await screen.findByText('Recognition is not configured')).toBeInTheDocument();
    expect(screen.queryByTestId('scan-correction')).not.toBeInTheDocument();
  });

  it('allows correcting a recognised equation before solving it', async () => {
    mockNetwork({ ocrResponse: [{ latex: '\\frac{1}{2} + \\frac{1}{3}', confidence: 0.42, provider: 'mathpix' }, 200] });
    const user = userEvent.setup();
    await openScanner(user);
    await user.click(screen.getByTestId('upload-image'));
    await uploadAndReachCrop();
    await user.click(screen.getByTestId('scan-selection'));
    const correction = await screen.findByTestId('scan-correction');
    expect(correction).toBeInTheDocument();
    const textarea = screen.getByTestId('scan-expression') as HTMLTextAreaElement;
    expect(textarea.value).toBe('((1)/(2)) + ((1)/(3))');
    expect(screen.getByText('Confidence 42%')).toBeInTheDocument();
    expect(screen.getByText('Low confidence — please check every symbol.')).toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, '2x+3=11');
    await user.click(screen.getByTestId('scan-solve'));
    expect(await screen.findByTestId('result-value')).toHaveTextContent('x = 4');
    expect(screen.queryByTestId('scan-modal')).not.toBeInTheDocument();
  });

  it('blocks scanning while offline but keeps the manual fallback', async () => {
    mockNetwork();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const user = userEvent.setup();
    await openScanner(user);
    expect(screen.getByText('Scanning is unavailable offline')).toBeInTheDocument();
    expect(screen.getByTestId('scan-modal').getAttribute('data-error-code')).toBe('ocr.unknown');
    await user.click(screen.getAllByRole('button', { name: 'Enter it manually' })[0]);
    expect(screen.queryByTestId('scan-modal')).not.toBeInTheDocument();
  });
});
