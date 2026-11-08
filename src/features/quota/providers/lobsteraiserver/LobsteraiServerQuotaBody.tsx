/**
 * LobsterAI (NetEase/Youdao) quota render body: the account's credit total and
 * its breakdown, the plan status, and the state of the daily check-in activity.
 *
 * Two credit numbers are shown because the backend exposes two different reads
 * and either one alone is misleading:
 *   - the account total (the desktop client's own account-menu read), with its
 *     per-bucket breakdown, and
 *   - the free-tier bucket, which is what the client's low-credit purchase gate
 *     watches and which is deliberately NOT labelled as the account balance.
 *
 * The backend reports absolute balances with no usage window and no reset
 * schedule, so no reset label and no percentage meter are rendered. A balance
 * the backend did not report renders as "--" instead of a fabricated zero.
 *
 * Claiming the check-in is not offered here: the card reports state only. The
 * proxy's check-in scheduler claims it once an operator explicitly enables the
 * provider, and nothing on this page can trigger a claim.
 */

import { useTranslation } from 'react-i18next';
import type { LobsteraiServerQuotaState } from '@/types';
import type { QuotaBodyProps } from '../../types';

const formatCredits = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatExpiry = (value?: string): string | undefined => {
  if (!value) return undefined;
  // The backend sends ISO 8601 without a timezone ("2026-11-14T16:41:26"); the
  // space-separated variant is tolerated for older payloads.
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function LobsteraiServerQuotaBody({
  quota,
  classes,
}: QuotaBodyProps<LobsteraiServerQuotaState>) {
  const { t } = useTranslation();
  if (quota.status !== 'success') {
    return <div className={classes.quotaMessage}>{t('lobsterai_server_quota.empty_data')}</div>;
  }

  const status = (quota.subscriptionStatus ?? '').trim().toLowerCase();
  const planLabel =
    status === ''
      ? t('lobsterai_server_quota.plan_unknown')
      : status === 'free'
        ? t('lobsterai_server_quota.plan_free')
        : t('lobsterai_server_quota.plan_subscribed');
  const totalKnown = quota.totalCreditsKnown === true;
  const totalCredits = quota.totalCredits ?? 0;
  const creditsKnown = quota.creditsKnown === true;
  const credits = quota.credits ?? 0;
  const purchased = quota.purchasedCredits ?? 0;
  const packages = quota.creditPackages ?? [];
  const activity = quota.activity;
  const claimedDays = activity?.claimedDays ?? 0;

  return (
    <>
      <div className={classes.codexPlan}>
        <span className={classes.codexPlanItem}>
          <span className={classes.codexPlanLabel}>
            {t('lobsterai_server_quota.plan_label')}
          </span>
          <span className={classes.codexPlanValue}>{planLabel}</span>
        </span>
      </div>
      <div className={classes.quotaRow}>
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaModel}>{t('lobsterai_server_quota.total_row')}</span>
          <div className={classes.quotaMeta}>
            <span className={classes.quotaAmount}>
              {totalKnown
                ? formatCredits(totalCredits)
                : t('lobsterai_server_quota.credits_unknown')}
            </span>
          </div>
        </div>
      </div>
      {packages.map((item, index) => {
        const expiry = formatExpiry(item.expiresAt);
        const label = item.label || item.labelEn || item.type || '';
        return (
          <div className={classes.quotaRow} key={`${item.type ?? 'pkg'}-${index}`}>
            <div className={classes.quotaRowHeader}>
              <span className={classes.quotaModel}>
                {label === '' ? t('lobsterai_server_quota.package_row') : label}
              </span>
              <div className={classes.quotaMeta}>
                <span className={classes.quotaAmount}>
                  {formatCredits(item.creditsRemaining)}
                </span>
                {expiry && (
                  <span className={classes.quotaMessage}>
                    {t('lobsterai_server_quota.package_expires', { date: expiry })}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {/* The free-tier bucket only earns its own row when it actually holds
          credits: it is routinely 0 and expired while the account is funded by
          activity grants, and a permanent "0" row reads as a broken account. */}
      {creditsKnown && credits > 0 && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaModel}>{t('lobsterai_server_quota.credits_row')}</span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaAmount}>{formatCredits(credits)}</span>
            </div>
          </div>
        </div>
      )}
      {purchased > 0 && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaModel}>
              {t('lobsterai_server_quota.purchased_row')}
            </span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaAmount}>{formatCredits(purchased)}</span>
            </div>
          </div>
        </div>
      )}
      <div className={classes.quotaRow}>
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaModel}>{t('lobsterai_server_quota.checkin_row')}</span>
          <div className={classes.quotaMeta}>
            <span className={classes.quotaAmount}>
              {activity?.claimedToday
                ? t('lobsterai_server_quota.checkin_claimed')
                : activity?.available
                  ? t('lobsterai_server_quota.checkin_available')
                  : t('lobsterai_server_quota.checkin_none')}
            </span>
          </div>
        </div>
      </div>
      {claimedDays > 0 && (
        <div className={classes.quotaRow}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaMessage}>
              {t('lobsterai_server_quota.checkin_days', { count: claimedDays })}
            </span>
          </div>
        </div>
      )}
      <div className={classes.quotaRow}>
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaMessage}>
            {t('lobsterai_server_quota.checkin_hint')}
          </span>
        </div>
      </div>
    </>
  );
}
