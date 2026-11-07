import { useTranslation } from 'react-i18next';
import type { AirJellyQuotaState } from '@/types';
import type { QuotaBodyProps } from '../../types';

export function AirJellyQuotaBody({ quota, classes }: QuotaBodyProps<AirJellyQuotaState>) {
  const { t } = useTranslation();
  if (quota.status !== 'success') return <div className={classes.quotaMessage}>{t('airjelly_quota.empty_data')}</div>;
  const num = (n?: number) => (n ?? 0).toLocaleString();
  const rows = [
    [t('airjelly_quota.total'), num(quota.totalRemaining)],
    [t('airjelly_quota.daily'), `${num(quota.dailyRemaining)} / ${num(quota.dailyLimit)}`],
    ...(quota.monthlyLimit && quota.monthlyLimit > 0
      ? [[t('airjelly_quota.monthly'), `${num(quota.monthlyRemaining)} / ${num(quota.monthlyLimit)}`]]
      : []),
    [t('airjelly_quota.permanent'), num(quota.permanentRemaining)],
  ];
  return <>
    <div className={classes.quotaMessage}>{t('airjelly_quota.plan')}: {quota.plan} · {quota.subscriptionStatus}</div>
    {rows.map(([label, value]) => <div className={classes.quotaRow} key={label}>
      <div className={classes.quotaRowHeader}>
        <span className={classes.quotaModel}>{label}</span>
        <div className={classes.quotaMeta}><span className={classes.quotaAmount}>{value}</span></div>
      </div>
    </div>)}
  </>;
}
