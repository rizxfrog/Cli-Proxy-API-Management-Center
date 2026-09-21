/**
 * 额度提供商数据层契约。
 *
 * data.ts 模块只做「取数 + 状态构造」：不 import React、不 import SCSS，
 * 因此可以被 bun:test 纯逻辑测试直接消费。渲染由同目录的 *QuotaBody 组件承担。
 */

import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeQuotaState,
  CodeArtsQuotaState,
  CodeBuddyQuotaState,
  CodexQuotaState,
  DevinQuotaState,
  KimiQuotaState,
  QoderCNQuotaState,
  TraeQuotaState,
  MetaQuotaState,

  XaiQuotaState,
} from '@/types';

export type QuotaUpdater<T> = T | ((prev: T) => T);

export type QuotaProviderType =
  | 'antigravity'
  | 'claude'
  | 'codearts'
  | 'codebuddy'
  | 'codex'
  | 'devin'
  | 'kimi'
  | 'qodercn'
  | 'trae'
  | 'xai'
  | 'meta';


/** useQuotaStore 的结构契约（storeSelector/storeSetter 依赖）。 */
export interface QuotaStore {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codeArtsQuota: Record<string, CodeArtsQuotaState>;
  codebuddyQuota: Record<string, CodeBuddyQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  devinQuota: Record<string, DevinQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  qoderCNQuota: Record<string, QoderCNQuotaState>;
  traeQuota: Record<string, TraeQuotaState>;
  metaQuota: Record<string, MetaQuotaState>;

  xaiQuota: Record<string, XaiQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodeArtsQuota: (updater: QuotaUpdater<Record<string, CodeArtsQuotaState>>) => void;
  setCodebuddyQuota: (updater: QuotaUpdater<Record<string, CodeBuddyQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setDevinQuota: (updater: QuotaUpdater<Record<string, DevinQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setQoderCNQuota: (updater: QuotaUpdater<Record<string, QoderCNQuotaState>>) => void;
  setTraeQuota: (updater: QuotaUpdater<Record<string, TraeQuotaState>>) => void;
  setMetaQuota: (updater: QuotaUpdater<Record<string, MetaQuotaState>>) => void;

  setXaiQuota: (updater: QuotaUpdater<Record<string, XaiQuotaState>>) => void;
  clearQuotaCache: () => void;
}

export interface QuotaProviderData<TState, TData> {
  type: QuotaProviderType;
  i18nPrefix: string;
  filterFn: (file: AuthFileItem) => boolean;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<TData>;
  resetQuota?: (file: AuthFileItem, t: TFunction) => Promise<TData>;
  canResetQuota?: (quota: TState) => boolean;
  storeSelector: (state: QuotaStore) => Record<string, TState>;
  storeSetter: keyof QuotaStore;
  buildLoadingState: () => TState;
  buildSuccessState: (data: TData) => TState;
  buildErrorState: (message: string, status?: number) => TState;
}
