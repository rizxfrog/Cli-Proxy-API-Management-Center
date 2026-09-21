/**
 * Qoder CN credits render body: plan chip + one meter per credit bucket.
 *
 * An account has more than one bucket — the plan allowance (套餐内 Credits) and its
 * resource packs (资源包) — so this renders every row rather than a single meter.
 * The exhausted flag is surfaced because a Free-tier account legitimately reports
 * zeroed buckets; a 0% meter alone reads as a load failure without that label.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { QoderCNQuotaState } from '@/types';
import { buildResetDisplay } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

export function QoderCNQuotaBody({ quota, classes }: QuotaBodyProps<QoderCNQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soonestRowId = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('qodercn', quota), now),
    [quota, now]
  );
  const rows = quota.rows ?? [];
  const plan = quota.plan ?? null;

  if (rows.length === 0) {
    return <div className={classes.quotaMessage}>{t('qodercn_quota.empty_data')}</div>;
  }

  return (
    <>
      {(plan || quota.exhausted) && (
        <div className={classes.codexPlan}>
          {plan && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('qodercn_quota.plan_label')}</span>
              <span className={classes.codexPlanValue}>{plan}</span>
            </span>
          )}
          {quota.exhausted && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('qodercn_quota.status_label')}</span>
              <span className={classes.codexPlanValue}>{t('qodercn_quota.exhausted')}</span>
            </span>
          )}
        </div>
      )}
      {rows.map((row, index) => {
        const total = row.total;
        const used = row.used;
        const remaining =
          total > 0 ? Math.max(0, Math.min(100, Math.round(((total - used) / total) * 100))) : null;
        const percentLabel = remaining === null ? '--' : `${remaining}%`;
        // A pack counts down to its own expiry; the plan counts down to its reset.
        const atMs = row.kind === 'plan' ? row.resetAtMs : row.expiresAtMs;
        const resetDisplay = buildResetDisplay(null, atMs, now, i18n.resolvedLanguage);
        const soon = row.id === soonestRowId;

        return (
          <div
            key={row.id}
            className={classes.quotaRow}
            title={soon ? t('quota_management.soonest_row_hint') : undefined}
          >
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{row.label ?? ''}</span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>{percentLabel}</span>
                {resetDisplay && (
                  <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
                )}
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
