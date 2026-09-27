/**
 * 模型管理页纯逻辑测试：目录 → 行、可用性与配置态区分、筛选、
 * 以及 override 的增量编辑语义。
 *
 * 最关键的三条不变量：
 * 1. `enabled`（配置允许）≠ 当前可用（有账号真的提供）。
 * 2. 删除自定义模型不能顺手把停用记录也删掉（除非它本就是纯自定义模型）。
 * 3. 停用按精确上游 ID 匹配，不受别名/前缀影响。
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCombinedRows,
  buildDraftFromInput,
  buildModelRow,
  buildModelRows,
  collectCustomIds,
  countModelRows,
  countOverrideEntries,
  deleteCustomModel,
  draftToInput,
  EMPTY_MODEL_DRAFT_INPUT,
  filterModelRows,
  findCustomDraft,
  hasModelDraftErrors,
  hasProviderOverride,
  hasUpstreamDefinition,
  matchesModelSearch,
  paginateRows,
  parsePositiveInteger,
  parseThinkingLevels,
  resolveAvailability,
  setModelEnabled,
  totalRowPages,
  upsertCustomModel,
  validateModelDraft,
} from '@/features/models/logic';
import type {
  ProviderCatalog,
  ProviderModelDraft,
  ProviderModelEntry,
  ProviderModelSource,
} from '@/services/api/providerModels';

const entry = (
  overrides: Partial<ProviderModelEntry> & { id: string }
): ProviderModelEntry => ({
  displayName: '',
  source: 'default' as ProviderModelSource,
  enabled: true,
  registeredAccountCount: 1,
  inactiveReasons: [],
  definition: null,
  ...overrides,
});

const catalog = (overrides: Partial<ProviderCatalog> & { provider: string }): ProviderCatalog => ({
  override: { disabled: [], custom: [] },
  models: [],
  readOnly: false,
  runtimeStatus: 'unverified',
  catalogScope: 'local',
  ...overrides,
});

describe('configuration state vs runtime availability', () => {
  test('enabled with no account is NOT reported as available', () => {
    const row = buildModelRow(
      entry({ id: 'glm-5.4', enabled: true, registeredAccountCount: 0, inactiveReasons: ['not-registered'] }),
      'trae',
      false
    );
    // 配置允许，但当前没有账号提供它 —— 必须区分开。
    expect(row.enabled).toBe(true);
    expect(row.availability).toBe('no-account');
  });

  test('disabled wins over account count', () => {
    const row = buildModelRow(
      entry({ id: 'glm-5.2', enabled: false, registeredAccountCount: 3, inactiveReasons: ['provider-disabled'] }),
      'trae',
      false
    );
    expect(row.availability).toBe('disabled');
  });

  test('null account count means Home-managed, not zero', () => {
    const row = buildModelRow(
      entry({ id: 'x', registeredAccountCount: null, inactiveReasons: ['home-managed'] }),
      'trae',
      true
    );
    expect(row.availability).toBe('home-managed');
    expect(row.readOnly).toBe(true);
  });

  test('availability still resolves when the reason list is missing', () => {
    expect(resolveAvailability(entry({ id: 'a', registeredAccountCount: 2 }))).toBe('available');
    expect(resolveAvailability(entry({ id: 'a', registeredAccountCount: 0 }))).toBe('no-account');
    expect(resolveAvailability(entry({ id: 'a', enabled: false, registeredAccountCount: 1 }))).toBe(
      'disabled'
    );
  });

  test('only default/configured/runtime/override can be restored to a built-in', () => {
    expect(hasUpstreamDefinition('default')).toBe(true);
    expect(hasUpstreamDefinition('override')).toBe(true);
    expect(hasUpstreamDefinition('runtime')).toBe(true);
    expect(hasUpstreamDefinition('custom')).toBe(false);
    expect(hasUpstreamDefinition('unavailable')).toBe(false);
  });
});

describe('row building and counting', () => {
  test('falls back to the model id when no display name exists', () => {
    const row = buildModelRow(entry({ id: 'glm-5.4' }), 'trae', false);
    expect(row.displayName).toBe('glm-5.4');
  });

  test('carries provider and readOnly so rows can be written back correctly', () => {
    const rows = buildModelRows(
      catalog({
        provider: 'codebuddy-cn',
        readOnly: true,
        models: [entry({ id: 'm1' }), entry({ id: 'm2', enabled: false })],
      })
    );
    expect(rows.map((row) => row.provider)).toEqual(['codebuddy-cn', 'codebuddy-cn']);
    expect(rows.every((row) => row.readOnly)).toBe(true);
    expect(countModelRows(rows)).toEqual({ total: 2, enabled: 1, disabled: 1 });
  });

  test('combines providers without merging same-named models', () => {
    const rows = buildCombinedRows([
      catalog({ provider: 'trae', models: [entry({ id: 'glm-5.2' })] }),
      catalog({ provider: 'qoder-cn', models: [entry({ id: 'glm-5.2' })] }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.provider)).toEqual(['trae', 'qoder-cn']);
  });

  test('counts saved override entries across providers', () => {
    const total = countOverrideEntries([
      catalog({ provider: 'a', override: { disabled: ['x'], custom: [{ id: 'y', displayName: '' }] } }),
      catalog({ provider: 'b', override: { disabled: [], custom: [] } }),
    ]);
    expect(total).toBe(2);
    expect(hasProviderOverride({ disabled: [], custom: [] })).toBe(false);
  });
});

describe('filtering', () => {
  const rows = buildModelRows(
    catalog({
      provider: 'trae',
      models: [
        entry({ id: 'glm-5.2', displayName: 'GLM 5.2', enabled: false, source: 'default' }),
        entry({ id: 'glm-5.4', displayName: 'GLM 5.4', enabled: true, source: 'custom' }),
      ],
    })
  );

  test('status and source filters are independent', () => {
    expect(filterModelRows(rows, { search: '', status: 'enabled', source: 'all' })).toHaveLength(1);
    expect(filterModelRows(rows, { search: '', status: 'disabled', source: 'all' })).toHaveLength(1);
    expect(filterModelRows(rows, { search: '', status: 'all', source: 'custom' })[0].id).toBe('glm-5.4');
    expect(filterModelRows(rows, { search: '', status: 'all', source: 'default' })[0].id).toBe('glm-5.2');
  });

  test('searches id, display name, and provider, with * support', () => {
    expect(filterModelRows(rows, { search: '5.4', status: 'all', source: 'all' })[0].id).toBe('glm-5.4');
    expect(filterModelRows(rows, { search: 'GLM*', status: 'all', source: 'all' })).toHaveLength(2);
    expect(filterModelRows(rows, { search: 'trae', status: 'all', source: 'all' })).toHaveLength(2);
    expect(filterModelRows(rows, { search: 'nope', status: 'all', source: 'all' })).toHaveLength(0);
    expect(matchesModelSearch(rows[0], null)).toBe(true);
  });

  test('treats regex metacharacters as literals', () => {
    const dotted = buildModelRows(catalog({ provider: 'p', models: [entry({ id: 'a.b' })] }));
    expect(filterModelRows(dotted, { search: 'a.b', status: 'all', source: 'all' })).toHaveLength(1);
    expect(filterModelRows(dotted, { search: 'axb', status: 'all', source: 'all' })).toHaveLength(0);
  });

  test('paginates deterministically', () => {
    const many = buildModelRows(
      catalog({ provider: 'p', models: Array.from({ length: 25 }, (_, i) => entry({ id: `m${i}` })) })
    );
    expect(totalRowPages(many.length, 20)).toBe(2);
    expect(paginateRows(many, 1, 20)).toHaveLength(20);
    expect(paginateRows(many, 99, 20)).toHaveLength(5);
    expect(paginateRows(many, 0, 20)).toHaveLength(20);
  });
});

describe('override editing semantics', () => {
  test('disabling keeps a sorted, de-duplicated disable list', () => {
    let override = { disabled: [] as string[], custom: [] as ProviderModelDraft[] };
    override = setModelEnabled(override, 'b', false);
    override = setModelEnabled(override, 'a', false);
    override = setModelEnabled(override, 'b', false);
    expect(override.disabled).toEqual(['a', 'b']);

    override = setModelEnabled(override, 'b', true);
    expect(override.disabled).toEqual(['a']);
  });

  test('upsert renames without leaving the old id behind', () => {
    const override = upsertCustomModel({ disabled: [], custom: [] }, { id: 'old', displayName: '' });
    const renamed = upsertCustomModel(override, { id: 'new', displayName: 'N' }, 'old');
    expect(renamed.custom.map((draft) => draft.id)).toEqual(['new']);
    expect(collectCustomIds(renamed)).toEqual(['new']);
  });

  test('removing a custom definition of a built-in model keeps the disable rule', () => {
    // 这就是“上游目录更新后模型别自己回来”的关键：停用记录独立保留。
    const override = {
      disabled: ['glm-5.2'],
      custom: [{ id: 'glm-5.2', displayName: 'GLM 5.2' }],
    };
    const next = deleteCustomModel(override, 'glm-5.2', { hasUpstreamDefinition: true });
    expect(next.custom).toEqual([]);
    expect(next.disabled).toEqual(['glm-5.2']);
  });

  test('removing a purely custom model also drops its disable record', () => {
    // 否则会残留一个上游已不存在的 unavailable 行。
    const override = { disabled: ['ghost'], custom: [{ id: 'ghost', displayName: '' }] };
    const next = deleteCustomModel(override, 'ghost', { hasUpstreamDefinition: false });
    expect(next.custom).toEqual([]);
    expect(next.disabled).toEqual([]);
  });

  test('finds a saved draft only for its own id', () => {
    const override = { disabled: [], custom: [{ id: 'a', displayName: 'A' }] };
    expect(findCustomDraft(override, 'a')?.displayName).toBe('A');
    expect(findCustomDraft(override, 'b')).toBeNull();
  });
});

describe('draft validation and serialization', () => {
  const base = { customIds: ['taken'] };

  test('requires a valid, non-duplicate id', () => {
    expect(validateModelDraft({ ...EMPTY_MODEL_DRAFT_INPUT, id: '' }, base).id).toBe('required');
    expect(validateModelDraft({ ...EMPTY_MODEL_DRAFT_INPUT, id: 'a b' }, base).id).toBe('invalid');
    expect(validateModelDraft({ ...EMPTY_MODEL_DRAFT_INPUT, id: 'taken' }, base).id).toBe('duplicate');
    // 编辑自身时不应把自己判为重复。
    expect(
      validateModelDraft({ ...EMPTY_MODEL_DRAFT_INPUT, id: 'taken' }, { customIds: ['taken'], originalId: 'taken' })
    ).toEqual({});
  });

  test('rejects non-positive or non-integer numbers', () => {
    expect(parsePositiveInteger('')).toBeUndefined();
    expect(parsePositiveInteger('0')).toBe('number');
    expect(parsePositiveInteger('-1')).toBe('number');
    expect(parsePositiveInteger('1.5')).toBe('number');
    expect(parsePositiveInteger('200000')).toBe(200000);

    const errors = validateModelDraft(
      { ...EMPTY_MODEL_DRAFT_INPUT, id: 'ok', contextLength: '0', maxCompletionTokens: 'abc' },
      base
    );
    expect(errors.contextLength).toBe('number');
    expect(errors.maxCompletionTokens).toBe('number');
    expect(hasModelDraftErrors(errors)).toBe(true);
    expect(hasModelDraftErrors({})).toBe(false);
  });

  test('rejects a thinking range whose max is below its min', () => {
    const errors = validateModelDraft(
      { ...EMPTY_MODEL_DRAFT_INPUT, id: 'ok', thinkingMin: '100', thinkingMax: '10' },
      base
    );
    expect(errors.thinking).toBe('range');
  });

  test('builds a draft that omits blank optionals', () => {
    const draft = buildDraftFromInput({ ...EMPTY_MODEL_DRAFT_INPUT, id: ' glm-5.4 ', displayName: ' GLM 5.4 ' });
    expect(draft).toEqual({ id: 'glm-5.4', displayName: 'GLM 5.4' });
    expect('contextLength' in draft).toBe(false);
    expect('thinking' in draft).toBe(false);
  });

  test('builds advanced capabilities when provided', () => {
    const draft = buildDraftFromInput({
      ...EMPTY_MODEL_DRAFT_INPUT,
      id: 'm',
      contextLength: '200000',
      maxCompletionTokens: '8192',
      thinkingMin: '0',
      thinkingMax: '32768',
      thinkingLevels: 'low, high',
      thinkingDynamicAllowed: true,
    });
    expect(draft.contextLength).toBe(200000);
    expect(draft.maxCompletionTokens).toBe(8192);
    expect(draft.thinking).toEqual({
      min: 0,
      max: 32768,
      levels: ['low', 'high'],
      dynamicAllowed: true,
    });
  });

  test('splits levels on commas and whitespace, including full-width commas', () => {
    expect(parseThinkingLevels('low, medium，high  ')).toEqual(['low', 'medium', 'high']);
    expect(parseThinkingLevels('')).toEqual([]);
  });

  test('round-trips a draft through the form input', () => {
    const input = draftToInput({
      id: 'm',
      displayName: 'M',
      contextLength: 200000,
      thinking: { min: 0, max: 100, zeroAllowed: true, levels: ['low'] },
    });
    expect(input.id).toBe('m');
    expect(input.contextLength).toBe('200000');
    expect(input.thinkingMin).toBe('0');
    expect(input.thinkingMax).toBe('100');
    expect(input.thinkingLevels).toBe('low');
    expect(input.thinkingZeroAllowed).toBe(true);
    expect(input.thinkingDynamicAllowed).toBe(false);
    expect(buildDraftFromInput(input)).toEqual({
      id: 'm',
      displayName: 'M',
      contextLength: 200000,
      thinking: { min: 0, max: 100, zeroAllowed: true, levels: ['low'] },
    });
  });
});
