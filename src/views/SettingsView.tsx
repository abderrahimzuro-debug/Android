import { useState } from 'react';
import type { Translator } from '../i18n';
import type { OcrStatus } from '../lib/ocr';
import type { Settings, Theme } from '../lib/storage';
import { Icon } from '../components/Icons';

interface Props {
  t: Translator;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  online: boolean;
  ocrStatus: OcrStatus | null;
  ocrStatusError: boolean;
  installAvailable: boolean;
  installed: boolean;
  onInstall: () => void;
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  onCheckUpdate: () => void;
  onExport: () => void;
  onClearData: () => void;
  onCheckOcr: () => void;
}

const THEMES: Theme[] = ['system', 'light', 'dark'];

export function SettingsView(props: Props) {
  const { t, settings, onChange } = props;
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div>
      <div className="view-header">
        <span className="eyebrow">{t('app.name')}</span>
        <h1>{t('settings.title')}</h1>
        <p>{t('settings.subtitle')}</p>
      </div>

      {!props.online && (
        <div className="banner offline">
          <Icon name="offline" size={18} />
          <span><strong>{t('header.offline')}.</strong> {t('header.offlineDetail')}</span>
        </div>
      )}

      <div className="setting-grid">
        <section className="card">
          <div className="card-header">
            <div><h2 className="card-title">{t('settings.appearance')}</h2><p className="card-subtitle">{t('settings.language')}</p></div>
            <Icon name="sun" size={19} style={{ color: 'var(--brand)' }} />
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.theme')}</h3><p>{t('settings.appearance')}</p></div>
            <div className="setting-control segmented" role="group" aria-label={t('settings.theme')}>
              {THEMES.map((theme) => (
                <button
                  key={theme} type="button" className={`segment ${settings.theme === theme ? 'active' : ''}`}
                  aria-pressed={settings.theme === theme} onClick={() => onChange({ theme })}
                >
                  {theme === 'system' ? <Icon name="settings" size={14} /> : <Icon name={theme === 'light' ? 'sun' : 'moon'} size={14} />}
                  <span className="sr-only">{t(`settings.theme.${theme}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.language')}</h3><p>{settings.language === 'ar' ? 'العربية' : 'English'}</p></div>
            <div className="setting-control segmented" role="group" aria-label={t('settings.language')}>
              {(['en', 'ar'] as const).map((lang) => (
                <button
                  key={lang} type="button" className={`segment ${settings.language === lang ? 'active' : ''}`}
                  aria-pressed={settings.language === lang} onClick={() => onChange({ language: lang })}
                  data-testid={`lang-${lang}`}
                >
                  {t(`settings.language.${lang}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.showSteps')}</h3><p>{t('settings.showStepsHint')}</p></div>
            <button
              type="button" role="switch" aria-checked={settings.showSteps} aria-label={t('settings.showSteps')}
              className="switch setting-control" onClick={() => onChange({ showSteps: !settings.showSteps })}
            />
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.showGraph')}</h3><p>{t('settings.showGraphHint')}</p></div>
            <button
              type="button" role="switch" aria-checked={settings.showGraph} aria-label={t('settings.showGraph')}
              className="switch setting-control" onClick={() => onChange({ showGraph: !settings.showGraph })}
            />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div><h2 className="card-title">{t('settings.connection')}</h2><p className="card-subtitle">{t('settings.offlineTitle')}</p></div>
            <Icon name="online" size={19} style={{ color: 'var(--brand)' }} />
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.onlineStatus')}</h3><p>{t(props.online ? 'settings.online' : 'settings.offline')}</p></div>
            <span className={`badge ${props.online ? 'success' : 'warn'}`}>
              <Icon name={props.online ? 'online' : 'offline'} size={13} />{t(props.online ? 'settings.online' : 'settings.offline')}
            </span>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <h3>{t('settings.ocr')}</h3>
              <p>{t('settings.ocrDetail')}</p>
            </div>
            <button type="button" className="button small ghost" onClick={props.onCheckOcr} aria-label={t('settings.checkUpdate')}>
              <Icon name="refresh" size={14} />
            </button>
          </div>
          <div className="setting-row" style={{ paddingTop: 0 }}>
            <span className={`badge ${props.ocrStatus?.configured ? 'success' : 'warn'}`} data-testid="ocr-status">
              <Icon name={props.ocrStatus?.configured ? 'checkCircle' : 'alert'} size={13} />
              {props.ocrStatusError ? t('settings.ocrUnreachable')
                : props.ocrStatus === null ? t('settings.ocrChecking')
                : props.ocrStatus.configured ? t('settings.ocrConfigured', { provider: props.ocrStatus.provider ?? 'OCR' })
                : t('settings.ocrNotConfigured')}
            </span>
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.install')}</h3><p>{t('settings.installHint')}</p></div>
            <div className="setting-control">
              {props.installed ? (
                <span className="badge success"><Icon name="check" size={13} />{t('settings.installed')}</span>
              ) : (
                <button type="button" className="button small soft" onClick={props.onInstall} disabled={!props.installAvailable}>
                  <Icon name="install" size={15} />{t('settings.install')}
                </button>
              )}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.checkUpdate')}</h3><p>{t('settings.version')} 1.0.0</p></div>
            <button type="button" className="button small" onClick={props.updateAvailable ? props.onApplyUpdate : props.onCheckUpdate}>
              <Icon name="refresh" size={15} />{t(props.updateAvailable ? 'settings.reload' : 'settings.checkUpdate')}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div><h2 className="card-title">{t('settings.data')}</h2><p className="card-subtitle">{t('history.localOnly')}</p></div>
            <Icon name="lock" size={19} style={{ color: 'var(--brand)' }} />
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>{t('settings.dataHint')}</p>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.exportData')}</h3><p>{t('history.localOnly')}</p></div>
            <button type="button" className="button small" onClick={props.onExport}><Icon name="download" size={15} />{t('settings.exportData')}</button>
          </div>
          <div className="setting-row">
            <div className="setting-info"><h3>{t('settings.clearData')}</h3><p>{t('settings.clearConfirm')}</p></div>
            {confirmClear ? (
              <div className="setting-control" style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="button small danger" onClick={() => { props.onClearData(); setConfirmClear(false); }}>{t('common.yes')}</button>
                <button type="button" className="button small ghost" onClick={() => setConfirmClear(false)}>{t('common.cancel')}</button>
              </div>
            ) : (
              <button type="button" className="button small danger" onClick={() => setConfirmClear(true)}><Icon name="trash" size={15} />{t('settings.clearData')}</button>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div><h2 className="card-title">{t('settings.about')}</h2><p className="card-subtitle">{t('settings.version')} 1.0.0</p></div>
            <Icon name="info" size={19} style={{ color: 'var(--brand)' }} />
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{t('settings.aboutText')}</p>
          <div className="divider" />
          <h3 style={{ fontSize: 13.5, margin: '0 0 6px' }}>{t('settings.privacy')}</h3>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>{t('settings.privacyText')}</p>
          <h3 style={{ fontSize: 13.5, margin: '0 0 6px' }}>{t('settings.limits')}</h3>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{t('settings.limitsText')}</p>
        </section>
      </div>
    </div>
  );
}
