import { describe, expect, test } from 'bun:test';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { providerLabel } from '@/features/dashboard/utils';
import { TYPE_COLORS } from '@/utils/quota/constants';
import { createInstance } from 'i18next';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '@/features/providers/descriptors';
import { codeArtsToResource } from '@/features/providers/adapters';
import { normalizeProviderKeyConfig } from '@/services/api/transformers';
import type { ProviderKeyConfig } from '@/types';

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
  return instance.t.bind(instance);
}

describe('CodeArts provider', () => {
  test('registers a workbench descriptor consistent with its backend key shape', () => {
    const descriptor = PROVIDER_DESCRIPTORS.codearts;
    expect(descriptor).toBeDefined();
    expect(descriptor.id).toBe('codearts');
    // The backend CodeArtsKey carries a single AK/SK/security-token credential.
    expect(descriptor.supportsApiKey).toBe(true);
    expect(descriptor.supportsApiKeyEntries).toBe(false);
    // The gateway URL is fixed but overridable, so it must stay optional.
    expect(descriptor.supportsBaseUrl).toBe(true);
    expect(descriptor.baseUrlRequired).toBe(false);
    expect(descriptor.supportsModels).toBe(true);
    expect(descriptor.supportsHeaders).toBe(true);
    expect(descriptor.supportsExcludedModels).toBe(true);
    expect(descriptor.supportsProxyUrl).toBe(true);
    expect(PROVIDER_BRAND_ORDER).toContain('codearts');
  });

  test('resolves labels and colors for auth-file lists and the dashboard', () => {
    // getTypeLabel falls back to the raw type when a locale key is missing, so
    // assert the translation exists rather than only the icon.
    expect(getTypeLabel(tFor('en'), 'codearts')).toBe('CodeArts (Huawei)');
    expect(getTypeLabel(tFor('zh-CN'), 'codearts')).toContain('CodeArts');
    expect(providerLabel('codearts', 'Unknown')).toBe('CodeArts');
    expect(TYPE_COLORS.codearts.light).toBeDefined();
    expect(TYPE_COLORS.codearts.dark).toBeDefined();
  });

  test('provides a brand logo asset', () => {
    expect(PROVIDER_LOGOS.codearts.src).toBeTruthy();
    expect(getAuthFileIcon('codearts', 'light')).toBeTruthy();
    expect(getAuthFileIcon('codearts', 'dark')).toBeTruthy();
  });

  test('maps a config entry onto a provider resource', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'AK_TEMP_ACCESS_KEY',
      secretKey: 'SK_TEMP_SECRET',
      securityToken: 'ST_TEMP_TOKEN',
      baseUrl: 'https://snap-access.cn-north-4.myhuaweicloud.com/api/v2',
      prefix: 'ca',
      models: [{ name: 'GLM-5.2' }],
      excludedModels: ['Auto'],
    };
    const resource = codeArtsToResource(config, 0);
    expect(resource.brand).toBe('codearts');
    expect(resource.originalIndex).toBe(0);
    expect(resource.baseUrl).toBe('https://snap-access.cn-north-4.myhuaweicloud.com/api/v2');
    expect(resource.prefix).toBe('ca');
    expect(resource.modelCount).toBe(1);
    expect(resource.excludedModelCount).toBe(1);
    // The selector must carry the raw apiKey so CRUD can target the entry.
    expect(resource.selector).toMatchObject({
      brand: 'codearts',
      apiKey: 'AK_TEMP_ACCESS_KEY',
      index: 0,
    });
  });

  test('normalizes the Huawei Cloud credential triple so signing survives a round trip', () => {
    const normalized = normalizeProviderKeyConfig({
      'api-key': 'AK_TEMP',
      'secret-key': '  SK_TEMP  ',
      'security-token': '  ST_TEMP  ',
      'refresh-token': '  RT_TEMP  ',
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.apiKey).toBe('AK_TEMP');
    // Without the secret key the backend cannot produce a valid signature.
    expect(normalized?.secretKey).toBe('SK_TEMP');
    expect(normalized?.securityToken).toBe('ST_TEMP');
    expect(normalized?.refreshToken).toBe('RT_TEMP');
  });

  test('omits the optional triple members when the backend did not issue them', () => {
    const normalized = normalizeProviderKeyConfig({ 'api-key': 'AK_ONLY' });
    expect(normalized).not.toBeNull();
    expect(normalized?.secretKey).toBeUndefined();
    expect(normalized?.securityToken).toBeUndefined();
    expect(normalized?.refreshToken).toBeUndefined();
  });

  test('treats a blank triple member as absent rather than an empty credential', () => {
    const normalized = normalizeProviderKeyConfig({
      'api-key': 'AK_TEMP',
      'secret-key': '   ',
      'security-token': '   ',
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.secretKey).toBeUndefined();
    expect(normalized?.securityToken).toBeUndefined();
  });
});
