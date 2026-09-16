import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { OAuthPage } from '@/pages/OAuthPage';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: { en: { translation: en } } });

describe('CodeArts OAuth login UI', () => {
  test('renders a built-in login card with English copy and no raw i18n keys', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MemoryRouter, null, createElement(OAuthPage))
      )
    );
    expect(markup).toContain('CodeArts');
    expect(markup).toContain('Sign in to CodeArts');
    // The hint must tell the user to paste the loopback callback URL, since the
    // browser cannot deliver it to the proxy.
    expect(markup).toContain('127.0.0.1');
    expect(markup).not.toContain('auth_login.codearts_');
  });

  test('supplies every CodeArts label in all four languages', () => {
    const keys = Object.keys(en.auth_login).filter((key) => key.startsWith('codearts_'));
    expect(keys.length).toBeGreaterThanOrEqual(11);
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.auth_login as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      // Each locale must keep the loopback address in its hint so the
      // instruction stays actionable after translation.
      expect(locale.auth_login.codearts_oauth_hint).toContain('127.0.0.1');
    }
  });
});

describe('CodeArts provider form labels', () => {
  test('translates the credential triple fields in all four languages', () => {
    const keys = [
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
    ];
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.providersPage.form as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      // The security-token hint must name the wire header so operators can
      // cross-check it against the upstream docs.
      expect(locale.providersPage.form.securityTokenHint).toContain('X-Security-Token');
    }
  });

  test('names the provider in every locale', () => {
    for (const locale of [en, zhCN, zhTW, ru]) {
      expect(locale.providersPage.providerNames.codearts?.trim()).toBeTruthy();
    }
    expect(en.providersPage.providerNames.codearts).toContain('CodeArts');
  });
});
