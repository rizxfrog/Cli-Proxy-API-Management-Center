import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { IconSearch } from '@/components/ui/icons';
import type { ModelSourceFilter, ModelStatusFilter } from '../logic';
import styles from './ProviderModelsToolbar.module.scss';

export type ProviderModelsToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  status: ModelStatusFilter;
  onStatusChange: (value: ModelStatusFilter) => void;
  source: ModelSourceFilter;
  onSourceChange: (value: ModelSourceFilter) => void;
};

const SOURCE_VALUES: ModelSourceFilter[] = [
  'all',
  'default',
  'configured',
  'runtime',
  'custom',
  'override',
  'unavailable',
];

const STATUS_VALUES: ModelStatusFilter[] = ['all', 'enabled', 'disabled'];

const sourceLabelKey = (value: ModelSourceFilter): string =>
  value === 'all' ? 'model_management.source_all' : `model_management.source_${value}`;

/**
 * 工具栏：搜索 + 状态分段 + 来源下拉。
 * 两个筛选器分别对应“用户是否允许”和“条目从哪来”，语义不重叠。
 */
export function ProviderModelsToolbar(props: ProviderModelsToolbarProps) {
  const { search, onSearchChange, status, onStatusChange, source, onSourceChange } = props;
  const { t } = useTranslation();

  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('model_management.search_placeholder')}
          aria-label={t('model_management.search_label')}
          rightElement={<IconSearch className={styles.searchIcon} size={16} />}
        />
      </div>

      <div className={styles.segmented} role="group" aria-label={t('model_management.status_label')}>
        {STATUS_VALUES.map((value) => {
          const isActive = status === value;
          return (
            <button
              key={value}
              type="button"
              className={`${styles.segment} ${isActive ? styles.segmentActive : ''}`}
              aria-pressed={isActive}
              onClick={() => onStatusChange(value)}
            >
              {t(`model_management.status_${value}`)}
            </button>
          );
        })}
      </div>

      <div className={styles.source}>
        <Select
          value={source}
          options={SOURCE_VALUES.map((value) => ({
            value,
            label: t(sourceLabelKey(value)),
          }))}
          onChange={(value) => onSourceChange(value as ModelSourceFilter)}
          ariaLabel={t('model_management.source_label')}
          size="sm"
        />
      </div>
    </div>
  );
}
