/**
 * Dumate (百度搭子) quota render body: the points wallet in the console's own rows.
 *
 * The console splits the wallet into bucket families that the app itself shows
 * separately (plan subscription, granted bonuses), so they stay separate here:
 * a single "remaining" figure would hide which family the next request draws
 * from. Expiry is rendered only when an active bucket reported one; the card
 * must not invent a reset time.
 */

import { useTranslation } from 'react-i18next';
import type { DumateQuotaState } from '@/types';
import type { QuotaBodyProps } from '../../types';

export function DumateQuotaBody({ quota, classes }: QuotaBodyProps<DumateQuotaState>) {
  const { t } = useTranslation();
  if (quota.status !== 'success') {
    return <div className={classes.quotaMessage}>{t('dumate_quota.empty_data')}</div>;
  }

  const points = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const row = (label: string, value: string) => (
    <div className={classes.quotaRow}>
      <div className={classes.quotaRowHeader}>
        <span className={classes.quotaModel}>{label}</span>
        <div className={classes.quotaMeta}>
          <span className={classes.quotaAmount}>{value}</span>
        </div>
      </div>
    </div>
  );

  const expiresAt = quota.expiresAt;
  const expiry =
    expiresAt === undefined ? null : new Date(expiresAt * 1000).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  return (
    <>
      {row(t('dumate_quota.total_row'), points(quota.availablePoints ?? 0))}
      {row(t('dumate_quota.subscription_row'), points(quota.subscriptionPoints ?? 0))}
      {row(t('dumate_quota.bonus_row'), points(quota.bonusPoints ?? 0))}
      {row(t('dumate_quota.used_row'), points(quota.usedPoints ?? 0))}
      {expiry !== null && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaMessage}>
              {t('dumate_quota.expires_hint', { time: expiry })}
            </span>
          </div>
        </div>
      )}
      {quota.throttled && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaMessage}>
              {t('dumate_quota.throttled_hint', {
                reason: quota.throttleReason || t('dumate_quota.throttled_unknown'),
              })}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
