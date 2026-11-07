/**
 * Quota cache that survives route switches.
 */

import { create } from 'zustand';
import { getQuotaCacheFileName } from '@/utils/quota/identity';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodeArtsQuotaState,
  CodeBuddyQuotaState,
  CodexQuotaState,
  DevinQuotaState,
  FloatboatQuotaState,
  XiaohuanxiongQuotaState,
  KimiQuotaState,
  LobsteraiServerQuotaState,
  LoomyQuotaState,
  MinimaxQuotaState,
  QoderCNQuotaState,
  TraeQuotaState,
  MetaQuotaState,
  PluginQuotaState,
  XaiQuotaState,
} from '@/types';

type QuotaUpdater<T> = T | ((prev: T) => T);

interface QuotaStoreState {
  cacheGeneration: number;
  fileGenerations: Record<string, number>;
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codeArtsQuota: Record<string, CodeArtsQuotaState>;
  codebuddyQuota: Record<string, CodeBuddyQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  devinQuota: Record<string, DevinQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  minimaxQuota: Record<string, MinimaxQuotaState>;
  qoderCNQuota: Record<string, QoderCNQuotaState>;
  traeQuota: Record<string, TraeQuotaState>;
  metaQuota: Record<string, MetaQuotaState>;
  pluginQuota: Record<string, PluginQuotaState>;
  xaiQuota: Record<string, XaiQuotaState>;
  floatboatQuota: Record<string, FloatboatQuotaState>;
  xiaohuanxiongQuota: Record<string, XiaohuanxiongQuotaState>;
  lobsteraiServerQuota: Record<string, LobsteraiServerQuotaState>;
  loomyQuota: Record<string, LoomyQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodeArtsQuota: (updater: QuotaUpdater<Record<string, CodeArtsQuotaState>>) => void;
  setCodebuddyQuota: (updater: QuotaUpdater<Record<string, CodeBuddyQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setDevinQuota: (updater: QuotaUpdater<Record<string, DevinQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setMinimaxQuota: (updater: QuotaUpdater<Record<string, MinimaxQuotaState>>) => void;
  setQoderCNQuota: (updater: QuotaUpdater<Record<string, QoderCNQuotaState>>) => void;
  setTraeQuota: (updater: QuotaUpdater<Record<string, TraeQuotaState>>) => void;
  setMetaQuota: (updater: QuotaUpdater<Record<string, MetaQuotaState>>) => void;
  setPluginQuota: (updater: QuotaUpdater<Record<string, PluginQuotaState>>) => void;
  setXaiQuota: (updater: QuotaUpdater<Record<string, XaiQuotaState>>) => void;
  setFloatboatQuota: (updater: QuotaUpdater<Record<string, FloatboatQuotaState>>) => void;
  setXiaohuanxiongQuota: (updater: QuotaUpdater<Record<string, XiaohuanxiongQuotaState>>) => void;
  setLobsteraiServerQuota: (updater: QuotaUpdater<Record<string, LobsteraiServerQuotaState>>) => void;
  setLoomyQuota: (updater: QuotaUpdater<Record<string, LoomyQuotaState>>) => void;
  clearQuotaCache: (names?: string[]) => void;
}

const resolveUpdater = <T>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

export const useQuotaStore = create<QuotaStoreState>((set) => ({
  cacheGeneration: 0,
  fileGenerations: {},
  antigravityQuota: {},
  claudeQuota: {},
  codeArtsQuota: {},
  codebuddyQuota: {},
  codexQuota: {},
  devinQuota: {},
  kimiQuota: {},
  minimaxQuota: {},
  qoderCNQuota: {},
  traeQuota: {},
  metaQuota: {},
  pluginQuota: {},
  xaiQuota: {},
  floatboatQuota: {},
  xiaohuanxiongQuota: {},
  lobsteraiServerQuota: {},
  loomyQuota: {},
  setAntigravityQuota: (updater) =>
    set((state) => ({
      antigravityQuota: resolveUpdater(updater, state.antigravityQuota),
    })),
  setClaudeQuota: (updater) =>
    set((state) => {
      const next = resolveUpdater(updater, state.claudeQuota);
      let retained = next;
      for (const [key, quota] of Object.entries(next)) {
        const previous = state.claudeQuota[key];
        if (
          previous &&
          quota !== previous &&
          (quota.status === 'loading' || quota.status === 'error') &&
          !quota.observedAt &&
          (previous.observedAt ||
            previous.windows.length ||
            previous.extraUsage ||
            previous.dollarWindows?.length)
        ) {
          if (retained === next) retained = { ...next };
          retained[key] = {
            ...quota,
            windows: previous.windows,
            extraUsage: previous.extraUsage,
            dollarWindows: previous.dollarWindows,
            observedAt: previous.observedAt,
            planType: previous.planType,
            stale: quota.status === 'error' || previous.stale,
          };
        }
      }
      return { claudeQuota: retained };
    }),
  setCodeArtsQuota: (updater) =>
    set((state) => ({
      codeArtsQuota: resolveUpdater(updater, state.codeArtsQuota),
    })),
  setCodebuddyQuota: (updater) =>
    set((state) => ({
      codebuddyQuota: resolveUpdater(updater, state.codebuddyQuota),
    })),
  setCodexQuota: (updater) =>
    set((state) => ({
      codexQuota: resolveUpdater(updater, state.codexQuota),
    })),
  setDevinQuota: (updater) =>
    set((state) => ({
      devinQuota: resolveUpdater(updater, state.devinQuota),
    })),
  setKimiQuota: (updater) =>
    set((state) => ({
      kimiQuota: resolveUpdater(updater, state.kimiQuota),
    })),
  setMinimaxQuota: (updater) =>
    set((state) => ({
      minimaxQuota: resolveUpdater(updater, state.minimaxQuota),
    })),
  setQoderCNQuota: (updater) =>
    set((state) => ({
      qoderCNQuota: resolveUpdater(updater, state.qoderCNQuota),
    })),
  setTraeQuota: (updater) =>
    set((state) => ({
      traeQuota: resolveUpdater(updater, state.traeQuota),
    })),
  setMetaQuota: (updater) =>
    set((state) => ({ metaQuota: resolveUpdater(updater, state.metaQuota) })),
  setPluginQuota: (updater) =>
    set((state) => ({
      pluginQuota: resolveUpdater(updater, state.pluginQuota),
    })),
  setXaiQuota: (updater) =>
    set((state) => ({
      xaiQuota: resolveUpdater(updater, state.xaiQuota),
    })),
  setFloatboatQuota: (updater) =>
    set((state) => ({
      floatboatQuota: resolveUpdater(updater, state.floatboatQuota),
    })),
  setXiaohuanxiongQuota: (updater) =>
    set((state) => ({
      xiaohuanxiongQuota: resolveUpdater(updater, state.xiaohuanxiongQuota),
    })),
  setLobsteraiServerQuota: (updater) =>
    set((state) => ({
      lobsteraiServerQuota: resolveUpdater(updater, state.lobsteraiServerQuota),
    })),
  setLoomyQuota: (updater) =>
    set((state) => ({
      loomyQuota: resolveUpdater(updater, state.loomyQuota),
    })),
  clearQuotaCache: (names) =>
    set((state) => {
      if (names) {
        if (names.length === 0) return state;
        const fileGenerations = { ...state.fileGenerations };
        names.forEach((name) => {
          fileGenerations[name] = (fileGenerations[name] ?? 0) + 1;
        });
        const invalidatedNames = new Set(names);
        const omitNames = <T>(cache: Record<string, T>): Record<string, T> => {
          const keysToDelete = Object.keys(cache).filter((key) =>
            invalidatedNames.has(getQuotaCacheFileName(key))
          );
          if (keysToDelete.length === 0) return cache;
          const next = { ...cache };
          keysToDelete.forEach((key) => delete next[key]);
          return next;
        };
        return {
          fileGenerations,
          antigravityQuota: omitNames(state.antigravityQuota),
          claudeQuota: omitNames(state.claudeQuota),
          codeArtsQuota: omitNames(state.codeArtsQuota),
          codebuddyQuota: omitNames(state.codebuddyQuota),
          codexQuota: omitNames(state.codexQuota),
          devinQuota: omitNames(state.devinQuota),
          kimiQuota: omitNames(state.kimiQuota),
          minimaxQuota: omitNames(state.minimaxQuota),
          qoderCNQuota: omitNames(state.qoderCNQuota),
          traeQuota: omitNames(state.traeQuota),
          metaQuota: omitNames(state.metaQuota),
          pluginQuota: omitNames(state.pluginQuota),
          xaiQuota: omitNames(state.xaiQuota),
          floatboatQuota: omitNames(state.floatboatQuota),
          xiaohuanxiongQuota: omitNames(state.xiaohuanxiongQuota),
          lobsteraiServerQuota: omitNames(state.lobsteraiServerQuota),
          loomyQuota: omitNames(state.loomyQuota),
        };
      }
      return {
        cacheGeneration: state.cacheGeneration + 1,
        fileGenerations: {},
        antigravityQuota: {},
        claudeQuota: {},
        codeArtsQuota: {},
        codebuddyQuota: {},
        codexQuota: {},
        devinQuota: {},
        kimiQuota: {},
        minimaxQuota: {},
        qoderCNQuota: {},
        traeQuota: {},
        metaQuota: {},
        pluginQuota: {},
        xaiQuota: {},
        floatboatQuota: {},
        xiaohuanxiongQuota: {},
        lobsteraiServerQuota: {},
        loomyQuota: {},
      };
    }),
}));

export const captureQuotaCacheGeneration = (name?: string) => {
  const { cacheGeneration, fileGenerations } = useQuotaStore.getState();
  return { cacheGeneration, fileGenerations, name };
};

export const commitIfQuotaCacheCurrent = (
  generation: ReturnType<typeof captureQuotaCacheGeneration>,
  commit: () => void,
  name: string | undefined = generation.name
): boolean => {
  const current = useQuotaStore.getState();
  if (current.cacheGeneration !== generation.cacheGeneration) return false;
  // File-scoped requests survive mutations to unrelated credentials.
  if (name !== undefined) {
    if ((current.fileGenerations[name] ?? 0) !== (generation.fileGenerations[name] ?? 0)) {
      return false;
    }
  } else if (current.fileGenerations !== generation.fileGenerations) {
    return false;
  }
  commit();
  return true;
};
