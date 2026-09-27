import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconModelCluster, IconPlus, IconRefreshCw } from '@/components/ui/icons';
import { useRevealGroup } from '@/hooks/motion';
import type { ProviderModelCounts } from '../logic';
import styles from './ProviderModelsHeader.module.scss';

export type ProviderModelsHeaderProps = {
  counts: ProviderModelCounts;
  /** 已配置覆盖的模型数（停用 + 自定义）。 */
  overrideCount: number;
  loading: boolean;
  refreshing: boolean;
  /** Home 托管：所有修改入口都必须关闭。 */
  readOnly: boolean;
  disableControls: boolean;
  /** 没有明确目标 provider 时（如「全部」视图）不能新增，避免静默写入错误对象。 */
  addModelDisabled: boolean;
  onAddModel: () => void;
  onRefresh: () => void;
};

/**
 * 页头：▍游标行 + 标题 + mono 遥测。
 * 遥测行只报配置态（启用/停用），运行可用性交给表格与筛选，避免头部说谎。
 */
export function ProviderModelsHeader(props: ProviderModelsHeaderProps) {
  const { counts, overrideCount, loading, refreshing, readOnly, disableControls, addModelDisabled, onAddModel, onRefresh } =
    props;
  const { t } = useTranslation();
  const revealRef = useRevealGroup<HTMLElement>();

  return (
    <header className={styles.header} ref={revealRef}>
      <div className={styles.copy}>
        <h1 className={styles.title} data-reveal>
          {t('model_management.title')}
        </h1>
        <p className={styles.meta} data-reveal>
          <span className={styles.metaTotal}>
            {t('model_management.meta_total', { count: counts.total })}
          </span>
          <span className={styles.metaDot} aria-hidden="true">
            ·
          </span>
          <span className={counts.enabled > 0 ? styles.metaEnabled : styles.metaMuted}>
            {t('model_management.meta_enabled', { count: counts.enabled })}
          </span>
          <span className={styles.metaDot} aria-hidden="true">
            ·
          </span>
          <span className={counts.disabled > 0 ? styles.metaDisabled : styles.metaMuted}>
            {t('model_management.meta_disabled', { count: counts.disabled })}
          </span>
          {overrideCount > 0 && (
            <>
              <span className={styles.metaDot} aria-hidden="true">
                ·
              </span>
              <span className={styles.metaOverride}>
                {t('model_management.meta_override', { count: overrideCount })}
              </span>
            </>
          )}
        </p>
      </div>
      <div className={styles.actions} data-reveal>
        <button
          type="button"
          className={styles.ghostAction}
          onClick={onRefresh}
          disabled={loading || refreshing}
        >
          <IconRefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
          {t('common.refresh')}
        </button>
        {!readOnly && (
          <button
            type="button"
            className={styles.primaryAction}
            onClick={onAddModel}
            disabled={disableControls || addModelDisabled}
            title={addModelDisabled ? t('model_management.add_model_pick_provider') : undefined}
          >
            {loading ? <LoadingSpinner size={14} /> : <IconPlus size={15} />}
            {t('model_management.add_model')}
          </button>
        )}
      </div>

      {/* 说明当前列表是“配置视图”而不是“实时可用列表”，避免用户误判。 */}
      <p className={styles.legend} data-reveal>
        <IconModelCluster size={14} className={styles.legendIcon} aria-hidden="true" />
        {t('model_management.legend_configured_vs_runtime')}
      </p>
    </header>
  );
}
