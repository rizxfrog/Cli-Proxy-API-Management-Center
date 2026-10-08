/**
 * FloatBoat (aoe.chat) quota render body: measured allowance against the
 * gateway's spending ceiling, plus the plan chip and entitlement groups.
 *
 * The balance row is a currency meter, not a usage-window meter: the gateway
 * reports a ceiling and a spend, not a reset schedule, so no reset label is
 * rendered. When the balance is unknown the meter track stays uncoloured and
 * the percent shows "--" instead of a fabricated zero.
 */

import { useTranslation } from 'react-i18next';
import type { FloatboatQuotaState } from '@/types';
import { QuotaMeter } from '../../components/QuotaMeter';
import type { QuotaBodyProps } from '../../types';

const formatAmount = (value: number, currency: string): string => {
  const fractionDigits = Number.isInteger(value) ? 0 : 2;
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
};

export function FloatboatQuotaBody({ quota, classes }: QuotaBodyProps<FloatboatQuotaState>) {
  const { t } = useTranslation();
  if (quota.status !== 'success') {
    return <div className={classes.quotaMessage}>{t('floatboat_quota.empty_data')}</div>;
  }

  const currency = quota.currency ?? 'USD';
  const hardLimit = quota.hardLimit ?? 0;
  const used = quota.used ?? 0;
  const remainingKnown = quota.remainingKnown === true;
  const remaining = quota.remaining ?? 0;
  const percent = remainingKnown
    ? hardLimit > 0
      ? Math.max(0, Math.min(100, Math.round((remaining / hardLimit) * 100)))
      : null
    : null;

  return (
    <>
      <div className={classes.codexPlan}>
        <span className={classes.codexPlanItem}>
          <span className={classes.codexPlanLabel}>{t('floatboat_quota.plan_label')}</span>
          <span className={classes.codexPlanValue}>
            {quota.hasActiveSubscription
              ? t('floatboat_quota.plan_subscribed')
              : t('floatboat_quota.plan_free')}
          </span>
        </span>
      </div>
      <div className={classes.quotaRow}>
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaModel}>{t('floatboat_quota.balance_row')}</span>
          <div className={classes.quotaMeta}>
            <span className={classes.quotaPercent}>
              {percent === null ? '--' : `${percent}%`}
            </span>
            <span className={classes.quotaAmount}>
              {remainingKnown
                ? `${formatAmount(remaining, currency)} / ${formatAmount(hardLimit, currency)}`
                : t('floatboat_quota.remaining_unknown')}
            </span>
          </div>
        </div>
        <QuotaMeter percent={percent} classes={classes} index={0} />
      </div>
      <div className={classes.quotaRow}>
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaModel}>{t('floatboat_quota.spent_row')}</span>
          <div className={classes.quotaMeta}>
            <span className={classes.quotaAmount}>{formatAmount(used, currency)}</span>
          </div>
        </div>
      </div>
      {quota.groups && quota.groups.length > 0 && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaModel}>{t('floatboat_quota.groups_row')}</span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaAmount}>{quota.groups.join(', ')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
