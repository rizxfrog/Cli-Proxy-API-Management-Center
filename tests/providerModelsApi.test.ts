/**
 * `provider-models` API 规范化契约测试。
 *
 * 后端字段名是 snake_case / 连字符（display-name、registered_account_count、
 * runtime_status、read_only…）。这些测试固定“读”的归一化和“写”的序列化，
 * 任何字段漂移都会在测试里现形，而不是静默丢数据。
 */

import { describe, expect, test } from 'bun:test';
import {
  isHomeManagedError,
  isValidModelId,
  isValidProviderId,
  normalizeProviderCatalog,
  normalizeProviderCatalogs,
  normalizeProviderModelDraft,
  normalizeProviderModelEntry,
  normalizeProviderModelSource,
  serializeProviderModelDraft,
  serializeProviderModelsOverride,
} from '@/services/api/providerModels';

describe('catalog read normalization', () => {
  test('maps backend snake_case fields in one place', () => {
    const catalog = normalizeProviderCatalog({
      provider: 'TRAE',
      override: {
        disabled: ['glm-5.2'],
        custom: [{ id: 'glm-5.4', 'display-name': 'GLM 5.4', 'context-length': 200000 }],
      },
      models: [
        {
          id: 'glm-5.2',
          display_name: 'GLM 5.2',
          source: 'default',
          enabled: false,
          registered_account_count: 0,
          inactive_reasons: ['provider-disabled'],
          definition: { id: 'glm-5.2', context_length: 128000 },
        },
      ],
      read_only: false,
      runtime_status: 'unverified',
      catalog_scope: 'local',
    });

    expect(catalog).not.toBeNull();
    expect(catalog?.provider).toBe('trae');
    expect(catalog?.readOnly).toBe(false);
    expect(catalog?.runtimeStatus).toBe('unverified');
    expect(catalog?.override.disabled).toEqual(['glm-5.2']);
    expect(catalog?.override.custom[0]).toEqual({
      id: 'glm-5.4',
      displayName: 'GLM 5.4',
      contextLength: 200000,
    });

    const entry = catalog?.models[0];
    expect(entry?.displayName).toBe('GLM 5.2');
    expect(entry?.enabled).toBe(false);
    expect(entry?.registeredAccountCount).toBe(0);
    expect(entry?.inactiveReasons).toEqual(['provider-disabled']);
    expect(entry?.definition?.contextLength).toBe(128000);
  });

  test('preserves an explicit null account count instead of faking zero', () => {
    const entry = normalizeProviderModelEntry({
      id: 'x',
      enabled: true,
      registered_account_count: null,
      inactive_reasons: ['home-managed'],
    });
    // null 代表“后端不提供该计数”（Home 模式），不能折算成 0。
    expect(entry?.registeredAccountCount).toBeNull();
  });

  test('marks Home catalogs read-only with local-preview scope', () => {
    const catalog = normalizeProviderCatalog({
      provider: 'trae',
      models: [],
      read_only: true,
      runtime_status: 'home-managed',
      catalog_scope: 'local-preview',
    });
    expect(catalog?.readOnly).toBe(true);
    expect(catalog?.runtimeStatus).toBe('home-managed');
    expect(catalog?.catalogScope).toBe('local-preview');
  });

  test('accepts both the envelope and a bare array, dropping unknown noise', () => {
    expect(normalizeProviderCatalogs({ providers: [{ provider: 'a' }, { provider: '' }] })).toHaveLength(1);
    expect(normalizeProviderCatalogs([{ provider: 'b' }])).toHaveLength(1);
    expect(normalizeProviderCatalogs(null)).toEqual([]);
    expect(normalizeProviderCatalogs({ nope: 1 })).toEqual([]);
  });

  test('tolerates camelCase drift in optional payloads', () => {
    const draft = normalizeProviderModelDraft({ id: 'm', displayName: 'M', maxCompletionTokens: 4096 });
    expect(draft).toEqual({ id: 'm', displayName: 'M', maxCompletionTokens: 4096 });
  });

  test('normalizes unknown sources to the built-in default', () => {
    expect(normalizeProviderModelSource('nonsense')).toBe('default');
    expect(normalizeProviderModelSource('RUNTIME')).toBe('runtime');
  });
});

describe('override write serialization', () => {
  test('emits hyphenated keys and omits empty optionals', () => {
    expect(serializeProviderModelDraft({ id: 'glm-5.4', displayName: '' })).toEqual({
      id: 'glm-5.4',
      'display-name': undefined,
      'context-length': undefined,
      'max-completion-tokens': undefined,
    });

    const full = serializeProviderModelDraft({
      id: 'm',
      displayName: 'M',
      contextLength: 200000,
      maxCompletionTokens: 8192,
    });
    expect(full['display-name']).toBe('M');
    expect(full['context-length']).toBe(200000);
    expect(full['max-completion-tokens']).toBe(8192);
    expect(full.thinking).toBeUndefined();
  });

  test('serializes thinking with backend field names only when set', () => {
    const payload = serializeProviderModelDraft({
      id: 'm',
      displayName: '',
      thinking: { min: 0, max: 32768, zeroAllowed: true, levels: ['low', 'high'] },
    });
    expect(payload.thinking).toEqual({
      min: 0,
      max: 32768,
      zero_allowed: true,
      dynamic_allowed: undefined,
      levels: ['low', 'high'],
    });
  });

  test('round-trips an override without inventing entries', () => {
    const override = { disabled: ['a'], custom: [{ id: 'b', displayName: 'B' }] };
    const payload = serializeProviderModelsOverride(override);
    expect(payload.disabled).toEqual(['a']);
    expect((payload.custom as Array<Record<string, unknown>>)[0].id).toBe('b');
    // 增量语义：不得把整份目录快照塞进 body。
    expect(Object.keys(payload)).toEqual(['disabled', 'custom']);
  });
});

describe('client-side validation mirrors the backend', () => {
  test('rejects ids the backend rejects', () => {
    expect(isValidModelId('glm-5.4')).toBe(true);
    expect(isValidModelId('claude-opus-4.8')).toBe(true);
    expect(isValidModelId('')).toBe(false);
    expect(isValidModelId('has space')).toBe(false);
    expect(isValidModelId('wild*card')).toBe(false);
    expect(isValidModelId('paren(thesis)')).toBe(false);
    expect(isValidModelId('bad\nnewline')).toBe(false);
  });

  test('provider ids additionally forbid slashes', () => {
    expect(isValidProviderId('trae')).toBe(true);
    expect(isValidProviderId('a/b')).toBe(false);
  });

  test('recognizes the Home-managed rejection', () => {
    expect(isHomeManagedError({ apiCode: 'provider_models_home_managed' })).toBe(true);
    expect(isHomeManagedError({ status: 409 })).toBe(true);
    expect(isHomeManagedError({ status: 400 })).toBe(false);
    expect(isHomeManagedError(null)).toBe(false);
  });
});
