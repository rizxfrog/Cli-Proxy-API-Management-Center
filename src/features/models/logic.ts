/**
 * 模型管理页的纯逻辑：目录 → 视图行、筛选、以及 override 的增量编辑。
 *
 * 与后端的语义约定（见 internal/config/provider_models.go）：
 * - `disabled` 是**独立保留**的停用清单，删除自定义模型时不清空它，
 *   这样上游默认目录更新后不会把用户停用的模型悄悄放回来。
 * - `custom` 是增量覆盖，不是整份目录快照。
 * - `source === 'custom'` 表示上游没有该模型（纯用户新增）；
 *   `'override'` 表示用户定义覆盖了已有条目，删除定义即“恢复默认”。
 */

import type {
  ProviderCatalog,
  ProviderModelDefinition,
  ProviderModelDraft,
  ProviderModelEntry,
  ProviderModelSource,
  ProviderModelThinking,
  ProviderModelsOverride,
} from '@/services/api/providerModels';
import { isValidModelId } from '@/services/api/providerModels';

export type ModelStatusFilter = 'all' | 'enabled' | 'disabled';
export type ModelSourceFilter = 'all' | ProviderModelSource;

/** 配置状态与运行可用性是两件事，这里显式区分。 */
export type ModelAvailability =
  | 'disabled'
  | 'available'
  | 'no-account'
  | 'home-managed'
  | 'unknown';

export interface ModelFilters {
  search: string;
  status: ModelStatusFilter;
  source: ModelSourceFilter;
}

export interface ProviderModelRow {
  id: string;
  /** 所属 provider；「全部」标签页的跨 provider 视图靠它回写正确的覆盖。 */
  provider: string;
  /** 该 provider 由 Home 托管：本地覆盖不可执行。 */
  readOnly: boolean;
  displayName: string;
  source: ProviderModelSource;
  enabled: boolean;
  availability: ModelAvailability;
  accountCount: number | null;
  inactiveReasons: string[];
  definition: ProviderModelDefinition | null;
  /** 该模型有用户自定义定义（custom 或 override）。 */
  hasCustomDefinition: boolean;
  /** 上游/项目仍提供该条目，删除自定义定义后可以回到默认。 */
  hasUpstreamDefinition: boolean;
  contextLength?: number;
  maxCompletionTokens?: number;
  thinking?: ProviderModelThinking;
}

export interface ProviderModelCounts {
  total: number;
  enabled: number;
  disabled: number;
}

export const MODEL_SOURCE_LABEL_KEYS: Record<ProviderModelSource, string> = {
  default: 'model_management.source_default',
  configured: 'model_management.source_configured',
  runtime: 'model_management.source_runtime',
  custom: 'model_management.source_custom',
  override: 'model_management.source_override',
  unavailable: 'model_management.source_unavailable',
};

export const modelSourceLabelKey = (source: ProviderModelSource): string =>
  MODEL_SOURCE_LABEL_KEYS[source] ?? MODEL_SOURCE_LABEL_KEYS.default;

/** `unavailable` 的上游条目已消失；`override` 是用户定义盖过默认。 */
export const hasUpstreamDefinition = (source: ProviderModelSource): boolean =>
  source === 'default' ||
  source === 'configured' ||
  source === 'runtime' ||
  source === 'override';

export const resolveAvailability = (entry: ProviderModelEntry): ModelAvailability => {
  if (entry.inactiveReasons.includes('home-managed') || entry.registeredAccountCount === null) {
    return 'home-managed';
  }
  // 配置停用优先于“没有账号”：它表达的是用户的明确决定。
  if (!entry.enabled || entry.inactiveReasons.includes('provider-disabled')) {
    return 'disabled';
  }
  if (entry.registeredAccountCount <= 0 || entry.inactiveReasons.includes('not-registered')) {
    return 'no-account';
  }
  if (entry.registeredAccountCount > 0) return 'available';
  return 'unknown';
};

export const buildModelRow = (
  entry: ProviderModelEntry,
  provider: string,
  readOnly: boolean
): ProviderModelRow => {
  const hasCustomDefinition = entry.source === 'custom' || entry.source === 'override';
  const definition = entry.definition;
  const row: ProviderModelRow = {
    id: entry.id,
    provider,
    readOnly,
    displayName: entry.displayName || entry.id,
    source: entry.source,
    enabled: entry.enabled,
    availability: resolveAvailability(entry),
    accountCount: entry.registeredAccountCount,
    inactiveReasons: entry.inactiveReasons,
    definition,
    hasCustomDefinition,
    hasUpstreamDefinition: hasUpstreamDefinition(entry.source),
  };

  const contextLength = definition?.contextLength;
  const maxCompletionTokens = definition?.maxCompletionTokens;
  if (contextLength !== undefined) row.contextLength = contextLength;
  if (maxCompletionTokens !== undefined) row.maxCompletionTokens = maxCompletionTokens;
  if (definition?.thinking) row.thinking = definition.thinking;

  return row;
};

export const buildModelRows = (catalog: ProviderCatalog | null): ProviderModelRow[] =>
  catalog
    ? catalog.models.map((entry) => buildModelRow(entry, catalog.provider, catalog.readOnly))
    : [];

/** 「全部」视图：各 provider 行拼接。行上带 provider，回写时不会串台。 */
export const buildCombinedRows = (catalogs: ProviderCatalog[]): ProviderModelRow[] =>
  catalogs.flatMap(buildModelRows);

export const countModelRows = (rows: ProviderModelRow[]): ProviderModelCounts => {
  let enabled = 0;
  for (const row of rows) {
    if (row.enabled) enabled += 1;
  }
  return { total: rows.length, enabled, disabled: rows.length - enabled };
};

const escapeSearchSegment = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 支持 `*` 通配（与认证文件页同一套输入习惯）。 */
export const buildModelSearchPattern = (query: string): RegExp | null => {
  const value = query.trim();
  if (!value) return null;
  if (!value.includes('*')) {
    return new RegExp(escapeSearchSegment(value), 'i');
  }
  return new RegExp(value.split('*').map(escapeSearchSegment).join('.*'), 'i');
};

export const matchesModelSearch = (row: ProviderModelRow, pattern: RegExp | null): boolean => {
  if (!pattern) return true;
  if (pattern.test(row.id)) return true;
  if (row.provider && pattern.test(row.provider)) return true;
  if (row.displayName && pattern.test(row.displayName)) return true;
  return false;
};

export const filterModelRows = (
  rows: ProviderModelRow[],
  filters: ModelFilters
): ProviderModelRow[] => {
  const pattern = buildModelSearchPattern(filters.search);
  return rows.filter((row) => {
    if (filters.status === 'enabled' && !row.enabled) return false;
    if (filters.status === 'disabled' && row.enabled) return false;
    if (filters.source !== 'all' && row.source !== filters.source) return false;
    return matchesModelSearch(row, pattern);
  });
};

/* ------------------------------------------------------------------ override 编辑 */

export const hasProviderOverride = (override: ProviderModelsOverride): boolean =>
  override.disabled.length > 0 || override.custom.length > 0;

export const findCustomDraft = (
  override: ProviderModelsOverride,
  id: string
): ProviderModelDraft | null => override.custom.find((draft) => draft.id === id) ?? null;

export const setModelEnabled = (
  override: ProviderModelsOverride,
  id: string,
  enabled: boolean
): ProviderModelsOverride => {
  const disabled = override.disabled.filter((entry) => entry !== id);
  if (!enabled) disabled.push(id);
  disabled.sort((a, b) => a.localeCompare(b));
  return { disabled, custom: [...override.custom] };
};

export const upsertCustomModel = (
  override: ProviderModelsOverride,
  draft: ProviderModelDraft,
  originalId?: string
): ProviderModelsOverride => {
  const dropId = originalId ?? draft.id;
  const custom = override.custom.filter((entry) => entry.id !== dropId);
  custom.push(draft);
  custom.sort((a, b) => a.id.localeCompare(b.id));
  return { disabled: [...override.disabled], custom };
};

/**
 * 删除用户定义。
 * - `hasUpstreamDefinition`：只删定义，模型回到默认（源为 override/default 等），
 *   停用状态保留，避免“删掉自定义定义”被误解为“重新启用”。
 * - 纯自定义模型：连同停用记录一起移除，否则会残留一个 unavailable 行。
 */
export const deleteCustomModel = (
  override: ProviderModelsOverride,
  id: string,
  options: { hasUpstreamDefinition: boolean }
): ProviderModelsOverride => {
  const custom = override.custom.filter((entry) => entry.id !== id);
  const disabled = options.hasUpstreamDefinition
    ? [...override.disabled]
    : override.disabled.filter((entry) => entry !== id);
  return { disabled, custom };
};

/* ------------------------------------------------------------------ 草稿校验 */

export type ModelDraftError = 'required' | 'invalid' | 'duplicate' | 'number';

export interface ModelDraftValidation {
  id?: ModelDraftError;
  contextLength?: ModelDraftError;
  maxCompletionTokens?: ModelDraftError;
  thinking?: 'range';
}

export interface ModelDraftInput {
  id: string;
  displayName: string;
  contextLength: string;
  maxCompletionTokens: string;
  thinkingMin: string;
  thinkingMax: string;
  thinkingLevels: string;
  thinkingZeroAllowed: boolean;
  thinkingDynamicAllowed: boolean;
}

export const EMPTY_MODEL_DRAFT_INPUT: ModelDraftInput = {
  id: '',
  displayName: '',
  contextLength: '',
  maxCompletionTokens: '',
  thinkingMin: '',
  thinkingMax: '',
  thinkingLevels: '',
  thinkingZeroAllowed: false,
  thinkingDynamicAllowed: false,
};

/** 空字符串 → undefined（= 不覆盖）；非数字或非正数 → 'number'。 */
export const parsePositiveInteger = (raw: string): number | undefined | 'number' => {
  const value = raw.trim();
  if (!value) return undefined;
  if (!/^[+-]?\d+$/.test(value)) return 'number';
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 'number';
  return parsed;
};

/** thinking 的 min/max 允许 0（后端只要求 >= 0）。 */
export const parseNonNegativeInteger = (raw: string): number | undefined | 'number' => {
  const value = raw.trim();
  if (!value) return undefined;
  if (!/^[+-]?\d+$/.test(value)) return 'number';
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 'number';
  return parsed;
};

export const parseThinkingLevels = (raw: string): string[] =>
  raw
    .split(/[,，\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const validateModelDraft = (
  input: ModelDraftInput,
  options: { customIds: string[]; originalId?: string }
): ModelDraftValidation => {
  const errors: ModelDraftValidation = {};
  const id = input.id.trim();

  if (!id) {
    errors.id = 'required';
  } else if (!isValidModelId(id)) {
    errors.id = 'invalid';
  } else {
    const duplicate = options.customIds.some(
      (existing) => existing === id && existing !== options.originalId
    );
    if (duplicate) errors.id = 'duplicate';
  }

  if (parsePositiveInteger(input.contextLength) === 'number') {
    errors.contextLength = 'number';
  }
  if (parsePositiveInteger(input.maxCompletionTokens) === 'number') {
    errors.maxCompletionTokens = 'number';
  }

  const min = parseNonNegativeInteger(input.thinkingMin);
  const max = parseNonNegativeInteger(input.thinkingMax);
  if (min === 'number' || max === 'number') {
    errors.thinking = 'range';
  } else if (min !== undefined && max !== undefined && max < min) {
    errors.thinking = 'range';
  }

  return errors;
};

export const hasModelDraftErrors = (errors: ModelDraftValidation): boolean =>
  Object.keys(errors).length > 0;

/** 输入 → 写入体。空的可选字段一律省略，避免把默认值写进覆盖。 */
export const buildDraftFromInput = (input: ModelDraftInput): ProviderModelDraft => {
  const draft: ProviderModelDraft = {
    id: input.id.trim(),
    displayName: input.displayName.trim(),
  };

  const contextLength = parsePositiveInteger(input.contextLength);
  if (typeof contextLength === 'number') draft.contextLength = contextLength;
  const maxCompletionTokens = parsePositiveInteger(input.maxCompletionTokens);
  if (typeof maxCompletionTokens === 'number') {
    draft.maxCompletionTokens = maxCompletionTokens;
  }

  const thinking: ProviderModelThinking = {};
  const min = parseNonNegativeInteger(input.thinkingMin);
  if (typeof min === 'number') thinking.min = min;
  const max = parseNonNegativeInteger(input.thinkingMax);
  if (typeof max === 'number') thinking.max = max;
  const levels = parseThinkingLevels(input.thinkingLevels);
  if (levels.length > 0) thinking.levels = levels;
  if (input.thinkingZeroAllowed) thinking.zeroAllowed = true;
  if (input.thinkingDynamicAllowed) thinking.dynamicAllowed = true;
  if (Object.keys(thinking).length > 0) draft.thinking = thinking;

  return draft;
};

export const draftToInput = (draft: ProviderModelDraft): ModelDraftInput => ({
  id: draft.id,
  displayName: draft.displayName ?? '',
  contextLength: draft.contextLength === undefined ? '' : String(draft.contextLength),
  maxCompletionTokens:
    draft.maxCompletionTokens === undefined ? '' : String(draft.maxCompletionTokens),
  thinkingMin: draft.thinking?.min === undefined ? '' : String(draft.thinking.min),
  thinkingMax: draft.thinking?.max === undefined ? '' : String(draft.thinking.max),
  thinkingLevels: (draft.thinking?.levels ?? []).join(', '),
  thinkingZeroAllowed: draft.thinking?.zeroAllowed === true,
  thinkingDynamicAllowed: draft.thinking?.dynamicAllowed === true,
});

/** 编辑已有条目时用输入框草稿作为基线；有自定义定义优先用它，其余用目录定义。 */
export const rowToInput = (
  row: ProviderModelRow,
  override: ProviderModelsOverride
): ModelDraftInput => {
  const draft = findCustomDraft(override, row.id);
  if (draft) return draftToInput(draft);

  return {
    ...EMPTY_MODEL_DRAFT_INPUT,
    id: row.id,
    displayName: row.displayName === row.id ? '' : row.displayName,
    contextLength: row.contextLength === undefined ? '' : String(row.contextLength),
    maxCompletionTokens:
      row.maxCompletionTokens === undefined ? '' : String(row.maxCompletionTokens),
    thinkingMin: row.thinking?.min === undefined ? '' : String(row.thinking.min),
    thinkingMax: row.thinking?.max === undefined ? '' : String(row.thinking.max),
    thinkingLevels: (row.thinking?.levels ?? []).join(', '),
    thinkingZeroAllowed: row.thinking?.zeroAllowed === true,
    thinkingDynamicAllowed: row.thinking?.dynamicAllowed === true,
  };
};

/** 已保存的覆盖条目数（停用 + 自定义），用于页头遥测与 pending 提示。 */
export const countOverrideEntries = (catalogs: ProviderCatalog[]): number =>
  catalogs.reduce(
    (sum, catalog) => sum + catalog.override.disabled.length + catalog.override.custom.length,
    0
  );

/** 视图内是否有 Home 托管的 provider —— 决定是否显示只读横幅。 */
export const hasHomeManagedCatalog = (catalogs: ProviderCatalog[]): boolean =>
  catalogs.some((catalog) => catalog.readOnly);

/** 可写（非 Home 托管）的 provider 列表。 */
export const writableCatalogs = (catalogs: ProviderCatalog[]): ProviderCatalog[] =>
  catalogs.filter((catalog) => !catalog.readOnly);

/** 同一 provider 的列表 id 只用于重复校验，不受当前筛选影响。 */
export const collectCustomIds = (override: ProviderModelsOverride): string[] =>
  override.custom.map((draft) => draft.id);

export const paginateRows = <T>(rows: T[], page: number, pageSize: number): T[] => {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
};

export const totalRowPages = (rowCount: number, pageSize: number): number =>
  Math.max(1, Math.ceil(rowCount / pageSize));
