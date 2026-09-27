import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { IconPencil, IconTrash2 } from '@/components/ui/icons';
import type { ProviderModelSource } from '@/services/api/providerModels';
import {
  modelSourceLabelKey,
  type ModelAvailability,
  type ProviderModelRow,
} from '../logic';
import styles from './ProviderModelsTable.module.scss';

/** 显式映射，避免动态属性查找在 CSS Module 类型下退化成 undefined。 */
const SOURCE_CLASS: Record<ProviderModelSource, string> = {
  default: styles.sourceDefault,
  configured: styles.sourceConfigured,
  runtime: styles.sourceRuntime,
  custom: styles.sourceCustom,
  override: styles.sourceOverride,
  unavailable: styles.sourceUnavailable,
};

const AVAILABILITY_CLASS: Record<ModelAvailability, string> = {
  available: styles.availabilityGood,
  'no-account': styles.availabilityWarn,
  disabled: styles.availabilityMuted,
  'home-managed': styles.availabilityMuted,
  unknown: styles.availabilityMuted,
};

export type ProviderModelsTableProps = {
  rows: ProviderModelRow[];
  /** 「全部」视图：行上要显示 provider，否则同名模型无法区分。 */
  showProvider: boolean;
  /** Home 托管：既是只读也是“未连接”。
   * 只读时不渲染任何修改控件（而非渲染成 disabled），否则键盘仍能聚焦到无效操作。 */
  readOnly: boolean;
  disableControls: boolean;
  /** 行级保存中。 */
  busy: boolean;
  onToggleEnabled: (row: ProviderModelRow, enabled: boolean) => void;
  onEdit: (row: ProviderModelRow) => void;
  onDelete: (row: ProviderModelRow) => void;
};

/**
 * 模型表。
 *
 * 三列承担三种不同的真相，不能互相顶替：
 * - 来源：条目从哪来（项目默认 / 用户自定义 / 上游已消失）
 * - 配置：用户是否允许（这是页面真正能控制的东西）
 * - 可用性：当前是否有账号真的提供它（观察值，可能为 0）
 */
export function ProviderModelsTable(props: ProviderModelsTableProps) {
  const { rows, showProvider, readOnly, disableControls, busy, onToggleEnabled, onEdit, onDelete } =
    props;
  const { t } = useTranslation();

  const availabilityLabel = (row: ProviderModelRow): string => {
    switch (row.availability) {
      case 'disabled':
        return t('model_management.availability_disabled');
      case 'no-account':
        return t('model_management.availability_no_account');
      case 'available':
        return t('model_management.availability_available', {
          count: row.accountCount ?? 0,
        });
      case 'home-managed':
        return t('model_management.availability_home_managed');
      default:
        return t('model_management.availability_unknown');
    }
  };

  return (
    <Table aria-label={t('model_management.table_label')}>
      <TableHeader>
        <TableRow>
          <TableHead>{t('model_management.column_model')}</TableHead>
          <TableHead>{t('model_management.column_source')}</TableHead>
          <TableHead>{t('model_management.column_availability')}</TableHead>
          <TableHead>{t('model_management.column_enabled')}</TableHead>
          <TableHead alignRight>{t('model_management.column_actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const canDelete = !readOnly && row.hasCustomDefinition;
          const availabilityClass = AVAILABILITY_CLASS[row.availability];

          return (
            <TableRow key={`${row.provider}:${row.id}`}>
              <TableCell>
                <div className={styles.modelId}>{row.id}</div>
                {showProvider && <div className={styles.providerName}>{row.provider}</div>}
                {row.displayName !== row.id && (
                  <div className={styles.displayName}>{row.displayName}</div>
                )}
                {row.contextLength !== undefined && (
                  <div className={styles.spec}>
                    {t('model_management.spec_context', { count: row.contextLength })}
                  </div>
                )}
              </TableCell>

              <TableCell>
                <span className={`${styles.source} ${SOURCE_CLASS[row.source]}`}>
                  {t(modelSourceLabelKey(row.source))}
                </span>
              </TableCell>

              <TableCell>
                <span className={availabilityClass}>{availabilityLabel(row)}</span>
              </TableCell>

              <TableCell>
                {readOnly ? (
                  <span className={styles.readOnlyValue}>
                    {row.enabled
                      ? t('model_management.status_enabled')
                      : t('model_management.status_disabled')}
                  </span>
                ) : (
                  <ToggleSwitch
                    checked={row.enabled}
                    disabled={disableControls || busy}
                    onChange={(value) => onToggleEnabled(row, value)}
                    ariaLabel={t('model_management.toggle_model', { name: row.id })}
                  />
                )}
              </TableCell>

              <TableCell alignRight>
                <div className={styles.rowActions}>
                  {!readOnly && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disableControls || busy}
                        onClick={() => onEdit(row)}
                        aria-label={
                          row.hasCustomDefinition
                            ? t('model_management.edit_model', { name: row.id })
                            : t('model_management.override_model', { name: row.id })
                        }
                        title={
                          row.hasCustomDefinition
                            ? t('model_management.edit_model', { name: row.id })
                            : t('model_management.override_hint', { name: row.id })
                        }
                      >
                        <IconPencil size={14} />
                      </Button>
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={disableControls || busy}
                          onClick={() => onDelete(row)}
                          aria-label={t('model_management.delete_definition', { name: row.id })}
                          title={t('model_management.delete_definition', { name: row.id })}
                        >
                          <IconTrash2 size={14} />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
