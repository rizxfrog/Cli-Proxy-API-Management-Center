import { describe, expect, test } from 'bun:test';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { providerLabel } from '@/features/dashboard/utils';
import { TYPE_COLORS } from '@/utils/quota/constants';
import { createInstance } from 'i18next';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '@/features/providers/descriptors';
import { xiaohuanxiongToResource } from '@/features/providers/adapters';
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
  // i18next init is synchronous for in-memory resources.
  return instance.t.bind(instance);
}

describe('Xiaohuanxiong provider', () => {
  test('registers a workbench descriptor consistent with its backend key shape', () => {
    const descriptor = PROVIDER_DESCRIPTORS.xiaohuanxiong;
    expect(descriptor).toBeDefined();
    expect(descriptor.id).toBe('xiaohuanxiong');
    // The backend XiaohuanxiongKey is a single-credential entry carrying an api-key.
    expect(descriptor.supportsApiKey).toBe(true);
    expect(descriptor.supportsApiKeyEntries).toBe(false);
    // The gateway URL is fixed but overridable, so it must stay optional.
    expect(descriptor.supportsBaseUrl).toBe(true);
    expect(descriptor.baseUrlRequired).toBe(false);
    // The executor reads base_url/api_key and supports headers/models/exclusion.
    expect(descriptor.supportsModels).toBe(true);
    expect(descriptor.supportsHeaders).toBe(true);
    expect(descriptor.supportsExcludedModels).toBe(true);
    expect(descriptor.supportsProxyUrl).toBe(true);
    expect(PROVIDER_BRAND_ORDER).toContain('xiaohuanxiong');
  });

  test('resolves labels and colors for auth-file lists and the dashboard', () => {
    // getTypeLabel falls back to the raw type when a locale key is missing, so
    // assert the translation exists rather than only the icon.
    expect(getTypeLabel(tFor('en'), 'xiaohuanxiong')).toBe('Xiaohuanxiong (Raccoon)');
    expect(getTypeLabel(tFor('zh-CN'), 'xiaohuanxiong')).toContain('小浣熊');
    expect(providerLabel('xiaohuanxiong', 'Unknown')).toBe('Xiaohuanxiong');
    expect(TYPE_COLORS.xiaohuanxiong.light).toBeDefined();
    expect(TYPE_COLORS.xiaohuanxiong.dark).toBeDefined();
  });

  test('provides a brand logo asset', () => {
    expect(PROVIDER_LOGOS.xiaohuanxiong.src).toBeTruthy();
    // The auth-file icon table must resolve the provider key used by auth files.
    expect(getAuthFileIcon('xiaohuanxiong', 'light')).toBeTruthy();
    expect(getAuthFileIcon('xiaohuanxiong', 'dark')).toBeTruthy();
  });

  test('maps a config entry onto a provider resource', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'access-token-abcdef',
      baseUrl: 'https://xiaohuanxiong.com/api/web/llm/v2',
      prefix: 'xhx',
      models: [{ name: 'glm-5-3' }],
      excludedModels: ['kimi-k3'],
    };
    const resource = xiaohuanxiongToResource(config, 0);
    expect(resource.brand).toBe('xiaohuanxiong');
    expect(resource.originalIndex).toBe(0);
    expect(resource.baseUrl).toBe('https://xiaohuanxiong.com/api/web/llm/v2');
    expect(resource.prefix).toBe('xhx');
    expect(resource.modelCount).toBe(1);
    expect(resource.excludedModelCount).toBe(1);
    // The selector must carry the raw apiKey so CRUD can target the entry.
    expect(resource.selector).toMatchObject({
      brand: 'xiaohuanxiong',
      apiKey: 'access-token-abcdef',
      index: 0,
    });
  });

  test('normalizes refresh-token so rotation survives a read/write round trip', () => {
    const normalized = normalizeProviderKeyConfig({
      'api-key': 'access-token',
      'refresh-token': '  refresh-token-value  ',
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.apiKey).toBe('access-token');
    expect(normalized?.refreshToken).toBe('refresh-token-value');
  });

  test('omits refresh-token when the backend did not issue one', () => {
    const normalized = normalizeProviderKeyConfig({ 'api-key': 'access-token' });
    expect(normalized).not.toBeNull();
    expect(normalized?.refreshToken).toBeUndefined();
  });

  test('treats a blank refresh-token as absent rather than an empty credential', () => {
    const normalized = normalizeProviderKeyConfig({
      'api-key': 'access-token',
      'refresh-token': '   ',
    });
    expect(normalized).not.toBeNull();
    expect(normalized?.refreshToken).toBeUndefined();
  });
});
