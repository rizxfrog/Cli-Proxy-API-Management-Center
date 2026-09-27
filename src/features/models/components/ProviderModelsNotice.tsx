import { useTranslation } from 'react-i18next';
import { IconAlertTriangle, IconInfo } from '@/components/ui/icons';
import styles from './ProviderModelsNotice.module.scss';

export type ProviderModelsNoticeProps = {
  /** 加载/保存失败的错误文本。 */
  error: string;
  /** 当前选中的 provider 已保存的覆盖数（>0 才显示“已保存未验证”提示）。 */
  pendingOverrideCount: number;
  /** 刚保存过（同一次会话内）。 */
  showPending: boolean;
};

/**
 * 两条状态带：
 * 1) 错误（role=alert）—— 加载或保存失败。
 * 2) pending —— 后端 runtime_status 恒为 unverified，绝不显示“已生效”。
 */
export function ProviderModelsNotice(props: ProviderModelsNoticeProps) {
  const { error, pendingOverrideCount, showPending } = props;
  const { t } = useTranslation();

  return (
    <>
      {error && (
        <div className={styles.error} role="alert">
          <IconAlertTriangle size={14} className={styles.icon} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {showPending && pendingOverrideCount > 0 && !error && (
        <div className={styles.pending} role="status">
          <IconInfo size={14} className={styles.icon} aria-hidden="true" />
          <span>{t('model_management.pending_runtime_note')}</span>
        </div>
      )}
    </>
  );
}
