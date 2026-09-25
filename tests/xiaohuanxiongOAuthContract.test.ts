import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

const read = (relativePath: string) =>
  readFileSync(join(repoRoot, relativePath), 'utf8');

const oauthPage = read('src/pages/OAuthPage.tsx');
const oauth = read('src/services/api/oauth.ts');

describe('Xiaohuanxiong OAuth contract', () => {
  test('starts the flow through the provider-scoped auth-url route', () => {
    // oauthApi.startAuth derives `/${provider}-auth-url`, which must match the
    // backend registration GET /xiaohuanxiong-auth-url.
    expect(oauth).toContain('`/${providerKey}-auth-url`');
    expect(oauth).toContain("'xiaohuanxiong'");
  });

  test('does not request the webui device-code variant', () => {
    // WEBUI_SUPPORTED gates an is_webui query param used by device-code
    // providers; Xiaohuanxiong is a browser callback flow and must stay out.
    const webuiBlock = oauth.slice(
      oauth.indexOf('const WEBUI_SUPPORTED'),
      oauth.indexOf('const normalizeProviderForManagementPath')
    );
    expect(webuiBlock).not.toContain('xiaohuanxiong');
  });

  test('submits the callback through the dedicated state-free endpoint', () => {
    // The office-raccoon:// deep link carries only a code, so the shared
    // /oauth-callback contract (which requires state) cannot accept it.
    expect(oauth).toContain("'/xiaohuanxiong-auth-callback'");
    expect(oauthPage).toContain('submitXiaohuanxiongCallback');
    // The provider must be routed before the generic submitCallback call.
    const dedicatedIndex = oauthPage.indexOf('submitXiaohuanxiongCallback');
    const genericIndex = oauthPage.indexOf('await oauthApi.submitCallback(');
    expect(dedicatedIndex).toBeGreaterThan(-1);
    expect(genericIndex).toBeGreaterThan(-1);
    expect(dedicatedIndex).toBeLessThan(genericIndex);
  });

  test('is listed as a callback provider so the paste field is rendered', () => {
    const callbackBlock = oauthPage.slice(
      oauthPage.indexOf('const CALLBACK_SUPPORTED'),
      oauthPage.indexOf('const XAI_CALLBACK_URL')
    );
    expect(callbackBlock).toContain("'xiaohuanxiong'");
  });

  test('offers a refresh-token field wired to the backend field name', () => {
    const form = read('src/features/providers/sheets/forms/BaseProviderForm.tsx');
    expect(form).toContain("updateField('refreshToken'");
    expect(form).toContain("brand === 'xiaohuanxiong'");

    const providersApi = read('src/services/api/providers.ts');
    // The serialized key must be the backend's `refresh-token`.
    expect(providersApi).toContain("payload['refresh-token']");
    expect(providersApi).toContain("'refresh-token'");
  });

  test('targets the backend credential endpoints', () => {
    const providersApi = read('src/services/api/providers.ts');
    expect(providersApi).toContain("mutateLatestProviderList('xiaohuanxiong-api-key'");
    expect(providersApi).toContain('`/xiaohuanxiong-api-key${buildProviderDeleteQuery');
  });

  test('translates every Xiaohuanxiong label in all four locales', () => {
    const locales = ['en', 'zh-CN', 'zh-TW', 'ru'];
    const required = [
      'xiaohuanxiong_oauth_title',
      'xiaohuanxiong_oauth_button',
      'xiaohuanxiong_oauth_hint',
      'xiaohuanxiong_oauth_url_label',
      'xiaohuanxiong_callback_label',
      'xiaohuanxiong_callback_hint',
      'xiaohuanxiong_callback_placeholder',
      'xiaohuanxiong_callback_required',
      'xiaohuanxiong_copy_link',
      'xiaohuanxiong_open_link',
      'xiaohuanxiong_oauth_status_waiting',
      'xiaohuanxiong_oauth_status_success',
      'xiaohuanxiong_oauth_status_error',
      'xiaohuanxiong_oauth_start_error',
      'xiaohuanxiong_oauth_polling_error',
    ];
    for (const locale of locales) {
      const dict = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      for (const key of required) {
        expect(dict.auth_login?.[key]).toBeTruthy();
      }
      expect(dict.providersPage?.providerNames?.xiaohuanxiong).toBeTruthy();
      for (const key of [
        'refreshToken',
        'refreshTokenHint',
        'refreshTokenCreatePlaceholder',
        'refreshTokenEditPlaceholder',
        'showRefreshToken',
        'hideRefreshToken',
      ]) {
        expect(dict.providersPage?.form?.[key]).toBeTruthy();
      }
    }
  });

  test('keeps the advertise import used by the OAuth card', () => {
    expect(oauthPage).toContain('xiaohuanxiong.svg');
  });
});
