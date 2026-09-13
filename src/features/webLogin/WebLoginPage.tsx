import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores';
import { webLoginApi, type WebLoginMethod } from '@/services/api/webLogin';
import { buildWebLoginRequest, webLoginProviders, type WebLoginFields } from './providers';
import styles from './WebLoginPage.module.scss';

const emptyFields: WebLoginFields = { cookie: '', email: '', password: '', token: '' };

function WebLoginCard({ provider }: { provider: (typeof webLoginProviders)[number] }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<WebLoginMethod>('cookie');
  const [fields, setFields] = useState<WebLoginFields>(emptyFields);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (
        state.apiBase !== previous.apiBase ||
        state.managementKey !== previous.managementKey ||
        state.isAuthenticated !== previous.isAuthenticated
      ) {
        pending.current?.abort();
        pending.current = null;
        setFields(emptyFields);
        setStatus('idle');
        setError('');
        setBusy(false);
      }
    });
    return () => {
      unsubscribe();
      pending.current?.abort();
    };
  }, []);

  const update = (field: keyof WebLoginFields, value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = buildWebLoginRequest(method, fields);
    if (!payload || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const connection = useAuthStore.getState();
    setBusy(true);
    setStatus('idle');
    setError('');
    // Clear inputs immediately. Credentials exist only for the in-flight request.
    setFields(emptyFields);
    const isCurrent = () => {
      const current = useAuthStore.getState();
      return (
        !controller.signal.aborted &&
        current.apiBase === connection.apiBase &&
        current.managementKey === connection.managementKey &&
        current.isAuthenticated
      );
    };
    try {
      await webLoginApi.login(provider.id, payload, controller.signal);
      if (isCurrent()) setStatus('success');
    } catch {
      // Do not render arbitrary error payloads: they may contain credential echoes
      // from an old or third-party backend/proxy. The help text gives recovery steps.
      if (isCurrent()) {
        setStatus('error');
        setError(t('web_login.failed'));
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        if (isCurrent()) setBusy(false);
      }
    }
  };

  return (
    <Card title={provider.name}>
      <div className={styles.providerLayout}>
        <aside className={styles.instructions}>
          <p>{t('web_login.capabilities')}</p>
          <dl className={styles.models}>
            <dt>{t('web_login.chat_model')}</dt>
            <dd>
              <code>{provider.chatModel}</code>
            </dd>
            <dt>{t('web_login.image_model')}</dt>
            <dd>
              <code>{provider.imageModel}</code>
            </dd>
          </dl>
          <p>{t('web_login.image_hint')}</p>
          <a href={provider.loginUrl} target="_blank" rel="noopener noreferrer">
            {t('web_login.open_site')}
          </a>
          <p className={styles.hint}>{t('web_login.popup_hint')}</p>
        </aside>
        <form onSubmit={submit} className={styles.form} autoComplete="off">
          <fieldset disabled={busy} className={styles.methods}>
            <legend>{t('web_login.method')}</legend>
            {provider.methods.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name={`${provider.id}-method`}
                  value={value}
                  checked={method === value}
                  onChange={() => {
                    setMethod(value);
                    setFields(emptyFields);
                    setStatus('idle');
                    setError('');
                  }}
                />
                {t(`web_login.methods.${value}`)}
              </label>
            ))}
          </fieldset>
          {method === 'cookie' && (
            <Input
              label={t('web_login.cookie')}
              hint={t('web_login.cookie_hint')}
              type="password"
              value={fields.cookie}
              onChange={(event) => update('cookie', event.target.value)}
              maxLength={65536}
              required
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
            />
          )}
          {method === 'password' && (
            <>
              <Input
                label={t('web_login.email')}
                type="email"
                value={fields.email}
                onChange={(event) => update('email', event.target.value)}
                maxLength={320}
                required
                disabled={busy}
                autoComplete="off"
              />
              <Input
                label={t('web_login.password')}
                hint={t('web_login.password_hint')}
                type="password"
                value={fields.password}
                onChange={(event) => update('password', event.target.value)}
                maxLength={1024}
                required
                disabled={busy}
                autoComplete="off"
              />
            </>
          )}
          {method === 'token' && (
            <Input
              label={t('web_login.token')}
              hint={t('web_login.token_hint')}
              type="password"
              value={fields.token}
              onChange={(event) => update('token', event.target.value)}
              maxLength={32768}
              required
              disabled={busy}
              spellCheck={false}
              autoComplete="off"
            />
          )}
          <p className={styles.hint}>{t('web_login.security')}</p>
          <div className={styles.actions}>
            <Button type="submit" loading={busy} disabled={!buildWebLoginRequest(method, fields)}>
              {busy ? t('web_login.saving') : t('web_login.save')}
            </Button>
            {busy && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  pending.current?.abort();
                  pending.current = null;
                  setBusy(false);
                }}
              >
                {t('web_login.cancel')}
              </Button>
            )}
          </div>
          <div aria-live="polite" role="status">
            {status === 'success' && (
              <p>
                {t('web_login.success')} <Link to="/auth-files">{t('web_login.manage')}</Link>
              </p>
            )}
          </div>
          {status === 'error' && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
        </form>
      </div>
    </Card>
  );
}

export function WebLoginPage() {
  const { t } = useTranslation();
  return (
    <section className={styles.page}>
      <header>
        <h1>{t('web_login.title')}</h1>
        <p className={styles.description}>{t('web_login.description')}</p>
      </header>
      {webLoginProviders.map((provider) => (
        <WebLoginCard key={provider.id} provider={provider} />
      ))}
    </section>
  );
}
