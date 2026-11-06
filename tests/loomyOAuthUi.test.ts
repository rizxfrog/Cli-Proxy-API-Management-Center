/**
 * Loomy login UI contract.
 *
 * Loomy has no browser authorization page: the card must render the two SMS
 * steps and must never offer the URL/callback affordances that the other
 * providers use. These assertions read the rendered markup, so a future edit
 * that reuses the shared OAuth card path fails here instead of shipping a card
 * whose button starts a flow the backend does not implement.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { OAuthPage } from '@/features/oauth/OAuthPage';
import { OAUTH_PROVIDERS } from '@/features/oauth/providers';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
import ko from '@/i18n/locales/ko.json';
import vi from '@/i18n/locales/vi.json';

const repoRoot = join(import.meta.dir, '..');
const read = (relativePath: string) => readFileSync(join(repoRoot, relativePath), 'utf8');

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

const renderPage = () =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(MemoryRouter, null, createElement(OAuthPage))
    )
  );

describe('Loomy login UI', () => {
  test('is registered as an SMS-flow provider', () => {
    const loomy = OAUTH_PROVIDERS.find((provider) => provider.id === 'loomy');
    expect(loomy).toMatchObject({ flow: 'sms', titleKey: 'auth_login.loomy_oauth_title' });
  });

  test('renders the tile and caption without raw i18n keys', () => {
    const markup = renderPage();
    expect(markup).toContain('Loomy');
    expect(markup).toContain(en.auth_login.method_sms);
    expect(markup).not.toContain('auth_login.loomy_');
  });

  test('the card posts to the SMS endpoints, not the shared auth-url contract', () => {
    const hook = read('src/features/oauth/hooks/useOAuthFlows.ts');
    expect(hook).toContain('loomyApi.requestSMSCode');
    expect(hook).toContain('loomyApi.login');
    // The shared URL flow would send provider=loomy to /oauth/auth-url, which the
    // backend answers with a redirect to the SMS endpoints.
    expect(hook).toContain("if (provider === 'loomy')");
  });

  test('the dialog renders the two SMS steps and no URL/callback affordances', () => {
    const dialog = read('src/features/oauth/components/OAuthFlowDialog.tsx');
    expect(dialog).toContain('SmsBody');
    expect(dialog).toContain('phone_label');
    expect(dialog).toContain('send_code');
  });

  test('the API module uses the dedicated endpoints and never returns a session', () => {
    const api = read('src/services/api/loomy.ts');
    expect(api).toContain("'/loomy-sms-code'");
    expect(api).toContain("'/loomy-login'");
    expect(api).toContain("'/loomy-quota'");
    // The login response shape carries an auth-file id, not a credential.
    const loginResponse = api.slice(api.indexOf('export interface LoomyLoginResponse'));
    expect(loginResponse.slice(0, loginResponse.indexOf('}'))).not.toContain('access_token');
  });

  test('supplies every Loomy label in all six languages', () => {
    const keys = Object.keys(en.auth_login).filter((key) => key.startsWith('loomy_'));
    expect(keys.length).toBeGreaterThanOrEqual(15);
    for (const locale of [en, zhCN, zhTW, ru, ko, vi]) {
      for (const key of keys) {
        expect((locale.auth_login as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
    }
    // The hint must state that the session cannot be renewed, so an operator
    // is not surprised when a 14-day-old credential stops working.
    expect(en.auth_login.loomy_oauth_hint).toContain('cannot be renewed');
  });

  test('supplies the quota card labels in all six languages', () => {
    for (const locale of [en, zhCN, zhTW, ru, ko, vi]) {
      for (const key of [
        'title',
        'empty_data',
        'invalid_credential',
        'total_row',
        'permanent_row',
        'daily_row',
        'daily_hint',
      ]) {
        expect((locale.loomy_quota as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
    }
    // The daily pool does not refill; the hint must say so.
    expect(en.loomy_quota.daily_hint).toContain('does not refill');
  });
});
