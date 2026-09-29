/**
 * MiniMax Code coding-plan quota render body: plan chip + one meter per window.
 *
 * The plan reports a 5-hour rolling window and a weekly window. Each window is a
 * remaining-percentage meter with its own reset instant; a window the plan does
 * not cap renders the "unlimited" label instead of a meter. An account without
 * an active coding plan renders the not-subscribed message.
 */

import { useTranslation } from 'react-i18next';
import type { MinimaxQuotaState } from '@/types';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

export function MinimaxQuotaBody({ quota, classes }: QuotaBodyProps<MinimaxQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const locale = i18n.resolvedLanguage;
  const urgentRow = pickUrgentRowId(collectQuotaRowInstants('minimax', quota), now);
  const planEnd = buildResetDisplay(null, quota.expiresAtMs ?? null, now, locale);
  const windows = quota.windows ?? [];

  if (quota.notSubscribed) {
    return <div className={classes.quotaMessage}>{t('minimax_quota.not_subscribed')}</div>;
  }
  if (windows.length === 0) {
    return <div className={classes.quotaMessage}>{t('minimax_quota.empty_data')}</div>;
  }

  return (
    <>
      {(quota.plan || quota.creditBalance || planEnd) && (
        <div className={classes.codexPlan}>
          {quota.plan && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('minimax_quota.plan_label')}</span>
              <span className={classes.codexPlanValue}>{quota.plan}</span>
            </span>
          )}
          {quota.creditBalance && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('minimax_quota.credits_label')}</span>
              <span className={classes.codexPlanValue}>{quota.creditBalance}</span>
            </span>
          )}
          {planEnd && (
            <span className={classes.codexPlanItem}>
              <span className={classes.codexPlanLabel}>{t('minimax_quota.plan_expires')}</span>
              <QuotaResetLabel display={planEnd} classes={classes} />
            </span>
          )}
        </div>
      )}
      {windows.map((window, index) => {
        const label = t(`minimax_quota.window.${window.id}`);
        const reset = buildResetDisplay(null, window.resetAtMs, now, locale);
        const soon = window.id === urgentRow;
        return (
          <div key={window.id} className={classes.quotaRow}>
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>{label}</span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaPercent}>
                  {window.unlimited
                    ? t('minimax_quota.unlimited')
                    : window.remainingPercent === null
                      ? t('minimax_quota.unavailable')
                      : `${window.remainingPercent}%`}
                </span>
                {reset ? (
                  <QuotaResetLabel display={reset} classes={classes} soon={soon} />
                ) : (
                  <span className={classes.quotaReset}>{t('minimax_quota.reset_unknown')}</span>
                )}
              </div>
            </div>
            <div
              role={window.unlimited || window.remainingPercent === null ? undefined : 'meter'}
              aria-label={
                window.unlimited || window.remainingPercent === null ? undefined : label
              }
              aria-valuemin={
                window.unlimited || window.remainingPercent === null ? undefined : 0
              }
              aria-valuemax={
                window.unlimited || window.remainingPercent === null ? undefined : 100
              }
              aria-valuenow={window.unlimited ? undefined : (window.remainingPercent ?? undefined)}
            >
              <QuotaMeter
                percent={window.unlimited ? null : window.remainingPercent}
                classes={classes}
                index={index}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
