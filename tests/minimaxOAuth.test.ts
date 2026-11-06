import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { OAuthPage } from '@/features/oauth/OAuthPage';
import { OAuthFlowDialog } from '@/features/oauth/components/OAuthFlowDialog';
import { oauthApi, type BuiltInOAuthProvider } from '@/services/api/oauth';
import { apiClient } from '@/services/api/client';
import {
  AUTH_FILE_ICONS,
  OAUTH_PROVIDER_PRESETS,
  supportsAuthFileManualRefresh,
} from '@/features/authFiles/constants';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';

const originalGet = apiClient.get;

afterEach(() => {
  apiClient.get = originalGet;
});

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

// The gallery page only renders tiles; titles, login buttons, and hints live in
// the per-provider flow dialog, so the idle dialog view is rendered directly.
const renderDialog = (providerId: 'minimax' | 'minimax-cn') => {
  const isIntl = providerId === 'minimax';
  const textPrefix = isIntl ? 'minimax' : 'minimax_cn';
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(OAuthFlowDialog, {
        open: true,
        providerId,
        heading: {
          title: isIntl ? en.auth_login.minimax_oauth_title : en.auth_login.minimax_cn_oauth_title,
          caption: en.auth_login.method_browser,
          icon: '',
        },
        state: {},
        text: (suffix: string) => i18n.t(`auth_login.${textPrefix}_${suffix}`),
        supportsCallback: false,
        onStart: () => {},
        onCancel: () => {},
        onCallbackChange: () => {},
        onCallbackSubmit: () => {},
        onViewAuthFiles: () => {},
        onClose: () => {},
      })
    )
  );
};

describe('MiniMax Code OAuth', () => {
  test('uses the backend device-flow management endpoints', async () => {
    const calls: Array<{ url: string; config?: unknown }> = [];
    apiClient.get = (async (url: string, config?: unknown) => {
      calls.push({ url, config });
      return { url: 'https://account.minimax.io/oauth2/device', state: 'USER-CODE' };
    }) as typeof apiClient.get;

    const intl: BuiltInOAuthProvider = 'minimax';
    const cn: BuiltInOAuthProvider = 'minimax-cn';
    await oauthApi.startAuth(intl);
    await oauthApi.startAuth(cn);

    expect(calls).toEqual([
      { url: '/minimax-auth-url', config: { params: undefined } },
      { url: '/minimax-cn-auth-url', config: { params: undefined } },
    ]);
  });

  test('renders the tiles with labels and no raw i18n keys', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MemoryRouter, null, createElement(OAuthPage))
      )
    );
    expect(markup).toContain('MiniMax Code');
    expect(markup).toContain('MiniMax Code (CN)');
    expect(markup).toContain(en.auth_login.method_browser);
    expect(markup).not.toContain('auth_login.minimax_');
  });

  test('the dialogs show the OAuth titles and login buttons', () => {
    const intl = renderDialog('minimax');
    expect(intl).toContain('MiniMax Code OAuth (International)');
    expect(intl).toContain('Log in with MiniMax Code');
    expect(intl).not.toContain('auth_login.');

    const cn = renderDialog('minimax-cn');
    expect(cn).toContain('MiniMax Code OAuth (China)');
    expect(cn).toContain('Log in with MiniMax Code (CN)');
    expect(cn).not.toContain('auth_login.');
  });

  test('supplies every MiniMax label in all four languages', () => {
    for (const prefix of ['minimax_', 'minimax_cn_']) {
      const keys = Object.keys(en.auth_login).filter((key) => key.startsWith(prefix));
      expect(keys.length).toBeGreaterThanOrEqual(11);
      for (const locale of [en, zhCN, zhTW, ru]) {
        for (const key of keys) {
          expect((locale.auth_login as Record<string, string>)[key]?.trim()).toBeTruthy();
        }
      }
    }
  });

  test('registers auth-file icons, manual refresh and OAuth presets', () => {
    expect(AUTH_FILE_ICONS.minimax).toBeDefined();
    expect(AUTH_FILE_ICONS['minimax-cn']).toBeDefined();
    expect(supportsAuthFileManualRefresh('minimax')).toBe(true);
    expect(supportsAuthFileManualRefresh('minimax-cn')).toBe(true);
    expect(OAUTH_PROVIDER_PRESETS).toContain('minimax');
    expect(OAUTH_PROVIDER_PRESETS).toContain('minimax-cn');
  });
});
