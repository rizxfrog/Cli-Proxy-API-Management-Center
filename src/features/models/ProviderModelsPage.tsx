import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconAlertTriangle, IconInfo } from '@/components/ui/icons';
import { ProviderTabs } from '@/features/authFiles/components/ProviderTabs';
import { getTypeLabel, normalizeProviderKey } from '@/features/authFiles/constants';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import type { ProviderCatalog, ProviderModelDraft } from '@/services/api';
import type { ResolvedTheme } from '@/types';
import { ProviderModelEditor } from './components/ProviderModelEditor';
import { ProviderModelsHeader } from './components/ProviderModelsHeader';
import { ProviderModelsNotice } from './components/ProviderModelsNotice';
import { ProviderModelsTable } from './components/ProviderModelsTable';
import { ProviderModelsToolbar } from './components/ProviderModelsToolbar';
import { useProviderModels } from './hooks/useProviderModels';
import {
  buildCombinedRows,
  buildDraftFromInput,
  buildModelRows,
  collectCustomIds,
  EMPTY_MODEL_DRAFT_INPUT,
  countModelRows,
  countOverrideEntries,
  deleteCustomModel,
  filterModelRows,
  findCustomDraft,
  hasProviderOverride,
  paginateRows,
  rowToInput,
  setModelEnabled,
  totalRowPages,
  upsertCustomModel,
  type ModelFilters,
  type ModelSourceFilter,
  type ModelStatusFilter,
  type ProviderModelRow,
} from './logic';
import styles from './ProviderModelsPage.module.scss';

const PAGE_SIZE = 20;
const SKELETON_ROWS = 6;
const ALL_PROVIDERS = 'all';

type EditorState = {
  provider: string;
  input: ReturnType<typeof rowToInput> | null;
  originalId?: string;
  needsRestoreNote: boolean;
};

/**
 * 模型管理页：按 provider（反代客户端）维护模型目录。
 *
 * 典型用途：上游停用某模型并上线新模型，而本项目还没跟上时，
 * 用户可以自己停用旧 id、新增新 id，不必等发版。
 */
export function ProviderModelsPage() {
  const { t } = useTranslation();
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;

  const { catalogs, loading, refreshing, saving, error, lastSavedAt, loadCatalogs, saveOverride, resetOverride } =
    useProviderModels();

  const [activeProvider, setActiveProvider] = useState<string>(ALL_PROVIDERS);
  const [filters, setFilters] = useState<ModelFilters>({
    search: '',
    status: 'all',
    source: 'all',
  });
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const hasLoadedRef = useRef(false);

  const disableControls = connectionStatus !== 'connected';

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadCatalogs();
  }, [loadCatalogs]);

  useHeaderRefresh(() => loadCatalogs({ background: true }), isCurrentLayer);

  /* ---------- 标签页 ---------- */

  const providerTabs = useMemo(() => {
    const types = catalogs.map((catalog) => catalog.provider);
    const counts: Record<string, number> = { all: catalogs.length };
    catalogs.forEach((catalog) => {
      counts[catalog.provider] = catalog.models.length;
    });
    return { types: [ALL_PROVIDERS, ...types], counts };
  }, [catalogs]);

  const activeCatalog = useMemo<ProviderCatalog | null>(
    () =>
      activeProvider === ALL_PROVIDERS
        ? null
        : (catalogs.find((catalog) => catalog.provider === activeProvider) ?? null),
    [activeProvider, catalogs]
  );

  // provider 列表变化后，若当前选中项消失则回落到「全部」。
  useEffect(() => {
    if (activeProvider === ALL_PROVIDERS) return;
    if (catalogs.some((catalog) => catalog.provider === activeProvider)) return;
    if (catalogs.length === 0) return;
    setActiveProvider(ALL_PROVIDERS);
  }, [activeProvider, catalogs]);

  /* ---------- 行与筛选 ---------- */

  const allRows = useMemo(
    () =>
      activeCatalog
        ? buildModelRows(activeCatalog)
        : buildCombinedRows(catalogs),
    [activeCatalog, catalogs]
  );

  const filteredRows = useMemo(() => filterModelRows(allRows, filters), [allRows, filters]);

  const counts = useMemo(() => countModelRows(allRows), [allRows]);
  const overrideCount = useMemo(() => countOverrideEntries(catalogs), [catalogs]);

  const totalPages = totalRowPages(filteredRows.length, PAGE_SIZE);
  const pageRows = useMemo(
    () => paginateRows(filteredRows, page, PAGE_SIZE),
    [filteredRows, page]
  );

  useEffect(() => {
    setPage(1);
  }, [filters, activeProvider]);

  const rowsReadOnly = activeCatalog
    ? activeCatalog.readOnly
    : catalogs.length > 0 && catalogs.every((catalog) => catalog.readOnly);

  const showReadOnlyBanner = activeCatalog
    ? activeCatalog.readOnly
    : catalogs.some((catalog) => catalog.readOnly);

  /* ---------- 覆盖写回 ---------- */

  const applyOverride = useCallback(
    async (
      provider: string,
      nextOverride: Parameters<typeof saveOverride>[1]
    ): Promise<boolean> => {
      const target = catalogs.find((catalog) => catalog.provider === provider);
      if (!target || target.readOnly) return false;
      return saveOverride(provider, nextOverride);
    },
    [catalogs, saveOverride]
  );

  // 表格传回的是用户想要的目标状态，直接使用，不要再取反。
  const handleToggleEnabled = useCallback(
    (row: ProviderModelRow, enabled: boolean) => {
      const target = catalogs.find((catalog) => catalog.provider === row.provider);
      if (!target) return;
      void applyOverride(row.provider, setModelEnabled(target.override, row.id, enabled));
    },
    [applyOverride, catalogs]
  );

  const handleSaveDraft = useCallback(
    async (draft: ProviderModelDraft) => {
      if (!editor) return;
      const target = catalogs.find((catalog) => catalog.provider === editor.provider);
      if (!target) return;
      const saved = await applyOverride(
        editor.provider,
        upsertCustomModel(target.override, draft, editor.originalId)
      );
      if (saved) setEditor(null);
    },
    [applyOverride, catalogs, editor]
  );

  const handleDeleteDefinition = useCallback(
    (row: ProviderModelRow) => {
      const target = catalogs.find((catalog) => catalog.provider === row.provider);
      if (!target) return;
      showConfirmation({
        title: t('model_management.delete_definition_title'),
        message: row.hasUpstreamDefinition
          ? t('model_management.delete_definition_confirm_restore', { name: row.id })
          : t('model_management.delete_definition_confirm_remove', { name: row.id }),
        variant: 'danger',
        confirmText: t('common.confirm'),
        onConfirm: async () => {
          await applyOverride(
            row.provider,
            deleteCustomModel(target.override, row.id, {
              hasUpstreamDefinition: row.hasUpstreamDefinition,
            })
          );
        },
      });
    },
    [applyOverride, catalogs, showConfirmation, t]
  );

  const handleResetProvider = useCallback(() => {
    const provider = activeProvider;
    if (provider === ALL_PROVIDERS) return;
    const target = catalogs.find((catalog) => catalog.provider === provider);
    if (!target || !hasProviderOverride(target.override)) return;
    showConfirmation({
      title: t('model_management.reset_title'),
      message: t('model_management.reset_confirm', { provider }),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: async () => {
        await resetOverride(provider);
      },
    });
  }, [activeProvider, catalogs, resetOverride, showConfirmation, t]);

  const handleToggleSucceeded = handleToggleEnabled;

  const openAddEditor = useCallback(() => {
    if (!activeCatalog || activeCatalog.readOnly) return;
    setEditor({
      provider: activeCatalog.provider,
      input: EMPTY_MODEL_DRAFT_INPUT,
      needsRestoreNote: false,
    });
  }, [activeCatalog]);

  const openEditEditor = useCallback(
    (row: ProviderModelRow) => {
      const target = catalogs.find((catalog) => catalog.provider === row.provider);
      if (!target || target.readOnly) return;
      const existing = findCustomDraft(target.override, row.id);
      setEditor({
        provider: row.provider,
        input: rowToInput(row, target.override),
        originalId: existing ? row.id : undefined,
        needsRestoreNote: row.hasUpstreamDefinition,
      });
    },
    [catalogs]
  );

  /* ---------- 空态 ---------- */

  const isFirstRunEmpty = !loading && catalogs.length === 0;
  const isNoResults = !loading && catalogs.length > 0 && filteredRows.length === 0;

  const clearFilters = useCallback(() => {
    setFilters({ search: '', status: 'all', source: 'all' });
  }, []);

  const editorCustomIds = useMemo(() => {
    if (!editor) return [];
    const target = catalogs.find((catalog) => catalog.provider === editor.provider);
    return target ? collectCustomIds(target.override) : [];
  }, [catalogs, editor]);

  const canResetActive = useMemo(() => {
    if (activeCatalog) return hasProviderOverride(activeCatalog.override);
    return catalogs.some(
      (catalog) => !catalog.readOnly && hasProviderOverride(catalog.override)
    );
  }, [activeCatalog, catalogs]);

  return (
    <div className={styles.page}>
      <ProviderModelsHeader
        counts={counts}
        overrideCount={overrideCount}
        loading={loading}
        refreshing={refreshing}
        readOnly={rowsReadOnly}
        disableControls={disableControls || saving}
        addModelDisabled={!activeCatalog || activeCatalog.readOnly}
        onAddModel={openAddEditor}
        onRefresh={() => void loadCatalogs({ background: true })}
      />

      {showReadOnlyBanner && (
        <div className={styles.readOnlyBanner} role="status">
          <IconInfo size={14} className={styles.bannerIcon} aria-hidden="true" />
          <span>{t('model_management.home_read_only_banner')}</span>
        </div>
      )}

      <main className={styles.workbench}>
        {catalogs.length > 0 && (
          <ProviderTabs
            types={providerTabs.types}
            counts={providerTabs.counts}
            active={activeProvider}
            resolvedTheme={resolvedTheme}
            onChange={(type) => setActiveProvider(normalizeProviderKey(type))}
          />
        )}

        <ProviderModelsToolbar
          search={filters.search}
          onSearchChange={(value) => setFilters((current) => ({ ...current, search: value }))}
          status={filters.status}
          onStatusChange={(value: ModelStatusFilter) =>
            setFilters((current) => ({ ...current, status: value }))
          }
          source={filters.source}
          onSourceChange={(value: ModelSourceFilter) =>
            setFilters((current) => ({ ...current, source: value }))
          }
        />

        <ProviderModelsNotice
          error={error}
          pendingOverrideCount={overrideCount}
          showPending={lastSavedAt !== null}
        />

        {activeCatalog && !activeCatalog.readOnly && canResetActive && (
          <div className={styles.resetRow}>
            <Button variant="secondary" size="sm" onClick={handleResetProvider} disabled={saving}>
              {t('model_management.reset_provider', {
                provider: getTypeLabel(t, activeCatalog.provider),
              })}
            </Button>
          </div>
        )}

        {loading ? (
          <div className={styles.skeleton} aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} height={44} rounded={8} />
            ))}
          </div>
        ) : isFirstRunEmpty ? (
          <EmptyState
            title={t('model_management.empty_title')}
            description={t('model_management.empty_desc')}
          />
        ) : isNoResults ? (
          <EmptyState
            title={t('model_management.search_empty_title')}
            description={t('model_management.search_empty_desc')}
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                {t('model_management.no_results_clear')}
              </Button>
            }
          />
        ) : (
          <ProviderModelsTable
            rows={pageRows}
            showProvider={activeProvider === ALL_PROVIDERS}
            readOnly={rowsReadOnly}
            disableControls={disableControls}
            busy={saving}
            onToggleEnabled={handleToggleSucceeded}
            onEdit={openEditEditor}
            onDelete={handleDeleteDefinition}
          />
        )}

        {!loading && filteredRows.length > PAGE_SIZE && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              {t('model_management.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('model_management.pagination_info', {
                current: Math.min(page, totalPages),
                total: totalPages,
                count: filteredRows.length,
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              {t('model_management.pagination_next')}
            </Button>
          </div>
        )}

        {activeProvider === ALL_PROVIDERS && showReadOnlyBanner && catalogs.length > 1 && (
          <p className={styles.mixedHint}>
            <IconAlertTriangle size={13} className={styles.bannerIcon} aria-hidden="true" />
            {t('model_management.mixed_read_only_hint')}
          </p>
        )}
      </main>

      <ProviderModelEditor
        open={editor !== null}
        provider={editor?.provider ?? ''}
        input={editor?.input ?? null}
        customIds={editorCustomIds}
        originalId={editor?.originalId}
        needsRestoreNote={editor?.needsRestoreNote ?? false}
        saving={saving}
        onClose={() => setEditor(null)}
        onSave={(input) => {
          void handleSaveDraft(buildDraftFromInput(input));
        }}
      />
    </div>
  );
}
