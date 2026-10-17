import { describe, expect, test } from 'bun:test';
import { parseXiaohuanxiongQuota } from '@/services/api/xiaohuanxiongQuota';
import { classifyQuotaFiles } from '@/features/quota/logic';

describe('Xiaohuanxiong quota', () => {
  test('classifies active credentials and excludes disabled ones', () => {
    const entries = classifyQuotaFiles([
      { name: 'active.json', provider: 'xiaohuanxiong' },
      { name: 'off.json', provider: 'xiaohuanxiong', disabled: true },
    ]);
    expect(entries.map(({ file, type }) => [file.name, type])).toEqual([
      ['active.json', 'xiaohuanxiong'],
    ]);
  });

  test('preserves a valid zero balance', () => {
    const payload = {
      available_points: 0,
      daily_points: 0,
      monthly_points: 0,
      reward_points: 0,
      topup_points: 0,
      enterprise_topup_points: 0,
      total_chargeable_points: 0,
    };
    expect(parseXiaohuanxiongQuota(payload)).toEqual(payload);
  });

  test('rejects missing or malformed balances instead of showing zero', () => {
    expect(parseXiaohuanxiongQuota({ available_points: 0 })).toBeNull();
    expect(
      parseXiaohuanxiongQuota({
        available_points: '0',
        daily_points: 0,
        monthly_points: 0,
        reward_points: 0,
        topup_points: 0,
        enterprise_topup_points: 0,
        total_chargeable_points: 0,
      })
    ).toBeNull();
  });
});
