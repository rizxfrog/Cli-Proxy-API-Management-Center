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

describe('Xiaohuanxiong OAuth login UI', () => {
  test('renders a built-in login card with English copy and no raw i18n keys', () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MemoryRouter, null, createElement(OAuthPage))
      )
    );
    expect(markup).toContain('Xiaohuanxiong');
    expect(markup).toContain('Sign in to Xiaohuanxiong');
    // The hint must tell the user to paste the deep link, since the browser
    // cannot deliver office-raccoon:// to the proxy.
    expect(markup).toContain('office-raccoon://');
    expect(markup).not.toContain('auth_login.xiaohuanxiong_');
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
