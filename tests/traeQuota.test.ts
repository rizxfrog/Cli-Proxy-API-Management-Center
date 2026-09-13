import { describe, expect, test } from 'bun:test';
import { buildTraeQuotaRows } from '@/utils/quota/builders';
import { parseTraeUsagePayload } from '@/utils/quota/parsers';
import type { TraeUsagePayload } from '@/types';

/** Shape captured from POST /trae/api/v2/pay/ide_user_ent_usage. */
const payload = (): TraeUsagePayload => ({
  is_credits_billing: true,
  is_dollar_usage_billing: false,
  trial_status: { is_eligible_for_trial: false, is_in_trial: false },
  usage_summary: {
    consumed_amount: 55.41,
    consumption_ratio: 0.010864705882352941,
    total_amount: 5100,
  },
  user_entitlement_pack_list: [
    {
      display_desc: '老用户福利',
      entitlement_base_info: {
        entitlement_id: '353095403266',
        end_time: 1791184695,
        start_time: 1788506295,
        quota: { credits_limit: 2000, no_bonus_quota: true },
        product_extra: {
          package_extra: { package_name: '福利积分' },
        },
      },
      usage: {},
    },
    {
      display_desc: '签到奖励',
      entitlement_base_info: {
        entitlement_id: 'checkin_20260907_3273661518457721',
        end_time: 1790000000,
        quota: { credits_limit: 150 },
        product_extra: { package_extra: { package_name: '签到奖励' } },
      },
      usage: {},
    },
    {
      display_desc: '月度赠送',
      entitlement_base_info: {
        entitlement_id: 'monthly_bonus_20269_3273661518457721',
        end_time: 1795000000,
        quota: { credits_limit: 500 },
        product_extra: { package_extra: { package_name: '月度赠送' } },
      },
      usage: { credits_amount: 55.4128 },
    },
  ],
});

describe('parseTraeUsagePayload', () => {
  test('accepts an object payload and a JSON string', () => {
    const raw = payload();
    expect(parseTraeUsagePayload(raw)?.usage_summary?.total_amount).toBe(5100);
    expect(parseTraeUsagePayload(JSON.stringify(raw))?.usage_summary?.total_amount).toBe(5100);
  });

  test('rejects null, empty and non-JSON payloads', () => {
    expect(parseTraeUsagePayload(null)).toBeNull();
    expect(parseTraeUsagePayload('')).toBeNull();
    expect(parseTraeUsagePayload('   ')).toBeNull();
    expect(parseTraeUsagePayload('{not json')).toBeNull();
  });
});

describe('buildTraeQuotaRows', () => {
  test('emits the aggregate balance first, then packs by expiry', () => {
    const rows = buildTraeQuotaRows(payload());

    expect(rows[0]).toEqual({
      id: 'total',
      used: 55.41,
      total: 5100,
      resetAtMs: null,
    });

    // Soonest expiry first: checkin (1790000000) before welfare (1791184695).
    expect(rows.slice(1).map((row) => row.id)).toEqual([
      'checkin_20260907_3273661518457721',
      '353095403266',
      'monthly_bonus_20269_3273661518457721',
    ]);
    expect(rows[2].label).toBe('福利积分');
    expect(rows[2].total).toBe(2000);
    expect(rows[2].resetAtMs).toBe(1791184695 * 1000);
  });

  test('reads pack usage when present and defaults to zero', () => {
    const rows = buildTraeQuotaRows(payload());
    const monthly = rows.find((row) => row.id === 'monthly_bonus_20269_3273661518457721');
    expect(monthly?.used).toBeCloseTo(55.4128, 4);
    const checkin = rows.find((row) => row.id === 'checkin_20260907_3273661518457721');
    expect(checkin?.used).toBe(0);
  });

  test('falls back to entitlement id when the pack carries no name', () => {
    const raw = payload();
    const packs = raw.user_entitlement_pack_list ?? [];
    packs[0] = {
      entitlement_base_info: { entitlement_id: 'bare-id', end_time: 1791184695, quota: { credits_limit: 100 } },
    };
    const rows = buildTraeQuotaRows(raw);
    const bare = rows.find((row) => row.id === 'bare-id');
    expect(bare?.label).toBe('bare-id');
  });

  test('skips packs without a positive credits limit', () => {
    const raw = payload();
    raw.user_entitlement_pack_list = [
      { entitlement_base_info: { entitlement_id: 'zero', quota: { credits_limit: 0 } } },
      { entitlement_base_info: { entitlement_id: 'null', quota: {} } },
      { entitlement_base_info: { entitlement_id: 'ok', quota: { credits_limit: 12 } } },
    ];
    const rows = buildTraeQuotaRows(raw);
    expect(rows.map((row) => row.id)).toEqual(['total', 'ok']);
  });

  test('omits the summary row when the total is missing or zero', () => {
    const raw = payload();
    raw.usage_summary = { consumed_amount: 10, consumption_ratio: 1 };
    // Without a total the first row is the soonest-expiring pack, not the summary.
    expect(buildTraeQuotaRows(raw)[0].id).toBe('checkin_20260907_3273661518457721');
    expect(buildTraeQuotaRows(raw).every((row) => row.id !== 'total')).toBe(true);

    raw.usage_summary = { total_amount: 0, consumed_amount: 0 };
    expect(buildTraeQuotaRows(raw).every((row) => row.id !== 'total')).toBe(true);
  });

  test('returns no rows for a null payload', () => {
    expect(buildTraeQuotaRows(null)).toEqual([]);
  });
});
