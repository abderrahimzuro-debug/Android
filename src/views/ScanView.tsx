import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Translator } from '../i18n';
import { ocrErrorCode, recognizeImage, type OcrResult, type OcrStatus } from '../lib/ocr';
import { Icon } from '../components/Icons';

type Stage = 'choose' | 'camera' | 'crop' | 'scanning' | 'correct' | 'error';
interface CropRect { x: number; y: number; w: number; h: number }
const DEFAULT_CROP: CropRect = { x: .06, y: .25, w: .88, h: .5 };
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface Props {
  t: Translator;
  online: boolean;
  ocrStatus: OcrStatus | null;
  onClose: () => void;
  onSolve: (expression: string) => void;
  onManual: (expression?: string) => void;
}

interface StatusInfo { key: string; detailKey: string; tone: 'error' | 'warn' | 'info'; icon: 'alert' | 'offline' | 'info' }

export function ScanView({ t, online, ocrStatus, onClose, onSolve, onManual }: Props) {
  const [stage, setStage] = useState<Stage>('choose');
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [recognition, setRecognition] = useState<OcrResult | null>(null);
  const [expression, setExpression] = useState('');
  const [errorCode, setErrorCode] = useState<string>('ocr.unknown');
  const [cameraBusy, setCameraBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cropWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{ mode: string; x: number; y: number; rect: CropRect } | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    stopCamera();
    abortRef.current?.abort();
  }, [stopCamera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const showStatus = (key: string, detailKey: string, tone: StatusInfo['tone'] = 'error', icon: StatusInfo['icon'] = 'alert') => {
    setStatus({ key, detailKey, tone, icon });
  };

  const startCamera = async () => {
    setStatus(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      showStatus('scan.noCamera', 'scan.noCameraDetail', 'warn');
      setStage('error');
      return;
    }
    setCameraBusy(true);
    setStage('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showStatus('scan.permissionDenied', 'scan.permissionDeniedDetail', 'error', 'offline');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        showStatus('scan.noCamera', 'scan.noCameraDetail', 'warn');
      } else {
        showStatus('scan.noCamera', 'scan.noCameraDetail', 'warn');
      }
      setStage('error');
    } finally {
      setCameraBusy(false);
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      showStatus('scan.noCamera', 'scan.noCameraDetail', 'warn');
      setStage('error');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImage(canvas.toDataURL('image/jpeg', .92));
    setCrop(DEFAULT_CROP);
    stopCamera();
    setStage('crop');
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorCode('scan.badFile');
      showStatus('scan.error', 'scan.badFile', 'error');
      setStage('error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorCode('scan.fileTooLarge');
      showStatus('scan.error', 'scan.fileTooLarge', 'error');
      setStage('error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImage(reader.result);
        setCrop(DEFAULT_CROP);
        setStatus(null);
        setStage('crop');
      }
    };
    reader.onerror = () => {
      setErrorCode('scan.badFile');
      showStatus('scan.error', 'scan.badFile', 'error');
      setStage('error');
    };
    reader.readAsDataURL(file);
  };

  const cropToDataUrl = (): string | null => {
    const img = imageRef.current;
    if (!img || !img.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    const sx = Math.max(0, Math.floor(crop.x * img.naturalWidth));
    const sy = Math.max(0, Math.floor(crop.y * img.naturalHeight));
    const sw = Math.min(img.naturalWidth - sx, Math.max(1, Math.floor(crop.w * img.naturalWidth)));
    const sh = Math.min(img.naturalHeight - sy, Math.max(1, Math.floor(crop.h * img.naturalHeight)));
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/jpeg', .92);
  };

  const runOcr = async () => {
    if (!online) {
      setErrorCode('scan.offline');
      showStatus('scan.offline', 'scan.offlineDetail', 'warn', 'offline');
      setStage('error');
      return;
    }
    if (ocrStatus && !ocrStatus.configured) {
      setErrorCode('ocr.notConfigured');
      showStatus('scan.ocrUnavailable', 'scan.ocrUnavailableDetail', 'warn', 'info');
      setStage('error');
      return;
    }
    const cropped = cropToDataUrl();
    if (!cropped) {
      setErrorCode('scan.badFile');
      showStatus('scan.error', 'scan.badFile');
      setStage('error');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStage('scanning');
    setStatus(null);
    try {
      const result = await recognizeImage(cropped, controller.signal);
      setRecognition(result);
      setExpression(result.expression);
      setStage('correct');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const code = ocrErrorCode(error);
      setErrorCode(code);
      if (code === 'ocr.notConfigured') {
        showStatus('scan.ocrUnavailable', 'scan.ocrUnavailableDetail', 'warn', 'info');
      } else if (code === 'ocr.network') {
        showStatus('scan.offline', 'scan.offlineDetail', 'warn', 'offline');
      } else {
        showStatus('scan.error', `ocr.${code.replace(/^ocr\./, '')}`, 'error');
      }
      setStage('error');
    }
  };

  const onDragStart = (event: ReactPointerEvent, mode: string) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { mode, x: event.clientX, y: event.clientY, rect: { ...crop } };
  };
  const onDragMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    const wrap = cropWrapRef.current;
    if (!drag || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / rect.width;
    const dy = (event.clientY - drag.y) / rect.height;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const r = drag.rect;
    if (drag.mode === 'move') {
      setCrop({ ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) });
      return;
    }
    const next: CropRect = { ...r };
    if (drag.mode.includes('w')) {
      const x = clamp(r.x + dx, 0, r.x + r.w - .08);
      next.x = x; next.w = r.x + r.w - x;
    } else {
      next.w = clamp(r.w + dx, .08, 1 - r.x);
    }
    if (drag.mode.includes('n')) {
      const y = clamp(r.y + dy, 0, r.y + r.h - .08);
      next.y = y; next.h = r.y + r.h - y;
    } else {
      next.h = clamp(r.h + dy, .08, 1 - r.y);
    }
    setCrop(next);
  };
  const onDragEnd = () => { dragRef.current = null; };

  const reset = () => {
    abortRef.current?.abort();
    stopCamera();
    setImage(null);
    setRecognition(null);
    setExpression('');
    setStatus(null);
    setCrop(DEFAULT_CROP);
    setStage('choose');
  };

  const manual = (value?: string) => { stopCamera(); onManual(value); };
  const submit = (value: string) => { stopCamera(); onSolve(value); };

  const statusPanel = status && (
    <div className={`scan-status ${status.tone}`} role="alert" data-testid="scan-status">
      <Icon name={status.icon} size={20} />
      <div>
        <h3>{t(status.key)}</h3>
        <p>{t(status.detailKey)}</p>
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="scan-title" data-testid="scan-modal" data-error-code={errorCode}>
        <div className="modal-header">
          <div>
            <h2 id="scan-title">{t('scan.title')}</h2>
            <p>{t('scan.subtitle')}</p>
          </div>
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}><Icon name="close" /></button>
        </div>

        <input
          ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp"
          className="sr-only" data-testid="file-input" onChange={onFileChange}
          aria-label={t('scan.upload')}
        />

        <div className="banner info" style={{ marginBottom: 14 }}>
          <Icon name="lock" size={16} />
          <span>{t('scan.privacy')}</span>
        </div>

        {!online && stage !== 'correct' && (
          <div className="scan-status warn" role="status">
            <Icon name="offline" size={20} />
            <div><h3>{t('scan.offline')}</h3><p>{t('scan.offlineDetail')}</p></div>
          </div>
        )}

        {stage === 'choose' && (
          <>
            {ocrStatus && !ocrStatus.configured && (
              <div className="scan-status warn" role="status" data-testid="scan-ocr-warning">
                <Icon name="info" size={20} />
                <div><h3>{t('scan.ocrUnavailable')}</h3><p>{t('scan.ocrUnavailableDetail')}</p></div>
              </div>
            )}
            <div className="scan-options">
              <button type="button" className="scan-option" onClick={startCamera} data-testid="use-camera">
                <Icon name="camera" size={28} />{t('scan.camera')}
              </button>
              <button type="button" className="scan-option" onClick={() => fileInputRef.current?.click()} data-testid="upload-image">
                <Icon name="upload" size={28} />{t('scan.upload')}
              </button>
            </div>
            <div className="scan-actions">
              <button type="button" className="button block" onClick={() => manual()}>{t('scan.manual')}</button>
            </div>
          </>
        )}

        {stage === 'camera' && (
          <div className="scan-stage">
            <video ref={videoRef} className="scan-video" playsInline muted autoPlay data-testid="camera-video" />
            {cameraBusy && <div className="scan-progress"><span className="spinner" />{t('scan.start')}</div>}
            <div className="stage-actions">
              <button type="button" className="button primary" onClick={captureFrame} data-testid="capture-photo">
                <Icon name="camera" size={17} />{t('scan.capture')}
              </button>
              <button type="button" className="button" onClick={reset}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <>
            {statusPanel || (
              <div className="scan-status" role="alert">
                <Icon name="alert" size={20} />
                <div><h3>{t('scan.error')}</h3><p>{t('scan.errorDetail')}</p></div>
              </div>
            )}
            <div className="scan-actions">
              <button type="button" className="button primary" onClick={reset}>{t('scan.tryAgain')}</button>
              <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>{t('scan.upload')}</button>
              <button type="button" className="button" onClick={() => manual()}>{t('scan.manual')}</button>
            </div>
          </>
        )}

        {stage === 'crop' && image && (
          <>
            {statusPanel}
            <div className="scan-stage">
              <div
                className="crop-wrap" ref={cropWrapRef}
                onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
              >
                <img ref={imageRef} className="scan-image" src={image} alt={t('scan.crop')} data-testid="crop-image" />
                <div
                  className="crop-box" data-testid="crop-box"
                  style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
                  onPointerDown={(e) => onDragStart(e, 'move')}
                >
                  {['nw', 'ne', 'sw', 'se'].map((handle) => (
                    <span key={handle} className={`crop-handle ${handle}`} onPointerDown={(e) => onDragStart(e, handle)} />
                  ))}
                </div>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t('scan.cropHint')}</p>
            <div className="scan-actions">
              <button type="button" className="button primary" onClick={runOcr} data-testid="scan-selection">
                <Icon name="sparkles" size={16} />{t('scan.cropApply')}
              </button>
              <button type="button" className="button" onClick={() => setCrop(DEFAULT_CROP)}>{t('scan.cropReset')}</button>
              <button type="button" className="button ghost" onClick={reset}>{t('scan.retake')}</button>
              <button type="button" className="button ghost" onClick={() => manual()}>{t('scan.manual')}</button>
            </div>
          </>
        )}

        {stage === 'scanning' && (
          <div className="scan-progress" role="status" data-testid="scan-loading">
            <span className="spinner" />
            <div>
              <strong>{t('scan.scanning')}</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>{t('scan.scanningHint')}</div>
            </div>
          </div>
        )}

        {stage === 'correct' && recognition && (
          <div className="scan-edit" data-testid="scan-correction">
            <div className="result-head">
              <span className="eyebrow">{t('scan.recognised')}</span>
              {recognition.confidence !== null && (
                <span className={`badge ${recognition.confidence < .7 ? 'warn' : 'success'}`}>
                  {t('scan.confidence', { percent: String(Math.round(recognition.confidence * 100)) })}
                </span>
              )}
            </div>
            <label className="input-label" htmlFor="scan-expression">{t('scan.editLabel')}</label>
            <textarea
              id="scan-expression" className="math" value={expression}
              onChange={(e) => setExpression(e.target.value)}
              aria-label={t('scan.editLabel')} data-testid="scan-expression"
            />
            <p className="scan-latex">LaTeX: {recognition.latex}</p>
            {(recognition.confidence === null || recognition.confidence < .7 || recognition.warnings.length > 0) && (
              <div className="scan-status warn" style={{ marginTop: 10 }}>
                <Icon name="alert" size={18} />
                <div>
                  <h3>{t('scan.correct')}</h3>
                  <p>{t(recognition.confidence !== null && recognition.confidence < .7 ? 'scan.lowConfidence' : 'scan.checkExpression')}</p>
                  {recognition.warnings.map((w) => <p key={w}>{t(w)}</p>)}
                </div>
              </div>
            )}
            <div className="scan-actions">
              <button
                type="button" className="button primary" disabled={!expression.trim()}
                onClick={() => submit(expression.trim())} data-testid="scan-solve"
              >
                <Icon name="play" size={15} />{t('scan.solve')}
              </button>
              <button type="button" className="button" onClick={() => manual(expression.trim())}>{t('scan.manual')}</button>
              <button type="button" className="button ghost" onClick={reset}>{t('scan.tryAgain')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
