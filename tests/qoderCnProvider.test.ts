import { afterEach, describe, expect, test } from 'bun:test';
import { qoderCnToResource } from '../src/features/providers/adapters';
import { PROVIDER_LOGOS } from '../src/features/providers/brandLogos';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import { AUTH_FILE_ICONS } from '../src/features/authFiles/constants';

const originalGet = apiClient.get;
const originalPut = apiClient.put;
const originalDelete = apiClient.delete;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
  apiClient.delete = originalDelete;
});

describe('Qoder CN provider', () => {
  test('normalizes the backend qoder-cn-api-key contract and exposes a workbench resource', () => {
    const config = normalizeConfigResponse({
      'qoder-cn-api-key': [
        {
          'api-key': 'qoder-secret',
          'refresh-token': 'qoder-refresh',
          'machine-id': 'machine-uuid-1',
          priority: 5,
          prefix: 'qd',
          'base-url': 'https://api2-v2.qoder.sh',
          'proxy-url': 'http://proxy.local',
          headers: { 'X-Custom': 'value' },
          models: [{ name: 'claude-opus-4-6', alias: 'opus' }],
          'excluded-models': ['claude-3-5-sonnet'],
          'disable-cooling': true,
          'auth-index': 'qoder-cn:apikey:1',
        },
      ],
    });

    expect(config.qoderCnApiKeys).toEqual([
      {
        apiKey: 'qoder-secret',
        refreshToken: 'qoder-refresh',
        machineId: 'machine-uuid-1',
        priority: 5,
        prefix: 'qd',
        baseUrl: 'https://api2-v2.qoder.sh',
        proxyUrl: 'http://proxy.local',
        headers: { 'X-Custom': 'value' },
        models: [{ name: 'claude-opus-4-6', alias: 'opus' }],
        excludedModels: ['claude-3-5-sonnet'],
        disableCooling: true,
        authIndex: 'qoder-cn:apikey:1',
      },
    ]);

    const resource = qoderCnToResource(config.qoderCnApiKeys![0], 0);
    expect(resource.brand).toBe('qoderCn');
    expect(resource.baseUrl).toBe('https://api2-v2.qoder.sh');
    expect(resource.models).toEqual(['claude-opus-4-6']);
    expect(resource.selector).toEqual({
      brand: 'qoderCn',
      apiKey: 'qoder-secret',
      baseUrl: 'https://api2-v2.qoder.sh',
      index: 0,
    });
  });

  test('is registered in the workbench descriptor, logo, brand order and auth-file tables', () => {
    expect(PROVIDER_DESCRIPTORS.qoderCn).toBeDefined();
    expect(PROVIDER_DESCRIPTORS.qoderCn.supportsApiKey).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderCn.baseUrlRequired).toBe(false);
    expect(PROVIDER_DESCRIPTORS.qoderCn.supportsBaseUrl).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderCn.supportsModels).toBe(true);
    expect(PROVIDER_DESCRIPTORS.qoderCn.supportsExcludedModels).toBe(true);
    // Qoder's model server does not expose a websocket transport.
    expect(PROVIDER_DESCRIPTORS.qoderCn.supportsWebsockets).toBe(false);
    expect(PROVIDER_LOGOS.qoderCn).toBeDefined();
    expect(PROVIDER_BRAND_ORDER).toContain('qoderCn');
    expect(AUTH_FILE_ICONS['qoder-cn']).toBeDefined();
  });

  test('creates and deletes Qoder CN keys through the backend management contract', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return {
        'qoder-cn-api-key': [
          {
            'api-key': 'existing',
            'base-url': 'https://api2-v2.qoder.sh',
            'machine-id': 'existing-machine',
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

    await providersApi.createQoderCNConfig({
      apiKey: 'qoder-new',
      baseUrl: 'https://api2-v2.qoder.sh',
      machineId: 'machine-uuid-2',
    });
    await providersApi.deleteQoderCNConfig('qoder-new', 'https://api2-v2.qoder.sh');

    expect(calls).toEqual([
      { method: 'GET', url: '/config' },
      {
        method: 'PUT',
        url: '/qoder-cn-api-key',
        body: [
          {
            'api-key': 'existing',
            'base-url': 'https://api2-v2.qoder.sh',
            'machine-id': 'existing-machine',
            'future-field': 'preserved',
          },
          {
            'api-key': 'qoder-new',
            'base-url': 'https://api2-v2.qoder.sh',
            'machine-id': 'machine-uuid-2',
          },
        ],
      },
      {
        method: 'DELETE',
        url: '/qoder-cn-api-key?api-key=qoder-new&base-url=https%3A%2F%2Fapi2-v2.qoder.sh',
      },
    ]);
  });

  test('preserves unknown backend fields when updating a key', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    apiClient.get = (async (url: string) => {
      calls.push({ method: 'GET', url });
      return {
        'qoder-cn-api-key': [
          {
            'api-key': 'existing',
            'base-url': 'https://api2-v2.qoder.sh',
            'future-field': 'preserved',
          },
        ],
      };
    }) as typeof apiClient.get;
    apiClient.put = (async (url: string, data?: unknown) => {
      calls.push({ method: 'PUT', url, body: data });
      return undefined;
    }) as typeof apiClient.put;

    await providersApi.updateQoderCNConfig('existing', 'https://api2-v2.qoder.sh', {
      apiKey: 'existing',
      baseUrl: 'https://api2-v2.qoder.sh',
      machineId: 'rotated-machine',
    });

    const put = calls.find((call) => call.method === 'PUT');
    expect(put).toBeDefined();
    const body = put!.body as Array<Record<string, unknown>>;
    expect(body[0]['future-field']).toBe('preserved');
    expect(body[0]['machine-id']).toBe('rotated-machine');
  });
});
