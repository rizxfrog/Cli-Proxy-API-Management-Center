import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

const read = (relativePath: string) => readFileSync(join(repoRoot, relativePath), 'utf8');

const oauthPage = read('src/pages/OAuthPage.tsx');
const oauth = read('src/services/api/oauth.ts');
const providersApi = read('src/services/api/providers.ts');
const form = read('src/features/providers/sheets/forms/BaseProviderForm.tsx');

describe('CodeArts OAuth contract', () => {
  test('starts the flow through the provider-scoped auth-url route', () => {
    // oauthApi.startAuth derives `/${providerKey}-auth-url`, which must match the
    // backend registration GET /codearts-auth-url.
    expect(oauth).toContain('`/${providerKey}-auth-url`');
    expect(oauth).toContain("'codearts'");
  });

  test('does not request the webui device-code variant', () => {
    // WEBUI_SUPPORTED gates an is_webui query param used by device-code
    // providers; CodeArts is a browser callback flow and must stay out.
    const webuiBlock = oauth.slice(
      oauth.indexOf('const WEBUI_SUPPORTED'),
      oauth.indexOf('const normalizeProviderForManagementPath')
    );
    expect(webuiBlock).not.toContain('codearts');
  });

  test('submits the callback through the dedicated loopback endpoint', () => {
    // CodeArts redirects to a 127.0.0.1 loopback URL owned by the desktop client,
    // so the proxy never receives the code and the shared /oauth-callback
    // contract cannot be used.
    expect(oauth).toContain("'/codearts-auth-callback'");
    expect(oauthPage).toContain('submitCodeArtsCallback');
    // The provider must be routed before the generic submitCallback call.
    const dedicatedIndex = oauthPage.indexOf('submitCodeArtsCallback');
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
    expect(callbackBlock).toContain("'codearts'");
  });

  test('renders a built-in login card', () => {
    expect(oauthPage).toContain('codearts.svg');
    const providersBlock = oauthPage.slice(
      oauthPage.indexOf('const PROVIDERS'),
      oauthPage.indexOf('const BUILTIN_PROVIDER_IDS')
    );
    expect(providersBlock).toContain("id: 'codearts'");
    expect(providersBlock).toContain('codearts_oauth_title');
  });

  test('offers the Huawei Cloud credential triple fields with backend field names', () => {
    // The form must collect all three parts of the AK/SK/security-token triple.
    expect(form).toContain("updateField('secretKey'");
    expect(form).toContain("updateField('securityToken'");
    expect(form).toContain("updateField('refreshToken'");
    expect(form).toContain("brand === 'codearts'");

    // The serialized keys must match the backend CodeArtsKey JSON tags.
    expect(providersApi).toContain("payload['secret-key']");
    expect(providersApi).toContain("payload['security-token']");
    expect(providersApi).toContain("payload['refresh-token']");
  });

  test('declares the extra key fields for the merge/strip allowlist', () => {
    // mergeProviderKeyPayload strips unknown fields, so the new keys must be
    // registered or edits would silently drop them.
    expect(providersApi).toContain("'secret-key'");
    expect(providersApi).toContain("'security-token'");
    expect(providersApi).toContain('CODEARTS_KEY_FIELDS');
  });

  test('targets the backend credential endpoints', () => {
    expect(providersApi).toContain("mutateLatestProviderList('codearts-api-key'");
    expect(providersApi).toContain('`/codearts-api-key${buildProviderDeleteQuery');
  });

  test('reads the codearts-api-key config section', () => {
    const transformers = read('src/services/api/transformers.ts');
    expect(transformers).toContain("raw['codearts-api-key']");
    expect(transformers).toContain('config.codeartsApiKeys');
  });

  test('translates every CodeArts label in all four locales', () => {
    const locales = ['en', 'zh-CN', 'zh-TW', 'ru'];
    const required = [
      'codearts_oauth_title',
      'codearts_oauth_button',
      'codearts_oauth_hint',
      'codearts_oauth_url_label',
      'codearts_copy_link',
      'codearts_open_link',
      'codearts_oauth_status_waiting',
      'codearts_oauth_status_success',
      'codearts_oauth_status_error',
      'codearts_oauth_start_error',
      'codearts_oauth_polling_error',
    ];
    for (const locale of locales) {
      const dict = JSON.parse(read(`src/i18n/locales/${locale}.json`));
      for (const key of required) {
        expect(dict.auth_login?.[key]).toBeTruthy();
      }
      expect(dict.auth_files?.filter_codearts).toBeTruthy();
      expect(dict.providersPage?.providerNames?.codearts).toBeTruthy();
      for (const key of [
        'secretKey',
        'secretKeyHint',
        'secretKeyCreatePlaceholder',
        'secretKeyEditPlaceholder',
        'showSecretKey',
        'hideSecretKey',
        'securityToken',
        'securityTokenHint',
        'securityTokenCreatePlaceholder',
        'securityTokenEditPlaceholder',
        'showSecurityToken',
        'hideSecurityToken',
        'codeartsRefreshTokenHint',
      ]) {
        expect(dict.providersPage?.form?.[key]).toBeTruthy();
      }
    }
  });
});
