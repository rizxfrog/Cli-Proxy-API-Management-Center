import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAuthStore, useConfigStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import {
  autoCheckinApi,
  type CheckinCapability,
  type CheckinProviderConfig,
  type CheckinSnapshot,
} from '@/services/api/autoCheckin';
import { getErrorMessage, isRecord } from '@/utils/helpers';
import {
  draftChanged,
  effectiveConfig,
  serializeDraft,
  toDraft,
  validateDraft,
} from './checkinForm';
import styles from './AutoCheckinPage.module.scss';

interface Session {
  apiBase: string;
  managementKey: string;
  revision: number;
  signal: AbortSignal;
  providers: CheckinCapability[];
  config: Record<string, CheckinProviderConfig>;
}

type SaveState = 'idle' | 'saving' | 'waiting' | 'effective' | 'delayed' | 'failed' | 'invalid';

const ACCOUNT_STATES: Record<string, true> = {
  success: true,
  already_done: true,
  unavailable: true,
  failed: true,
  blocked: true,
  waiting: true,
  scheduled: true,
  queued: true,
  running: true,
  disabled: true,
  cancelled: true,
  idle: true,
};

function sessionActive(session: Session): boolean {
  const auth = useAuthStore.getState();
  return (
    !session.signal.aborted &&
    auth.connectionStatus === 'connected' &&
    auth.apiBase === session.apiBase &&
    auth.managementKey === session.managementKey &&
    apiClient.getConnectionRevision() === session.revision
  );
}

function ProviderPanel({
  capability,
  initialConfig,
  snapshot,
  connected,
  session,
}: {
  capability: CheckinCapability;
  initialConfig: CheckinProviderConfig;
  snapshot: CheckinSnapshot | null;
  connected: boolean;
  session: Session;
}) {
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState(initialConfig);
  const [draft, setDraft] = useState(() => toDraft(initialConfig));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [expectedFingerprint, setExpectedFingerprint] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const runtime = snapshot?.providers.find((provider) => provider.id === capability.id);
  const dirty = draftChanged(draft, saved);
  const disabled = !connected || saveState === 'saving';
  const accounts =
    snapshot?.accounts.filter(
      (account) =>
        account.provider === capability.id && (!runtime?.date || account.date === runtime.date)
    ) ?? [];
  const displayTimezone = runtime?.timezone || saved.timezone;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: displayTimezone,
      }),
    [i18n.language, displayTimezone]
  );

  useEffect(() => {
    if (
      (saveState === 'waiting' || saveState === 'delayed') &&
      expectedFingerprint &&
      runtime?.configFingerprint === expectedFingerprint
    ) {
      setSaveState('effective');
    }
  }, [expectedFingerprint, runtime?.configFingerprint, saveState]);

  useEffect(() => {
    if (saveState !== 'waiting') return;
    const timer = window.setTimeout(() => setSaveState('delayed'), 30000);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const save = async () => {
    if (disabled || !dirty || !sessionActive(session)) return;
    const validation = validateDraft(draft, capability);
    if (validation) {
      setError(t(`auto_checkin.validation.${validation}`));
      // Nothing was sent, so this is not a save failure: reporting one would
      // blame the backend for a value the form rejected locally.
      setSaveState('invalid');
      return;
    }
    const value = serializeDraft(draft);
    setSaveState('saving');
    setError('');
    setExpectedFingerprint('');
    try {
      const fingerprint = await autoCheckinApi.saveProvider(capability.id, value, session.signal);
      if (!mounted.current || !sessionActive(session)) return;
      useConfigStore.getState().clearCache();
      setSaved(value);
      setDraft(toDraft(value));
      setExpectedFingerprint(fingerprint || '');
      setSaveState(fingerprint ? 'waiting' : 'delayed');
    } catch (err: unknown) {
      if (!mounted.current || !sessionActive(session)) return;
      setError(getErrorMessage(err, t('auto_checkin.save_failed')));
      setSaveState('failed');
    }
  };

  const formatTime = (value: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return dateFormatter.format(date);
  };

  return (
    <Card
      title={<h2 className={styles.providerTitle}>{capability.name}</h2>}
      extra={
        <ToggleSwitch
          checked={draft.enabled}
          disabled={disabled}
          label={t('auto_checkin.enabled')}
          ariaLabel={t('auto_checkin.enable_provider', { provider: capability.name })}
          onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
        />
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className={styles.fields}>
          <Input
            label={t('auto_checkin.timezone')}
            value={draft.timezone}
            disabled={disabled}
            placeholder="Asia/Shanghai"
            autoComplete="off"
            onChange={(event) =>
              setDraft((current) => ({ ...current, timezone: event.target.value }))
            }
          />
          <Input
            label={t('auto_checkin.start')}
            value={draft.start}
            disabled={disabled}
            placeholder="00:10"
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))}
          />
          <Input
            label={t('auto_checkin.end')}
            value={draft.end}
            disabled={disabled}
            placeholder="03:10"
            inputMode="numeric"
            maxLength={5}
            onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))}
          />
        </div>
        <p className={styles.hint}>{t('auto_checkin.window_hint')}</p>
        <fieldset className={styles.headers} disabled={disabled}>
          <legend>{t('auto_checkin.headers')}</legend>
          <p className={styles.hint}>{t('auto_checkin.template_hint')}</p>
          <p className={styles.hint}>
            {t('auto_checkin.protected_hint', {
              headers: capability.protectedHeaders.join(', '),
            })}
          </p>
          {draft.headers.map((header, index) => (
            <div className={styles.headerRow} key={index}>
              <Input
                aria-label={t('auto_checkin.header_name', { number: index + 1 })}
                placeholder={t('auto_checkin.header_key')}
                value={header.key}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    headers: current.headers.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, key: event.target.value } : row
                    ),
                  }))
                }
              />
              <Input
                aria-label={t('auto_checkin.header_value', { number: index + 1 })}
                placeholder="${meta.uid}"
                value={header.value}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    headers: current.headers.map((row, rowIndex) =>
                      rowIndex === index ? { ...row, value: event.target.value } : row
                    ),
                  }))
                }
              />
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                aria-label={t('auto_checkin.remove_header', { number: index + 1 })}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    headers: current.headers.filter((_, rowIndex) => rowIndex !== index),
                  }))
                }
              >
                {t('common.delete')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                headers: [...current.headers, { key: '', value: '' }],
              }))
            }
          >
            {t('auto_checkin.add_header')}
          </Button>
        </fieldset>
        <div className={styles.actions}>
          <Button type="submit" loading={saveState === 'saving'} disabled={disabled || !dirty}>
            {t('common.save')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !dirty}
            onClick={() => {
              setDraft(toDraft(saved));
              setError('');
              if (saveState === 'failed') setSaveState('idle');
            }}
          >
            {t('auto_checkin.reset')}
          </Button>
          <span className={styles.hint} role="status" aria-live="polite">
            {dirty && `${t('auto_checkin.unsaved')} `}
            {saveState !== 'idle' && t(`auto_checkin.save_state.${saveState}`)}
          </span>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </form>
      <section className={styles.accountSection} aria-label={t('auto_checkin.accounts')}>
        <div className={styles.accountHeading}>
          <h3>{t('auto_checkin.accounts')}</h3>
          {runtime && (
            <span className={styles.hint}>
              {runtime.date} · {runtime.timezone} ·{' '}
              {t(
                runtime.enabled ? 'auto_checkin.runtime_enabled' : 'auto_checkin.runtime_disabled'
              )}
            </span>
          )}
        </div>
        {!snapshot ? (
          <p className={styles.hint}>{t('auto_checkin.status_pending')}</p>
        ) : accounts.length === 0 ? (
          <p className={styles.hint}>{t('auto_checkin.no_accounts')}</p>
        ) : (
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label={t('auto_checkin.accounts')}
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('auto_checkin.account')}</th>
                  <th scope="col">{t('auto_checkin.date')}</th>
                  <th scope="col">{t('common.status')}</th>
                  <th scope="col">{t('auto_checkin.scheduled')}</th>
                  <th scope="col">{t('auto_checkin.latest')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const state = account.outcome || account.phase;
                  return (
                    <tr key={`${account.authId}:${account.date}`}>
                      <th scope="row">{account.account || account.authId}</th>
                      <td>{account.date}</td>
                      <td>
                        <span className={styles.status} data-state={state}>
                          {ACCOUNT_STATES[state] ? t(`auto_checkin.phase.${state}`) : state || '—'}
                        </span>
                      </td>
                      <td>{formatTime(account.scheduledAt)}</td>
                      <td className={styles.result}>
                        {account.error && <div className={styles.failure}>{account.error}</div>}
                        {account.warning && (
                          <div>
                            {t('auto_checkin.warning')}: {account.warning}
                          </div>
                        )}
                        <div>{formatTime(account.finishedAt || account.startedAt)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Card>
  );
}

export function AutoCheckinPage() {
  const { t } = useTranslation();
  const pageLayer = usePageTransitionLayer();
  const isCurrentLayer = pageLayer?.isCurrentLayer ?? true;
  const currentLayerRef = useRef(isCurrentLayer);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const connected = connectionStatus === 'connected';
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<CheckinSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const revision = apiClient.getConnectionRevision();
    let statusController: AbortController | null = null;
    let pollTimer: number | undefined;
    let sequence = 0;
    let inFlight = false;
    let ready = false;
    const current = () => {
      const auth = useAuthStore.getState();
      return (
        !controller.signal.aborted &&
        auth.connectionStatus === 'connected' &&
        auth.apiBase === apiBase &&
        auth.managementKey === managementKey &&
        revision === apiClient.getConnectionRevision()
      );
    };
    setSession(null);
    setSnapshot(null);
    setLoadError(null);
    setStatusError(null);
    setUnsupported(false);
    setLoading(connected);

    const poll = async () => {
      if (!ready || !current() || document.hidden || !currentLayerRef.current || inFlight) return;
      const request = ++sequence;
      inFlight = true;
      statusController = new AbortController();
      try {
        const next = await autoCheckinApi.status(statusController.signal);
        if (!current() || document.hidden || !currentLayerRef.current || request !== sequence)
          return;
        setSnapshot(next);
        setStatusError(null);
      } catch (err: unknown) {
        if (!current() || document.hidden || !currentLayerRef.current || request !== sequence)
          return;
        setStatusError(getErrorMessage(err, ''));
      } finally {
        if (request === sequence) inFlight = false;
      }
    };
    const visibility = () => {
      if (document.hidden || !currentLayerRef.current) {
        sequence += 1;
        inFlight = false;
        statusController?.abort();
      } else {
        void poll();
      }
    };
    if (connected) {
      void (async () => {
        try {
          const providers = await autoCheckinApi.capabilities(controller.signal);
          if (!current()) return;
          let config: Record<string, Partial<CheckinProviderConfig>> = {};
          try {
            config = await autoCheckinApi.config(controller.signal);
          } catch (err: unknown) {
            if (!isRecord(err) || err.status !== 404) throw err;
          }
          if (!current()) return;
          setSession({
            apiBase,
            managementKey,
            revision,
            signal: controller.signal,
            providers,
            config: Object.fromEntries(
              providers.map((provider) => [
                provider.id,
                effectiveConfig(config[provider.id], provider.defaults),
              ])
            ),
          });
          ready = true;
          await poll();
          if (current()) {
            pollTimer = window.setInterval(() => {
              void poll();
            }, 5000);
          }
        } catch (err: unknown) {
          if (!current()) return;
          setUnsupported(
            isRecord(err) && (err.status === 404 || err.status === 405 || err.status === 501)
          );
          setLoadError(getErrorMessage(err, ''));
        } finally {
          if (current()) setLoading(false);
        }
      })();
    }
    visibilityHandlerRef.current = visibility;
    document.addEventListener('visibilitychange', visibility);
    return () => {
      controller.abort();
      statusController?.abort();
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', visibility);
      visibilityHandlerRef.current = null;
    };
  }, [connected, apiBase, managementKey, reload]);

  useEffect(() => {
    currentLayerRef.current = isCurrentLayer;
    visibilityHandlerRef.current?.();
  }, [isCurrentLayer]);

  const activeSession =
    session &&
    session.apiBase === apiBase &&
    session.managementKey === managementKey &&
    !session.signal.aborted &&
    session.revision === apiClient.getConnectionRevision()
      ? session
      : null;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>{t('auto_checkin.title')}</h1>
        <p>{t('auto_checkin.description')}</p>
        <p>{t('auto_checkin.memory_hint')}</p>
      </header>
      {!connected && (
        <div className={styles.notice} role="status">
          {t('notification.connection_required')}
        </div>
      )}
      {loading && <p role="status">{t('common.loading')}</p>}
      {(loadError !== null || unsupported) && (
        <div className="error-box" role="alert">
          <p>{t(unsupported ? 'auto_checkin.unsupported' : 'auto_checkin.load_failed')}</p>
          {!unsupported && <p>{loadError}</p>}
          <Button
            variant="secondary"
            disabled={!connected}
            onClick={() => setReload((value) => value + 1)}
          >
            {t('common.refresh')}
          </Button>
        </div>
      )}
      {activeSession && (
        <>
          {statusError !== null && (
            <div className="error-box" role="alert">
              {t('auto_checkin.status_failed')} {statusError}
            </div>
          )}
          {snapshot?.disabledReason && (
            <div className={styles.notice} role="status">
              {t('auto_checkin.scheduler_disabled')} {snapshot.disabledReason}
            </div>
          )}
          {activeSession.providers.length === 0 && <p>{t('auto_checkin.no_providers')}</p>}
          {activeSession.providers.map((capability) => (
            <ProviderPanel
              key={`${activeSession.revision}:${reload}:${capability.id}`}
              capability={capability}
              initialConfig={activeSession.config[capability.id]}
              snapshot={snapshot}
              connected={connected && isCurrentLayer}
              session={activeSession}
            />
          ))}
        </>
      )}
    </div>
  );
}
