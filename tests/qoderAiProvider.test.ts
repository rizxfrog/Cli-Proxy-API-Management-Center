import { afterEach, describe, expect, test } from 'bun:test';
import { qoderAiToResource } from '../src/features/providers/adapters';
import { PROVIDER_LOGOS } from '../src/features/providers/brandLogos';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import { AUTH_FILE_ICONS } from '../src/features/authFiles/constants';
import { isQoderAIFile, isQoderCNFile } from '../src/utils/quota';
import { QODERCN_CONFIG } from '../src/features/quota/providers/qodercn/data';
import type { AuthFileItem } from '../src/types';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
const originalDelete = apiClient.delete;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
  apiClient.delete = originalDelete;
});

const qoderFile = (provider: string): AuthFileItem => ({
  name: `${provider}-1.json`,
  type: provider,
  authIndex: `${provider}:apikey:1`,
});

describe('Qoder AI (international) provider', () => {
  test('normalizes the backend qoder-ai-api-key contract and exposes a workbench resource', () => {
    const config = normalizeConfigResponse({
      'qoder-ai-api-key': [
        {
          'api-key': 'qoder-ai-secret',
          'refresh-token': 'qoder-ai-refresh',
          'machine-id': 'machine-uuid-ai',
          priority: 3,
          prefix: 'qdai',
          'base-url': 'https://api3.qoder.sh',
          'proxy-url': 'http://proxy.local',
          headers: { 'X-Custom': 'value' },
          models: [{ name: 'qmodel_38max', alias: 'qwen-max' }],
          'excluded-models': ['gmodel'],
          'disable-cooling': true,
          'auth-index': 'qoder-ai:apikey:1',
        },
      ],
    });

    expect(config.qoderAiApiKeys).toEqual([
      {
        apiKey: 'qoder-ai-secret',
        refreshToken: 'qoder-ai-refresh',
        machineId: 'machine-uuid-ai',
        priority: 3,
        prefix: 'qdai',
        baseUrl: 'https://api3.qoder.sh',
        proxyUrl: 'http://proxy.local',
        headers: { 'X-Custom': 'value' },
        models: [{ name: 'qmodel_38max', alias: 'qwen-max' }],
        excludedModels: ['gmodel'],
        disableCooling: true,
        authIndex: 'qoder-ai:apikey:1',
      },
    ]);

    const resource = qoderAiToResource(config.qoderAiApiKeys![0], 0);
    expect(resource.brand).toBe('qoderAi');
    expect(resource.baseUrl).toBe('https://api3.qoder.sh');
    expect(resource.models).toEqual(['qmodel_38max']);
    expect(resource.selector).toEqual({
      brand: 'qoderAi',
      apiKey: 'qoder-ai-secret',
      baseUrl: 'https://api3.qoder.sh',
      index: 0,
    });
  });

  test('is registered in the workbench descriptor, logo, brand order and auth-file tables', () => {
    expect(PROVIDER_DESCRIPTORS.qoderAi).toBeDefined();
    expect(PROVIDER_DESCRIPTORS.qoderAi.supportsApiKey).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderAi.baseUrlRequired).toBe(false);
    expect(PROVIDER_DESCRIPTORS.qoderAi.supportsBaseUrl).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderAi.supportsModels).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderAi.supportsExcludedModels).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderAi.supportsWebsockets).toBe(false);
    expect(PROVIDER_LOGOS.qoderAi).toBeDefined();
    expect(PROVIDER_BRAND_ORDER).toContain('qoderAi');
    expect(AUTH_FILE_ICONS['qoder-ai']).toBeDefined();
  });

  test('writes the qoder-ai-api-key section through the management contract', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return {
        'qoder-ai-api-key': [
          { 'api-key': 'existing', 'base-url': 'https://api3.qoder.sh', 'future-field': 'kept' },
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

    await providersApi.createQoderAIConfig({
      apiKey: 'qoder-ai-new',
      baseUrl: 'https://api3.qoder.sh',
      machineId: 'machine-uuid-2',
    });
    await providersApi.deleteQoderAIConfig('qoder-ai-new', 'https://api3.qoder.sh');

    expect(calls).toEqual([
      { method: 'GET', url: '/config' },
      {
        method: 'PUT',
        url: '/qoder-ai-api-key',
        body: [
          { 'api-key': 'existing', 'base-url': 'https://api3.qoder.sh', 'future-field': 'kept' },
          {
            'api-key': 'qoder-ai-new',
            'base-url': 'https://api3.qoder.sh',
            'machine-id': 'machine-uuid-2',
          },
        ],
      },
      {
        method: 'DELETE',
        url: '/qoder-ai-api-key?api-key=qoder-ai-new&base-url=https%3A%2F%2Fapi3.qoder.sh',
      },
    ]);
  });

  test('the shared Qoder quota adapter claims both environments', () => {
    // The CN and AI credentials carry distinct providers but share one payload
    // shape, so a single adapter must classify both (and keep ignoring the rest).
    expect(isQoderCNFile(qoderFile('qoder-cn'))).toBe(true);
    expect(isQoderAIFile(qoderFile('qoder-ai'))).toBe(true);
    expect(isQoderCNFile(qoderFile('qoder-ai'))).toBe(false);
    expect(isQoderAIFile(qoderFile('qoder-cn'))).toBe(false);

    expect(QODERCN_CONFIG.filterFn(qoderFile('qoder-cn'))).toBe(true);
    expect(QODERCN_CONFIG.filterFn(qoderFile('qoder-ai'))).toBe(true);
    expect(QODERCN_CONFIG.filterFn(qoderFile('codex'))).toBe(false);
    // A disabled file is excluded regardless of environment.
    expect(QODERCN_CONFIG.filterFn({ ...qoderFile('qoder-ai'), disabled: true })).toBe(false);
  });
});
