import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createInstance } from 'i18next';
import {
  AUTH_FILE_MANUAL_REFRESH_PROVIDERS,
  QUOTA_PROVIDER_TYPES,
  getAuthFileIcon,
  getTypeLabel,
} from '@/features/authFiles/constants';
import { providerLabel } from '@/features/dashboard/utils';
import { TYPE_COLORS } from '@/utils/quota/constants';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';

/**
 * getTypeLabel looks up `auth_files.filter_<provider>` via i18next, so the test
 * needs a real instance rather than a stub translation function.
 */
function tFor(locale: 'en' | 'zh-CN') {
  const instance = createInstance();
  instance.init({
    lng: locale,
    resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
  });
  // i18next init is synchronous for in-memory resources.
  return instance.t.bind(instance);
}

describe('Dumate provider', () => {
  test('labels the credential in the auth-file list and the dashboard', () => {
    expect(getTypeLabel(tFor('en'), 'dumate')).toBe('Dumate');
    expect(getTypeLabel(tFor('zh-CN'), 'dumate')).toBe('百度搭子');
    // The dashboard falls back to a capitalized id, which must stay exact.
    expect(providerLabel('dumate', 'Unknown')).toBe('Dumate');
  });

  test('ships a brand icon for both themes', () => {
    const light = getAuthFileIcon('dumate', 'light');
    const dark = getAuthFileIcon('dumate', 'dark');
    expect(light).toBeTruthy();
    expect(dark).toBeTruthy();
    expect(light).toBe(dark);
  });

  test('resolves a type badge color instead of the unknown fallback', () => {
    const color = TYPE_COLORS.dumate;
    expect(color).toBeDefined();
    expect(color.light.bg).toBeTruthy();
    expect(color.dark.bg).toBeTruthy();
    expect(color).not.toEqual(TYPE_COLORS.unknown);
  });

  test('registers a quota tab but stays out of the refresh registry', () => {
    // The points wallet is a real measured balance read through the console, so
    // the provider belongs to the built-in quota cards.
    expect(QUOTA_PROVIDER_TYPES.has('dumate' as never)).toBe(true);
    // The exported credential is static: no refresh lead is registered, so a
    // manual-refresh action would have nothing to rotate.
    expect(AUTH_FILE_MANUAL_REFRESH_PROVIDERS.has('dumate')).toBe(false);
  });

  test('has a filter label in every supported locale', () => {
    const locales = ['en', 'zh-CN', 'zh-TW', 'ru', 'vi', 'ko', 'tr'];
    const labels = locales.map((locale) => {
      const json = JSON.parse(
        readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
      ) as { auth_files: Record<string, string> };
      return json.auth_files.filter_dumate;
    });
    for (const [index, label] of labels.entries()) {
      expect(`${locales[index]}:${typeof label === 'string' && label.trim().length > 0}`).toBe(
        `${locales[index]}:true`
      );
    }
  });
});
