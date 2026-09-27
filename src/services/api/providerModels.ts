/**
 * 模型管理（provider-models）Management API。
 *
 * 后端契约（`internal/api/handlers/management/provider_models*.go`）：
 *   GET    /provider-models             → { providers: [ProviderCatalog] }
 *   GET    /provider-models/:provider   → ProviderCatalog
 *   PUT    /provider-models/:provider   → 覆盖该 provider（严格 JSON）
 *   DELETE /provider-models/:provider   → 清除该 provider 的覆盖
 *
 * 线上字段名是 snake_case / 连字符（`display-name`、`registered_account_count`、
 * `inactive_reasons`、`runtime_status`、`read_only`、`catalog_scope`）。读写转换只在此处发生，
 * 组件一律使用驼峰视图类型。
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

export const PROVIDER_MODELS_ENDPOINT = '/provider-models';

/** Home 托管模式下 PUT/DELETE 会被拒绝，返回的稳定错误码。 */
export const PROVIDER_MODELS_HOME_MANAGED_CODE = 'provider_models_home_managed';

/**
 * 模型条目的来源。
 * - default / configured：项目自带或 config 中已配置
 * - runtime：从账号实际注册结果观察到的
 * - custom：用户新增
 * - override：用户定义覆盖了已有条目
 * - unavailable：被停用、且上游已不再提供
 */
export type ProviderModelSource =
  | 'default'
  | 'configured'
  | 'runtime'
  | 'custom'
  | 'override'
  | 'unavailable';

/** `unverified`：后端不会声称已生效；`home-managed`：由 Home 管理，本地覆盖不可执行。 */
export type ProviderRuntimeStatus = 'unverified' | 'home-managed';

/** `local-preview`：Home 模式下展示的只是本地目录预览，不代表 Home 的实际可用性。 */
export type ProviderCatalogScope = 'local' | 'local-preview';

export interface ProviderModelThinking {
  min?: number;
  max?: number;
  zeroAllowed?: boolean;
  dynamicAllowed?: boolean;
  levels?: string[];
}

/** 用户自定义模型（写入时序列化为后端连字符键名）。 */
export interface ProviderModelDraft {
  id: string;
  displayName: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  thinking?: ProviderModelThinking;
}

export interface ProviderModelsOverride {
  disabled: string[];
  custom: ProviderModelDraft[];
}

export interface ProviderModelDefinition {
  id?: string;
  displayName?: string;
  type?: string;
  ownedBy?: string;
  contextLength?: number;
  maxCompletionTokens?: number;
  thinking?: ProviderModelThinking;
}

export interface ProviderModelEntry {
  id: string;
  displayName: string;
  source: ProviderModelSource;
  /** 配置是否允许该模型；**不等于**当前真的可用。 */
  enabled: boolean;
  /** 当前注册了该模型的账号数；Home 模式下恒为 null（后端不伪造计数）。 */
  registeredAccountCount: number | null;
  inactiveReasons: string[];
  definition: ProviderModelDefinition | null;
}

export interface ProviderCatalog {
  provider: string;
  override: ProviderModelsOverride;
  models: ProviderModelEntry[];
  readOnly: boolean;
  runtimeStatus: ProviderRuntimeStatus;
  catalogScope: ProviderCatalogScope;
}

/* ------------------------------------------------------------------ 读取工具 */

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(readString).filter(Boolean) : [];

const readNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** 同时接受连接符与驼峰，防止旧版本字段漂移直接丢掉用户数据。 */
const readFirstString = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return '';
};

const readFirstNumber = (
  record: Record<string, unknown>,
  keys: string[]
): number | undefined => {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

/* -------------------------------------------------------------- 字段规范化 */

export const normalizeProviderModelSource = (value: unknown): ProviderModelSource => {
  const source = readString(value).toLowerCase();
  switch (source) {
    case 'configured':
    case 'runtime':
    case 'custom':
    case 'override':
    case 'unavailable':
      return source;
    default:
      return 'default';
  }
};

export const normalizeProviderModelThinking = (
  value: unknown
): ProviderModelThinking | undefined => {
  if (!isRecord(value)) return undefined;

  const thinking: ProviderModelThinking = {};
  const min = readNumber(value.min);
  const max = readNumber(value.max);
  const zeroAllowed = readBoolean(value.zero_allowed ?? value.zeroAllowed);
  const dynamicAllowed = readBoolean(value.dynamic_allowed ?? value.dynamicAllowed);
  const levels = readStringArray(value.levels);

  if (min !== undefined) thinking.min = min;
  if (max !== undefined) thinking.max = max;
  if (zeroAllowed !== undefined) thinking.zeroAllowed = zeroAllowed;
  if (dynamicAllowed !== undefined) thinking.dynamicAllowed = dynamicAllowed;
  if (levels.length > 0) thinking.levels = levels;

  return Object.keys(thinking).length > 0 ? thinking : undefined;
};

export const normalizeProviderModelDraft = (value: unknown): ProviderModelDraft | null => {
  if (!isRecord(value)) return null;

  const id = readFirstString(value, ['id', 'ID']);
  if (!id) return null;

  const draft: ProviderModelDraft = {
    id,
    displayName: readFirstString(value, ['display-name', 'display_name', 'displayName']),
  };
  const contextLength = readFirstNumber(value, [
    'context-length',
    'context_length',
    'contextLength',
  ]);
  const maxCompletionTokens = readFirstNumber(value, [
    'max-completion-tokens',
    'max_completion_tokens',
    'maxCompletionTokens',
  ]);
  const thinking = normalizeProviderModelThinking(value.thinking);
  if (contextLength !== undefined) draft.contextLength = contextLength;
  if (maxCompletionTokens !== undefined) draft.maxCompletionTokens = maxCompletionTokens;
  if (thinking) draft.thinking = thinking;

  return draft;
};

export const normalizeProviderModelsOverride = (value: unknown): ProviderModelsOverride => {
  if (!isRecord(value)) return { disabled: [], custom: [] };

  const disabled = Array.from(new Set(readStringArray(value.disabled)));
  const custom = (Array.isArray(value.custom) ? value.custom : [])
    .map(normalizeProviderModelDraft)
    .filter((draft): draft is ProviderModelDraft => draft !== null);

  return { disabled, custom };
};

export const normalizeProviderModelDefinition = (
  value: unknown
): ProviderModelDefinition | null => {
  if (!isRecord(value)) return null;

  const definition: ProviderModelDefinition = {};
  const id = readString(value.id);
  const displayName = readString(value.display_name);
  const type = readString(value.type);
  const ownedBy = readString(value.owned_by);
  const contextLength = readNumber(value.context_length);
  const maxCompletionTokens = readNumber(value.max_completion_tokens);
  const thinking = normalizeProviderModelThinking(value.thinking);

  if (id) definition.id = id;
  if (displayName) definition.displayName = displayName;
  if (type) definition.type = type;
  if (ownedBy) definition.ownedBy = ownedBy;
  if (contextLength !== undefined) definition.contextLength = contextLength;
  if (maxCompletionTokens !== undefined) definition.maxCompletionTokens = maxCompletionTokens;
  if (thinking) definition.thinking = thinking;

  return Object.keys(definition).length > 0 ? definition : null;
};

export const normalizeProviderModelEntry = (value: unknown): ProviderModelEntry | null => {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  if (!id) return null;

  return {
    id,
    displayName: readString(value.display_name),
    source: normalizeProviderModelSource(value.source),
    enabled: value.enabled === true,
    registeredAccountCount: readNumberOrNull(value.registered_account_count),
    inactiveReasons: readStringArray(value.inactive_reasons),
    definition: normalizeProviderModelDefinition(value.definition),
  };
};

export const normalizeProviderCatalog = (value: unknown): ProviderCatalog | null => {
  if (!isRecord(value)) return null;

  const provider = readString(value.provider).toLowerCase();
  if (!provider) return null;

  const models = (Array.isArray(value.models) ? value.models : [])
    .map(normalizeProviderModelEntry)
    .filter((entry): entry is ProviderModelEntry => entry !== null);

  return {
    provider,
    override: normalizeProviderModelsOverride(value.override),
    models,
    readOnly: value.read_only === true,
    runtimeStatus: value.runtime_status === 'home-managed' ? 'home-managed' : 'unverified',
    catalogScope: value.catalog_scope === 'local-preview' ? 'local-preview' : 'local',
  };
};

export const normalizeProviderCatalogs = (payload: unknown): ProviderCatalog[] => {
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? payload.providers
      : undefined;
  if (!Array.isArray(source)) return [];

  return source
    .map(normalizeProviderCatalog)
    .filter((catalog): catalog is ProviderCatalog => catalog !== null);
};

/* -------------------------------------------------------------- 写入序列化 */

/**
 * 后端对 PUT body 使用 DisallowUnknownFields 且要求连字符键名。
 * 未填写的可选字段必须省略（undefined 会被 JSON.stringify 丢弃）。
 */
export const serializeProviderModelDraft = (draft: ProviderModelDraft): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    id: draft.id.trim(),
    'display-name': draft.displayName.trim() || undefined,
    'context-length': draft.contextLength,
    'max-completion-tokens': draft.maxCompletionTokens,
  };

  if (draft.thinking) {
    const thinking: Record<string, unknown> = {
      min: draft.thinking.min,
      max: draft.thinking.max,
      zero_allowed: draft.thinking.zeroAllowed,
      dynamic_allowed: draft.thinking.dynamicAllowed,
      levels:
        draft.thinking.levels && draft.thinking.levels.length > 0
          ? [...draft.thinking.levels]
          : undefined,
    };
    if (Object.values(thinking).some((entry) => entry !== undefined)) {
      payload.thinking = thinking;
    }
  }

  return payload;
};

export const serializeProviderModelsOverride = (
  override: ProviderModelsOverride
): Record<string, unknown> => ({
  disabled: [...override.disabled],
  custom: override.custom.map(serializeProviderModelDraft),
});

/* ------------------------------------------------------------ 前端侧校验 */

/** 控制字符按码点判定：字面量正则里的控制字符范围会被 eslint 的 no-control-regex 拦下。 */
const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || codePoint === 0x7f) return true;
  }
  return false;
};

/** 与后端 validProviderModelID 对齐：不得含空白、控制字符或 `*?()`。 */
export const isValidModelId = (value: string): boolean => {
  const id = value.trim();
  if (!id) return false;
  if (hasControlCharacter(id)) return false;
  if (/\s/.test(id)) return false;
  return !/[*?()]/.test(id);
};

/** Provider 还额外禁止 `/`（后端返回 400）。 */
export const isValidProviderId = (value: string): boolean => {
  const provider = value.trim();
  return isValidModelId(provider) && !provider.includes('/');
};

/** 后端：Home 模式下拒绝本地覆盖（409）。用于把该状态渲染成只读而不是普通错误。 */
export const isHomeManagedError = (error: unknown): boolean => {
  if (!isRecord(error)) return false;
  if (readString(error.apiCode) === PROVIDER_MODELS_HOME_MANAGED_CODE) return true;
  return readNumber(error.status) === 409;
};

/* ------------------------------------------------------------------ 请求 */

export const providerModelsApi = {
  async listCatalogs(): Promise<ProviderCatalog[]> {
    const payload = await apiClient.get<Record<string, unknown>>(PROVIDER_MODELS_ENDPOINT);
    return normalizeProviderCatalogs(payload);
  },

  async getCatalog(provider: string): Promise<ProviderCatalog | null> {
    const payload = await apiClient.get<Record<string, unknown>>(
      `${PROVIDER_MODELS_ENDPOINT}/${encodeURIComponent(provider)}`
    );
    return normalizeProviderCatalog(payload);
  },

  /** 覆盖是增量语义：只提交 disabled + custom，不写回完整目录。 */
  saveOverride: (provider: string, override: ProviderModelsOverride) =>
    apiClient.put(
      `${PROVIDER_MODELS_ENDPOINT}/${encodeURIComponent(provider)}`,
      serializeProviderModelsOverride(override)
    ),

  resetOverride: (provider: string) =>
    apiClient.delete(`${PROVIDER_MODELS_ENDPOINT}/${encodeURIComponent(provider)}`),
};
