import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Translator } from '../i18n';
import { formatExpr, formatNumber } from '../lib/math/format';
import { usefulPoints, valueAt } from '../lib/math/graph';
import { sampleFunction } from '../lib/math/numeric';
import type { GraphSpec } from '../lib/math/types';
import { Icon } from './Icons';

interface Viewport { xMin: number; xMax: number; yMin: number; yMax: number }
const DEFAULT_VIEW: Viewport = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  const step = normalised < 1.5 ? 1 : normalised < 3.5 ? 2 : normalised < 7.5 ? 5 : 10;
  return step * magnitude;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function autoViewport(spec: GraphSpec): Viewport {
  const a = DEFAULT_VIEW.xMin, b = DEFAULT_VIEW.xMax;
  const values: number[] = [];
  for (const curve of spec.curves) {
    for (let i = 0; i <= 240; i++) {
      const x = a + (b - a) * i / 240;
      const y = valueAt(curve.expr, spec.variable, x);
      if (Number.isFinite(y) && Math.abs(y) < 1e6) values.push(y);
    }
  }
  for (const p of spec.points) if (Number.isFinite(p.y)) values.push(p.y);
  if (values.length === 0) return DEFAULT_VIEW;
  const sorted = [...values].sort((p, q) => p - q);
  const low = sorted[Math.floor(sorted.length * 0.02)];
  const high = sorted[Math.floor(sorted.length * 0.98)];
  let center = (low + high) / 2;
  let half = Math.max(2, (high - low) * 0.62, Math.abs(center) * 0.15);
  if (!Number.isFinite(center) || !Number.isFinite(half)) return DEFAULT_VIEW;
  if (half > 1e6) { center = 0; half = 1e6; }
  return { xMin: a, xMax: b, yMin: center - half, yMax: center + half };
}

interface Props {
  spec: GraphSpec;
  t: Translator;
  themeKey: string;
  large?: boolean;
  showPoints?: boolean;
}

export function GraphCanvas({ spec, t, themeKey, large = false, showPoints = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 640, height: 340 });
  const [view, setView] = useState<Viewport>(() => autoViewport(spec));
  // Root-finding only runs after the viewport settles, so panning stays smooth.
  const [settledView, setSettledView] = useState<Viewport>(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ view: Viewport; distance: number; center: { x: number; y: number } } | null>(null);

  useEffect(() => {
    setView(autoViewport(spec));
  }, [spec]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.max(200, rect.width), height: Math.max(200, rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledView(view), 180);
    return () => window.clearTimeout(timer);
  }, [view]);

  const points = useMemo(
    () => showPoints ? usefulPoints(spec, settledView.xMin, settledView.xMax) : spec.points,
    [spec, settledView.xMin, settledView.xMax, showPoints],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width: W, height: H } = size;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const surface = cssVar('--surface') || '#fffdf8';
    const gridColor = cssVar('--line') || '#e0dacb';
    const axisColor = cssVar('--line-strong') || '#cfc7b5';
    const textColor = cssVar('--ink-3') || '#718494';
    const brand = cssVar('--brand') || '#0b7f83';
    const accent = cssVar('--accent') || '#d78f34';
    const pointColor = cssVar('--ink') || '#10263a';

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, W, H);

    const { xMin, xMax, yMin, yMax } = view;
    const xRange = xMax - xMin, yRange = yMax - yMin;
    const toX = (x: number) => (x - xMin) / xRange * W;
    const toY = (y: number) => H - (y - yMin) / yRange * H;

    const xStep = niceStep(xRange, Math.max(4, Math.floor(W / 80)));
    const yStep = niceStep(yRange, Math.max(4, Math.floor(H / 60)));

    ctx.lineWidth = 1;
    ctx.strokeStyle = gridColor;
    ctx.beginPath();
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + xStep * 1e-6; x += xStep) {
      const px = toX(x);
      ctx.moveTo(Math.round(px) + .5, 0);
      ctx.lineTo(Math.round(px) + .5, H);
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + yStep * 1e-6; y += yStep) {
      const py = toY(y);
      ctx.moveTo(0, Math.round(py) + .5);
      ctx.lineTo(W, Math.round(py) + .5);
    }
    ctx.stroke();

    // Axes and tick labels.
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const zeroX = Math.max(0, Math.min(W, toX(0)));
    const zeroY = Math.max(0, Math.min(H, toY(0)));
    ctx.moveTo(zeroX, 0); ctx.lineTo(zeroX, H);
    ctx.moveTo(0, zeroY); ctx.lineTo(W, zeroY);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + xStep * 1e-6; x += xStep) {
      if (Math.abs(x) < xStep * 1e-6) continue;
      const px = toX(x);
      if (px < 18 || px > W - 18) continue;
      ctx.fillText(formatNumber(x, 4), px, Math.min(H - 16, Math.max(2, zeroY + 5)));
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + yStep * 1e-6; y += yStep) {
      if (Math.abs(y) < yStep * 1e-6) continue;
      const py = toY(y);
      if (py < 12 || py > H - 12) continue;
      ctx.fillText(formatNumber(y, 4), Math.min(W - 42, Math.max(4, zeroX + 6)), py);
    }

    // Curves, split at undefined values and at discontinuities.
    const colors = [brand, accent, brand];
    spec.curves.forEach((curve, index) => {
      const samples = sampleFunction((x) => valueAt(curve.expr, spec.variable, x), xMin, xMax, Math.max(400, Math.floor(W)));
      ctx.strokeStyle = colors[index % colors.length];
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let previous: { x: number; y: number } | null = null;
      for (const s of samples) {
        if (!Number.isFinite(s.y)) { previous = null; continue; }
        const px = toX(s.x), py = toY(s.y);
        if (previous && Math.abs(py - previous.y) > H * 0.9) { previous = null; }
        if (!previous) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        previous = { x: px, y: py };
      }
      ctx.stroke();
    });

    // Interesting points.
    for (const point of points) {
      const px = toX(point.x), py = toY(point.y);
      if (px < 0 || px > W || py < 0 || py > H) continue;
      ctx.beginPath();
      ctx.arc(px, py, point.kind === 'solution' ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = pointColor;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = surface;
      ctx.stroke();
      if (point.kind === 'solution') {
        ctx.fillStyle = brand;
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.label, px, Math.max(14, py - 14));
      }
    }
  }, [size, view, spec, points, themeKey]);

  useEffect(() => { draw(); }, [draw]);

  // Wheel zoom needs a non-passive listener to be able to preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / rect.width;
      const fy = 1 - (event.clientY - rect.top) / rect.height;
      zoomAt(event.deltaY > 0 ? 1.18 : 1 / 1.18, fx, fy);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  function zoomAt(factor: number, fx = .5, fy = .5) {
    setView((v) => {
      const xr = (v.xMax - v.xMin) * factor;
      const yr = (v.yMax - v.yMin) * factor;
      if (!Number.isFinite(xr) || !Number.isFinite(yr) || xr < 1e-9 || yr < 1e-9 || xr > 1e12) return v;
      const ax = v.xMin + fx * (v.xMax - v.xMin);
      const ay = v.yMin + fy * (v.yMax - v.yMin);
      return { xMin: ax - fx * xr, xMax: ax + (1 - fx) * xr, yMin: ay - fy * yr, yMax: ay + (1 - fy) * yr };
    });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    pointers.current.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        view,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2 / rect.width, y: 1 - (a.y + b.y) / 2 / rect.height },
      };
    } else {
      gesture.current = { view, distance: 0, center: { x: 0, y: 0 } };
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const previous = pointers.current.get(event.pointerId)!;
    const current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointers.current.set(event.pointerId, current);
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.distance > 0 && distance > 0) {
        const factor = g.distance / distance;
        setView((v) => {
          const xr = (g.view.xMax - g.view.xMin) * factor;
          const yr = (g.view.yMax - g.view.yMin) * factor;
          if (xr < 1e-9 || xr > 1e12) return v;
          return {
            xMin: g.view.xMin + g.center.x * ((g.view.xMax - g.view.xMin) - xr),
            xMax: g.view.xMax - (1 - g.center.x) * ((g.view.xMax - g.view.xMin) - xr),
            yMin: g.view.yMin + g.center.y * ((g.view.yMax - g.view.yMin) - yr),
            yMax: g.view.yMax - (1 - g.center.y) * ((g.view.yMax - g.view.yMin) - yr),
          };
        });
      }
      return;
    }
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    setView((v) => {
      const xr = v.xMax - v.xMin, yr = v.yMax - v.yMin;
      return { xMin: v.xMin - dx / rect.width * xr, xMax: v.xMax - dx / rect.width * xr,
        yMin: v.yMin + dy / rect.height * yr, yMax: v.yMax + dy / rect.height * yr };
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  const legend = spec.curves.map((curve, i) => (
    <span className="legend-item" key={i}>
      <span className={`legend-swatch ${i === 1 ? 'accent' : ''}`} />
      {spec.curves.length > 1 ? `y = ${formatExpr(curve.expr)}` : curve.label}
    </span>
  ));

  return (
    <div className={`card graph-card ${large ? 'large' : ''}`} data-testid="graph-card">
      <div className="graph-toolbar">
        <div className="graph-legend math">{legend}</div>
        <button type="button" className="icon-button" aria-label={t('common.zoomIn')} title={t('common.zoomIn')} onClick={() => zoomAt(1 / 1.35)}><Icon name="plus" size={17} /></button>
        <button type="button" className="icon-button" aria-label={t('common.zoomOut')} title={t('common.zoomOut')} onClick={() => zoomAt(1.35)}><Icon name="minus" size={17} /></button>
        <button type="button" className="icon-button" aria-label={t('graph.reset')} title={t('graph.reset')} onClick={() => setView(autoViewport(spec))}><Icon name="reset" size={17} /></button>
      </div>
      <div className="graph-canvas-wrap" ref={wrapRef}>
        <canvas
          className="graph" ref={canvasRef} data-testid="graph-canvas"
          role="img" aria-label={`${t('graph.title')}: ${spec.title}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp} onDoubleClick={() => setView(autoViewport(spec))}
        />
        <span className="graph-hint">{t('graph.panHint')}</span>
      </div>
      {showPoints && (
        <div className="graph-footer">
          <h4>{t('graph.points')}</h4>
          {points.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{t('graph.noPoints')}</p> : (
            <div className="points-list">
              {points.map((point, i) => (
                <button
                  type="button" key={`${point.kind}-${i}`} className="point-chip"
                  title={t(`graph.${point.kind}`)}
                  onClick={() => setView((v) => {
                    const half = (v.xMax - v.xMin) / 2;
                    return { ...v, xMin: point.x - half, xMax: point.x + half };
                  })}
                >
                  <span className={`point-dot ${point.kind === 'solution' ? 'accent' : ''}`} />
                  <span className="math">{point.label}</span>
                  <span className="sr-only">{t(`graph.${point.kind}`)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
