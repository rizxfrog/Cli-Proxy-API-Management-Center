import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { providerModelsApi, isHomeManagedError, type ProviderCatalog, type ProviderModelsOverride } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';
import { hasProviderOverride } from '../logic';

export type UseProviderModelsResult = {
  catalogs: ProviderCatalog[];
  /** 首屏加载（尚无数据）。 */
  loading: boolean;
  /** 已有数据时的重新加载。 */
  refreshing: boolean;
  saving: boolean;
  error: string;
  /** 已提交过保存、但后端明确不声称已生效 —— 用于给出诚实的“已保存”提示。 */
  lastSavedAt: number | null;
  loadCatalogs: (options?: { background?: boolean }) => Promise<void>;
  saveOverride: (provider: string, override: ProviderModelsOverride) => Promise<boolean>;
  resetOverride: (provider: string) => Promise<boolean>;
};

/**
 * 目录加载 + 覆盖保存。
 *
 * 过期保护：请求自增 id + 会话代次（apiBase / 连接状态）。连接切换或登出后，
 * 旧响应不能覆盖新会话状态；卸载后也不再 setState。
 */
export function useProviderModels(): UseProviderModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiBase = useAuthStore((state) => state.apiBase);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const canQuery = connectionStatus === 'connected';

  const [catalogs, setCatalogs] = useState<ProviderCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const requestIdRef = useRef(0);
  const unmountedRef = useRef(false);
  const sessionRef = useRef(`${apiBase}|${connectionStatus}`);

  // 连接/会话变化：丢弃在途响应，并重置到首屏加载态。
  useEffect(() => {
    const nextSession = `${apiBase}|${connectionStatus}`;
    if (sessionRef.current === nextSession) return;
    sessionRef.current = nextSession;
    requestIdRef.current += 1;
    setCatalogs([]);
    setError('');
    setLastSavedAt(null);
    setSaving(false);
  }, [apiBase, connectionStatus]);

  useEffect(
    () => () => {
      unmountedRef.current = true;
      requestIdRef.current += 1;
    },
    []
  );

  const loadCatalogs = useCallback(
    async (options?: { background?: boolean }) => {
      if (!canQuery) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      const isCurrent = () =>
        !unmountedRef.current && requestId === requestIdRef.current;

      if (options?.background) setRefreshing(true);
      else setLoading(true);

      try {
        const next = await providerModelsApi.listCatalogs();
        if (!isCurrent()) return;
        setCatalogs(next);
        setError('');
      } catch (err: unknown) {
        if (!isCurrent()) return;
        setError(getErrorMessage(err, t('common.unknown_error')));
      } finally {
        if (isCurrent()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [canQuery, t]
  );

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => !unmountedRef.current && requestId === requestIdRef.current;
    try {
      const next = await providerModelsApi.listCatalogs();
      if (!isCurrent()) return;
      setCatalogs(next);
      setError('');
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setError(getErrorMessage(err, t('common.unknown_error')));
    }
  }, [t]);

  const saveOverride = useCallback(
    async (provider: string, override: ProviderModelsOverride): Promise<boolean> => {
      if (!canQuery) return false;
      setSaving(true);
      try {
        await providerModelsApi.saveOverride(provider, override);
        if (unmountedRef.current) return false;
        // 后端返回 runtime_status: pending：只声称“已保存”，不声称已在运行时生效。
        setLastSavedAt(Date.now());
        showNotification(
          t('model_management.save_saved_pending', { defaultValue: '已保存，等待重新注册生效' }),
          'success'
        );
        await reload();
        return true;
      } catch (err: unknown) {
        if (unmountedRef.current) return false;
        // 服务端可能在本会话进行中切到 Home 托管：此时写入会被 409 拒绝。
        // 这不是“保存出错”，而是本地覆盖不可执行 —— 给出只读提示而不是报错。
        if (isHomeManagedError(err)) {
          showNotification(t('model_management.save_home_managed'), 'error');
        } else {
          showNotification(
            `${t('model_management.save_failed')}: ${getErrorMessage(err)}`,
            'error'
          );
        }
        // 修改失败时重新拉取，避免界面停留在乐观状态（同时刷新出只读状态）。
        await reload();
        return false;
      } finally {
        if (!unmountedRef.current) setSaving(false);
      }
    },
    [canQuery, reload, showNotification, t]
  );

  const resetOverride = useCallback(
    async (provider: string): Promise<boolean> => {
      if (!canQuery) return false;
      setSaving(true);
      try {
        await providerModelsApi.resetOverride(provider);
        if (unmountedRef.current) return false;
        setLastSavedAt(Date.now());
        showNotification(t('model_management.reset_success'), 'success');
        await reload();
        return true;
      } catch (err: unknown) {
        if (unmountedRef.current) return false;
        if (isHomeManagedError(err)) {
          showNotification(t('model_management.save_home_managed'), 'error');
        } else {
          showNotification(
            `${t('model_management.reset_failed')}: ${getErrorMessage(err)}`,
            'error'
          );
        }
        await reload();
        return false;
      } finally {
        if (!unmountedRef.current) setSaving(false);
      }
    },
    [canQuery, reload, showNotification, t]
  );

  const sortedCatalogs = useMemo(
    () =>
      [...catalogs].sort((a, b) => {
        // 有覆盖的 provider 优先，其余按名称。
        const aOverride = hasProviderOverride(a.override);
        const bOverride = hasProviderOverride(b.override);
        if (aOverride !== bOverride) return aOverride ? -1 : 1;
        return a.provider.localeCompare(b.provider);
      }),
    [catalogs]
  );

  return {
    catalogs: sortedCatalogs,
    loading,
    refreshing,
    saving,
    error,
    lastSavedAt,
    loadCatalogs,
    saveOverride,
    resetOverride,
  };
}
