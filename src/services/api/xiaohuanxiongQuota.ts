import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

export interface XiaohuanxiongQuotaPayload {
  available_points: number;
  daily_points: number;
  monthly_points: number;
  reward_points: number;
  topup_points: number;
  enterprise_topup_points: number;
  total_chargeable_points: number;
}

export function parseXiaohuanxiongQuota(input: unknown): XiaohuanxiongQuotaPayload | null {
  if (!isRecord(input)) return null;
  const keys = [
    'available_points',
    'daily_points',
    'monthly_points',
    'reward_points',
    'topup_points',
    'enterprise_topup_points',
    'total_chargeable_points',
  ] as const;
  const values = {} as XiaohuanxiongQuotaPayload;
  for (const key of keys) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    values[key] = value;
  }
  return values;
}

export const xiaohuanxiongQuotaApi = {
  fetchQuota: async (authIndex: string): Promise<XiaohuanxiongQuotaPayload> => {
    const response = await apiClient.get<unknown>('/xiaohuanxiong-quota', {
      params: { auth_index: authIndex },
    });
    const payload = parseXiaohuanxiongQuota(response);
    if (!payload) throw new Error('empty_data');
    return payload;
  },
};
