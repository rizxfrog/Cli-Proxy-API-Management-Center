import { afterEach, describe, expect, test } from 'bun:test';
import { createInstance } from 'i18next';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { providerLabel } from '@/features/dashboard/utils';
import { TYPE_COLORS } from '@/utils/quota/constants';
import { PROVIDER_LOGOS } from '@/features/providers/brandLogos';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '@/features/providers/descriptors';
import { clineToResource } from '@/features/providers/adapters';
import { apiClient } from '@/services/api/client';
import { oauthApi, type BuiltInOAuthProvider } from '@/services/api/oauth';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { providersApi } from '@/services/api/providers';
import type { ProviderKeyConfig } from '@/types';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
const originalDelete = apiClient.delete;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
  apiClient.delete = originalDelete;
});

/** getTypeLabel looks up `auth_files.filter_<provider>` via i18next. */
function tFor(locale: 'en' | 'zh-CN') {
  const instance = createInstance();
  instance.init({
    lng: locale,
    resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
  });
  return instance.t.bind(instance);
}

describe('Cline provider', () => {
  test('registers a workbench descriptor consistent with its backend key shape', () => {
    const descriptor = PROVIDER_DESCRIPTORS.cline;
    expect(descriptor).toBeDefined();
    expect(descriptor.id).toBe('cline');
    // The backend ClineKey is the shared OpenAI-compatible api-key shape.
    expect(descriptor.supportsApiKey).toBe(true);
    expect(descriptor.supportsApiKeyEntries).toBe(false);
    // The api.cline.bot gateway URL is fixed but overridable, so it stays optional.
    expect(descriptor.supportsBaseUrl).toBe(true);
    expect(descriptor.baseUrlRequired).toBe(false);
    expect(descriptor.supportsModels).toBe(true);
    expect(descriptor.supportsHeaders).toBe(true);
    expect(descriptor.supportsExcludedModels).toBe(true);
    expect(descriptor.supportsProxyUrl).toBe(true);
    expect(PROVIDER_BRAND_ORDER).toContain('cline');
  });

  test('resolves labels and colors for auth-file lists and the dashboard', () => {
    expect(getTypeLabel(tFor('en'), 'cline')).toBe('Cline');
    expect(getTypeLabel(tFor('zh-CN'), 'cline')).toBe('Cline');
    expect(providerLabel('cline', 'Unknown')).toBe('Cline');
    expect(TYPE_COLORS.cline.light).toBeDefined();
    expect(TYPE_COLORS.cline.dark).toBeDefined();
  });

  test('provides a brand logo asset', () => {
    expect(PROVIDER_LOGOS.cline.src).toBeTruthy();
    expect(getAuthFileIcon('cline', 'light')).toBeTruthy();
    expect(getAuthFileIcon('cline', 'dark')).toBeTruthy();
  });

  test('maps a config entry onto a provider resource', () => {
    const config: ProviderKeyConfig = {
      apiKey: 'workos:cline-token',
      refreshToken: 'cline-refresh',
      baseUrl: 'https://api.cline.bot/api/v1',
      prefix: 'cl',
      models: [{ name: 'anthropic/claude-opus-4.8', alias: 'claude-opus' }],
      excludedModels: ['openrouter/free'],
    };
    const resource = clineToResource(config, 0);
    expect(resource.brand).toBe('cline');
    expect(resource.originalIndex).toBe(0);
    expect(resource.baseUrl).toBe('https://api.cline.bot/api/v1');
    expect(resource.prefix).toBe('cl');
    expect(resource.modelCount).toBe(1);
    expect(resource.excludedModelCount).toBe(1);
    // The selector must carry the raw apiKey so CRUD can target the entry.
    expect(resource.selector).toMatchObject({
      brand: 'cline',
      apiKey: 'workos:cline-token',
      index: 0,
    });
  });

  test('normalizes the backend cline-api-key contract', () => {
    const config = normalizeConfigResponse({
      'cline-api-key': [
        {
          'api-key': 'workos:access',
          'refresh-token': '  refresh-token-value  ',
          priority: 2,
          prefix: 'cl',
          'base-url': 'https://api.cline.bot/api/v1',
          models: [{ name: 'anthropic/claude-opus-4.8', alias: 'claude-opus' }],
          'excluded-models': ['openrouter/free'],
          'auth-index': 'cline:apikey:1',
        },
      ],
    });

    expect(config.clineApiKeys).toEqual([
      {
        apiKey: 'workos:access',
        refreshToken: 'refresh-token-value',
        priority: 2,
        prefix: 'cl',
        baseUrl: 'https://api.cline.bot/api/v1',
        models: [{ name: 'anthropic/claude-opus-4.8', alias: 'claude-opus' }],
        excludedModels: ['openrouter/free'],
        authIndex: 'cline:apikey:1',
      },
    ]);
  });

  test('writes and deletes cline-api-key through the backend management contract', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return { 'cline-api-key': [] };
    }) as typeof apiClient.get;
    apiClient.put = (async (url: string, data?: unknown) => {
      calls.push({ method: 'PUT', url, body: data });
      return undefined;
    }) as typeof apiClient.put;
    apiClient.delete = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return undefined;
    }) as typeof apiClient.delete;

    await providersApi.createClineConfig({
      apiKey: 'workos:access',
      refreshToken: 'refresh-token-value',
      baseUrl: 'https://api.cline.bot/api/v1',
    });
    await providersApi.deleteClineConfig('workos:access', 'https://api.cline.bot/api/v1');

    expect(calls).toEqual([
      { method: 'GET', url: '/config' },
      {
        method: 'PUT',
        url: '/cline-api-key',
        body: [
          {
            'api-key': 'workos:access',
            'refresh-token': 'refresh-token-value',
            'base-url': 'https://api.cline.bot/api/v1',
          },
        ],
      },
      {
        method: 'DELETE',
        url: '/cline-api-key?api-key=workos%3Aaccess&base-url=https%3A%2F%2Fapi.cline.bot%2Fapi%2Fv1',
      },
    ]);
  });

  test('exposes Cline as a built-in OAuth provider reaching the dedicated callback endpoint', async () => {
    // Type-level: 'cline' is a valid built-in OAuth provider key.
    const provider: BuiltInOAuthProvider = 'cline';
    expect(provider).toBe('cline');

    const calls: string[] = [];
    apiClient.get = (async (url: string) => {
      calls.push(`GET ${url}`);
      return { url: 'https://api.cline.bot/api/v1/auth/authorize', state: 's', flow: 'manual' } as never;
    }) as never;
    apiClient.post = (async (url: string) => {
      calls.push(`POST ${url}`);
      return { status: 'ok' } as never;
    }) as never;

    const start = await oauthApi.startAuth('cline');
    expect(start.url).toContain('api.cline.bot');
    expect(calls).toContain('GET /cline-auth-url');

    await oauthApi.submitClineCallback('s', 'http://127.0.0.1:18080/callback?code=abc');
    expect(calls).toContain('POST /cline-auth-callback');
  });
});
