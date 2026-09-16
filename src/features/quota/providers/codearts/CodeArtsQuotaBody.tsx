/**
 * CodeArts credits render body: plan chip + usage meters for the aggregate
 * balance and the daily/monthly windows.
 */

import { useTranslation } from 'react-i18next';
import type { CodeArtsQuotaState } from '@/types';
import { QuotaMeter } from '../../components/QuotaMeter';
import type { QuotaBodyProps } from '../../types';

export function CodeArtsQuotaBody({ quota, classes }: QuotaBodyProps<CodeArtsQuotaState>) {
  const { t } = useTranslation();
  const rows = quota.rows ?? [];
  const plan = quota.plan ?? null;

  if (rows.length === 0) {
    return <div className={classes.quotaMessage}>{t('codearts_quota.empty_data')}</div>;
  }

  return (
    <>
      {plan && (
        <div className={classes.codexPlan}>
          <span className={classes.codexPlanItem}>
            <span className={classes.codexPlanLabel}>{t('codearts_quota.plan_label')}</span>
            <span className={classes.codexPlanValue}>{plan}</span>
          </span>
        </div>
      )}
      {rows.map((row, index) => {
        const total = row.total;
        const used = row.used;
        const remaining =
          total > 0 ? Math.max(0, Math.min(100, Math.round(((total - used) / total) * 100))) : null;
        const percentLabel = remaining === null ? '--' : `${remaining}%`;

        return (
          <div key={row.id} className={classes.quotaRow}>
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{row.label ?? ''}</span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>{percentLabel}</span>
                <span className={classes.quotaAmount}>
                  {used.toLocaleString()} / {total.toLocaleString()}
                </span>
              </div>
            </div>
            <QuotaMeter percent={remaining} classes={classes} index={index} />
          </div>
        );
      })}
    </>
  );
}
