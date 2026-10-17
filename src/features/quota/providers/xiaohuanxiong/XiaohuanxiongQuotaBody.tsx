import { useTranslation } from 'react-i18next';
import type { XiaohuanxiongQuotaState } from '@/types';
import type { QuotaBodyProps } from '../../types';

const formatPoints = (points: number): string => points.toLocaleString();

export function XiaohuanxiongQuotaBody({
  quota,
  classes,
}: QuotaBodyProps<XiaohuanxiongQuotaState>) {
  const { t } = useTranslation();
  if (quota.status !== 'success' || quota.available_points === undefined) {
    return <div className={classes.quotaMessage}>{t('xiaohuanxiong_quota.empty_data')}</div>;
  }
  const rows = [
    ['available', quota.available_points],
    ['daily', quota.daily_points],
    ['monthly', quota.monthly_points],
    ['reward', quota.reward_points],
    ['topup', quota.topup_points],
    ['enterprise', quota.enterprise_topup_points],
  ] as const;
  return (
    <>
      {rows.map(([label, value]) => (
        <div className={classes.quotaRow} key={label}>
          <div className={classes.quotaRowHeader}>
            <span className={classes.quotaModel}>{t(`xiaohuanxiong_quota.${label}`)}</span>
            <div className={classes.quotaMeta}>
              <span className={classes.quotaAmount}>{formatPoints(value ?? 0)}</span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
