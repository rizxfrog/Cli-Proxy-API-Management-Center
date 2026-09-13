import { afterEach, describe, expect, test } from 'bun:test';
import type { TFunction } from 'i18next';
import { codebuddyAiToResource } from '../src/features/providers/adapters';
import { PROVIDER_LOGOS } from '../src/features/providers/brandLogos';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { CODEBUDDY_CONFIG } from '../src/features/quota/providers/codebuddy/data';
import { apiCallApi } from '../src/services/api';
import { apiClient } from '../src/services/api/client';
import { oauthApi, type BuiltInOAuthProvider } from '../src/services/api/oauth';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import { isCodeBuddyAiFile, isCodeBuddyFile } from '../src/utils/quota/validators';
import type { AuthFileItem } from '../src/types';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
const originalDelete = apiClient.delete;
const originalApiCallRequest = apiCallApi.request;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
  apiClient.delete = originalDelete;
  apiCallApi.request = originalApiCallRequest;
});

describe('CodeBuddy AI (international) provider', () => {
  test('normalizes the backend codebuddy-ai-api-key contract and exposes a workbench resource', () => {
    const config = normalizeConfigResponse({
      'codebuddy-ai-api-key': [
        {
          'api-key': 'cbai-secret',
          priority: 3,
          prefix: 'cba',
          'base-url': 'https://www.codebuddy.ai/v2',
          'proxy-url': 'http://proxy.local',
          headers: { 'X-Custom': 'value' },
          models: [{ name: 'gpt-5.5', alias: 'gpt-latest' }],
          'excluded-models': ['gemini-2.5-pro'],
          'disable-cooling': true,
          'auth-index': 'codebuddy-ai:apikey:1',
        },
      ],
    });

    expect(config.codebuddyAiApiKeys).toEqual([
      {
        apiKey: 'cbai-secret',
        priority: 3,
        prefix: 'cba',
        baseUrl: 'https://www.codebuddy.ai/v2',
        proxyUrl: 'http://proxy.local',
        headers: { 'X-Custom': 'value' },
        models: [{ name: 'gpt-5.5', alias: 'gpt-latest' }],
        excludedModels: ['gemini-2.5-pro'],
        disableCooling: true,
        authIndex: 'codebuddy-ai:apikey:1',
      },
    ]);

    const resource = codebuddyAiToResource(config.codebuddyAiApiKeys![0], 0);
    expect(resource.brand).toBe('codebuddyAi');
    expect(resource.baseUrl).toBe('https://www.codebuddy.ai/v2');
    expect(resource.models).toEqual(['gpt-5.5']);
    expect(resource.selector).toEqual({
      brand: 'codebuddyAi',
      apiKey: 'cbai-secret',
      baseUrl: 'https://www.codebuddy.ai/v2',
      index: 0,
    });
  });

  test('is registered in the workbench descriptor, logo and brand order tables', () => {
    expect(PROVIDER_DESCRIPTORS.codebuddyAi).toBeDefined();
    expect(PROVIDER_DESCRIPTORS.codebuddyAi.supportsApiKey).toBe(true);
    expect(PROVIDER_DESCRIPTORS.codebuddyAi.baseUrlRequired).toBe(false);
    expect(PROVIDER_DESCRIPTORS.codebuddyAi.supportsBaseUrl).toBe(true);
    expect(PROVIDER_LOGOS.codebuddyAi).toBeDefined();
    expect(PROVIDER_BRAND_ORDER).toContain('codebuddyAi');
  });

  test('creates and deletes international keys through the backend management contract', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return {
        'codebuddy-ai-api-key': [
          {
            'api-key': 'existing',
            'base-url': 'https://www.codebuddy.ai/v2',
            'future-field': 'preserved',
          },
        ],
      };
    }) as typeof apiClient.get;
    apiClient.put = (async (url: string, data?: unknown) => {
      calls.push({ method: 'PUT', url, body: data });
      return undefined;
    }) as typeof apiClient.put;
    apiClient.delete = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return undefined;
    }) as typeof apiClient.delete;

    await providersApi.createCodeBuddyAIConfig({
      apiKey: 'cbai-new',
      baseUrl: 'https://www.codebuddy.ai/v2',
    });
    await providersApi.deleteCodeBuddyAIConfig('cbai-new', 'https://www.codebuddy.ai/v2');

    expect(calls).toEqual([
      { method: 'GET', url: '/config' },
      {
        method: 'PUT',
        url: '/codebuddy-ai-api-key',
        body: [
          {
            'api-key': 'existing',
            'base-url': 'https://www.codebuddy.ai/v2',
            'future-field': 'preserved',
          },
          {
            'api-key': 'cbai-new',
            'base-url': 'https://www.codebuddy.ai/v2',
          },
        ],
      },
      {
        method: 'DELETE',
        url: '/codebuddy-ai-api-key?api-key=cbai-new&base-url=https%3A%2F%2Fwww.codebuddy.ai%2Fv2',
      },
    ]);
  });

  test('uses the backend device-flow management endpoint for OAuth', async () => {
    const calls: Array<{ url: string; config?: unknown }> = [];
    apiClient.get = (async (url: string, config?: unknown) => {
      calls.push({ url, config });
      return {
        url: 'https://www.codebuddy.ai/authorize',
        state: 'codebuddy-ai-state',
      };
    }) as typeof apiClient.get;

    const provider: BuiltInOAuthProvider = 'codebuddy-ai';
    const response = await oauthApi.startAuth(provider);

    expect(response.state).toBe('codebuddy-ai-state');
    expect(calls).toEqual([
      {
        url: '/codebuddy-ai-auth-url',
        config: { params: undefined },
      },
    ]);
  });

  test('matches both CodeBuddy CN and international auth files for quota', () => {
    const cn = { provider: 'codebuddy-cn' } as AuthFileItem;
    const ai = { provider: 'codebuddy-ai' } as AuthFileItem;

    expect(isCodeBuddyFile(cn)).toBe(true);
    expect(isCodeBuddyFile(ai)).toBe(true);
    expect(isCodeBuddyAiFile(cn)).toBe(false);
    expect(isCodeBuddyAiFile(ai)).toBe(true);
  });
});

describe('CodeBuddy AI quota dispatch', () => {
  test('routes international auth files to the codebuddy.ai billing endpoint', async () => {
    const calls: Array<{ url: string; header?: Record<string, string> }> = [];
    apiCallApi.request = (async (options: { url: string; header?: Record<string, string> }) => {
      calls.push({ url: options.url, header: options.header });
      return {
        statusCode: 200,
        body: JSON.stringify({
          code: 0,
          data: {
            Response: {
              Data: {
                Accounts: [
                  {
                    PackageName: 'Pro',
                    CycleStartTime: 1700000000,
                    CycleEndTime: 1700000000 + 30 * 24 * 3600,
                    DeductionEndTime: 1700000000 + 365 * 24 * 3600,
                    CycleCapacitySize: '100',
                    CycleCapacityUsed: '10',
                  },
                ],
              },
            },
          },
        }),
      };
    }) as typeof apiCallApi.request;

    const t = ((key: string) => key) as unknown as TFunction;
    const result = await CODEBUDDY_CONFIG.fetchQuota(
      { name: 'ai.json', provider: 'codebuddy-ai', auth_index: 'auth-1' } as AuthFileItem,
      t
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://www.codebuddy.ai/v2/billing/meter/get-user-resource');
    expect(calls[0].header?.['X-Domain']).toBe('www.codebuddy.ai');
    expect(result.plan).toBe('Pro');
  });

  test('routes CN auth files to the copilot.tencent.com billing endpoint without X-Domain', async () => {
    const calls: Array<{ url: string; header?: Record<string, string> }> = [];
    apiCallApi.request = (async (options: { url: string; header?: Record<string, string> }) => {
      calls.push({ url: options.url, header: options.header });
      return {
        statusCode: 200,
        body: JSON.stringify({
          code: 0,
          data: {
            Response: {
              Data: {
                Accounts: [
                  {
                    PackageName: 'Pro',
                    CycleStartTime: 1700000000,
                    CycleEndTime: 1700000000 + 30 * 24 * 3600,
                    DeductionEndTime: 1700000000 + 365 * 24 * 3600,
                    CycleCapacitySize: '100',
                    CycleCapacityUsed: '10',
                  },
                ],
              },
            },
          },
        }),
      };
    }) as typeof apiCallApi.request;

    const t = ((key: string) => key) as unknown as TFunction;
    await CODEBUDDY_CONFIG.fetchQuota(
      { name: 'cn.json', provider: 'codebuddy-cn', auth_index: 'auth-2' } as AuthFileItem,
      t
    );

    expect(calls[0].url).toBe('https://copilot.tencent.com/v2/billing/meter/get-user-resource');
    expect(calls[0].header?.['X-Domain']).toBeUndefined();
  });
});
