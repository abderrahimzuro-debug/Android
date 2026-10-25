import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';
import { HISTORY_KEY } from '../src/lib/storage';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/ocr/status')) return json({ configured: true, provider: 'mathpix' });
    return json({});
  }));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

function nav(label: string) {
  return screen.getAllByRole('button', { name: label })[0];
}

describe('MathFlow app', () => {
  it('solves a problem, explains it and stores it locally', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const input = screen.getByTestId('math-input');
    await user.type(input, '2+3×4=14');
    await user.click(screen.getByTestId('solve-button'));

    expect(await screen.findByTestId('result-value')).toHaveTextContent('14');
    expect(screen.getByText('Both sides are equal')).toBeInTheDocument();
    expect(screen.getByText('3 × 4 = 12')).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].expression).toBe('2+3×4=14');

    unmount();
    render(<App />);
    await user.click(nav('History'));
    expect(await screen.findByTestId('history-item')).toHaveTextContent('2+3×4=14');
  });

  it('switches to Arabic/RTL and dark mode, and keeps those settings after a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByTestId('language-toggle'));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByText('ماذا نحل اليوم؟')).toBeInTheDocument();

    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement.dataset.theme).toBe('dark');

    unmount();
    render(<App />);
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps manual solving, graphs and history available while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();

    await user.click(screen.getByTestId('open-scan'));
    expect(screen.getByText('Scanning is unavailable offline')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Enter it manually' }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.type(screen.getByTestId('math-input'), '1/2+1/3');
    await user.click(screen.getByTestId('solve-button'));
    expect(await screen.findByTestId('result-value')).toHaveTextContent('5');
    expect(screen.getByText('Common denominator 6')).toBeInTheDocument();
    await user.click(nav('Graph'));
    expect(screen.getByTestId('graph-card')).toBeInTheDocument();
  });

  it('draws an interactive graph and lists its intercepts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(nav('Graph'));
    expect(screen.getByTestId('graph-card')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('graph-input'), { target: { value: 'y=x^2-4' } });
    fireEvent.click(screen.getByTestId('graph-plot'));
    await waitFor(() => {
      const footer = screen.getByText('Useful points in view').closest('.graph-footer');
      expect(footer).not.toBeNull();
      expect(within(footer as HTMLElement).getAllByRole('button').length).toBeGreaterThan(0);
    });
  });

  it('favourites an entry and keeps the flag after remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(screen.getByTestId('math-input'), '2x+3=11');
    await user.click(screen.getByTestId('solve-button'));
    expect(await screen.findByTestId('result-value')).toHaveTextContent('x = 4');

    await user.click(screen.getByRole('button', { name: 'Save to favourites' }));
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    expect(stored[0].favorite).toBe(true);

    unmount();
    render(<App />);
    await user.click(nav('History'));
    await user.click(screen.getByRole('button', { name: 'Favourites' }));
    expect(await screen.findByTestId('history-item')).toBeInTheDocument();
  });
});
