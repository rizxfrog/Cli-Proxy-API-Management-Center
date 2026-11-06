import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { OAuthPage } from '@/features/oauth/OAuthPage';
import { OAuthFlowDialog } from '@/features/oauth/components/OAuthFlowDialog';
import { OAUTH_PROVIDERS, supportsManualCallback } from '@/features/oauth/providers';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';

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

// The gallery page only renders tiles (label + caption); the sign-in button and
// the deep-link paste hint live in the per-provider flow dialog, so they are
// asserted against the idle dialog view rendered directly.
const renderDialog = () => {
  const card = OAUTH_PROVIDERS.find((provider) => provider.id === 'xiaohuanxiong');
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(OAuthFlowDialog, {
        open: true,
        providerId: 'xiaohuanxiong',
        heading: {
          title: en.auth_login.xiaohuanxiong_oauth_title,
          caption: en.auth_login.method_browser,
          icon: '',
        },
        state: {},
        text: (suffix: string) => i18n.t(`auth_login.xiaohuanxiong_${suffix}`),
        supportsCallback: card ? supportsManualCallback(card) : false,
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

describe('Xiaohuanxiong OAuth login UI', () => {
  test('renders the tile and caption without raw i18n keys', () => {
    const markup = renderPage();
    expect(markup).toContain('Xiaohuanxiong');
    expect(markup).toContain(en.auth_login.method_browser);
    expect(markup).not.toContain('auth_login.xiaohuanxiong_');
  });

  test('the dialog offers sign-in with the deep-link paste hint', () => {
    const markup = renderDialog();
    expect(markup).toContain('Sign in to Xiaohuanxiong');
    // The hint must tell the user to paste the deep link, since the browser
    // cannot deliver office-raccoon:// to the proxy.
    expect(markup).toContain('office-raccoon://');
    expect(markup).not.toContain('auth_login.');
  });

  test('supplies every Xiaohuanxiong label in all four languages', () => {
    const keys = Object.keys(en.auth_login).filter((key) => key.startsWith('xiaohuanxiong_'));
    expect(keys.length).toBeGreaterThanOrEqual(11);
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.auth_login as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      // Each locale must keep the deep-link scheme in its hint so the
      // instruction stays actionable after translation.
      expect(locale.auth_login.xiaohuanxiong_oauth_hint).toContain('office-raccoon://');
    }
  });

  test('advertises both accepted callback formats in every language', () => {
    // The backend accepts the office-raccoon:// deep link and a bare one-time
    // code, so the copy must offer both instead of implying a URL is required.
    for (const locale of [en, zhCN, zhTW, ru]) {
      const hints = locale.auth_login as Record<string, string>;
      // The deep link is the canonical form and must appear in the hint.
      expect(hints.xiaohuanxiong_callback_hint).toContain('office-raccoon://');
      // The placeholder is the canonical spot that spells out both formats.
      const placeholder = hints.xiaohuanxiong_callback_placeholder;
      expect(placeholder).toContain('office-raccoon://');
      expect(placeholder).toContain('code');
    }
    // The paste field for Xiaohuanxiong must use its own copy rather than the
    // generic http://localhost:... loopback hint. The dedicated-copy registry
    // lives in the flows hook, and the dialog resolves its label/hint/
    // placeholder through it.
    const hook = read('src/features/oauth/hooks/useOAuthFlows.ts');
    const copyBlock = hook.slice(
      hook.indexOf('const DEDICATED_CALLBACK_COPY'),
      hook.indexOf('export const callbackTextKey')
    );
    expect(copyBlock).toContain("'xiaohuanxiong'");
    const dialog = read('src/features/oauth/components/OAuthFlowDialog.tsx');
    expect(dialog).toContain("callbackTextKey(providerId, 'label')");
    expect(dialog).toContain("callbackTextKey(providerId, 'hint')");
    expect(dialog).toContain("callbackTextKey(providerId, 'placeholder')");
    // The empty-input warning must name the two accepted formats too.
    expect(hook).toContain('xiaohuanxiong_callback_required');
  });
});

describe('Xiaohuanxiong provider form labels', () => {
  test('translates the refresh-token field in all four languages', () => {
    const keys = [
      'refreshToken',
      'refreshTokenHint',
      'refreshTokenCreatePlaceholder',
      'refreshTokenEditPlaceholder',
      'showRefreshToken',
      'hideRefreshToken',
    ];
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.providersPage.form as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      // The hint must name the rotation endpoint so operators can verify it.
      expect(locale.providersPage.form.refreshTokenHint).toContain('/api/web/auth/v1/refresh');
    }
  });

  test('names the provider in every locale', () => {
    for (const locale of [en, zhCN, zhTW, ru]) {
      expect(locale.providersPage.providerNames.xiaohuanxiong?.trim()).toBeTruthy();
    }
    // The Simplified Chinese name is the product's own name.
    expect(zhCN.providersPage.providerNames.xiaohuanxiong).toContain('小浣熊');
  });
});
