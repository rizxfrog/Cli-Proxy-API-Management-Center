import { describe, expect, test } from 'bun:test';
import { createInstance } from 'i18next';
import {
  buildQoderCNQuotaRows,
  qoderCNPlanLabel,
  qoderCNRowLabelKey,
  qoderCNUnit,
  QODERCN_CONFIG,
} from '@/features/quota/providers/qodercn/data';
import { parseQoderCNQuotaPayload } from '@/services/api/qoderCnQuota';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { resolveQuotaProviderType } from '@/features/quota/logic';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import { QUOTA_PROVIDER_TYPES, getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { collectQuotaRowInstants } from '@/features/quota/resetSchedule';
import { buildTimelineLane } from '@/features/quota/quotaTimelineModel';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
import type { AuthFileItem } from '@/types';

const t = (() => {
  const instance = createInstance();
  instance.init({ lng: 'en', resources: { en: { translation: en } } });
  return instance.t.bind(instance);
})();

/**
 * The payload shape captured from GET /v0/management/qoder-cn-quota for the live
 * CN account: an empty plan allowance (0/0) plus a 200-credit resource pack. This
 * is the two-meter card the official client renders as
 * 套餐内 Credits 0/0 + 资源包 0/200.
 */
const twoBucketPayload = () => ({
  plan: 'Free',
  plan_tier: 'PLAN_TIER_FREE',
  usage_type: 'credits',
  unit: 'credits',
  is_quota_exceeded: false,
  reset_at: 1785166151983,
  expires_at: 0,
  rows: [
    { kind: 'plan', id: 'plan', total: 0, used: 0, remaining: 0, unit: 'credits', reset_at: 1785166151983 },
    {
      kind: 'addon',
      id: 'addon',
      total: 200,
      used: 0,
      remaining: 200,
      unit: 'credits',
    },
  ],
});

const fundedPayload = () => ({
  plan: 'Pro',
  plan_tier: 'PLAN_TIER_PRO',
  usage_type: 'credits',
  unit: 'credits',
  is_quota_exceeded: false,
  reset_at: 1785166151983,
  rows: [
    { kind: 'plan', id: 'plan', total: 2000, used: 500, remaining: 1500, unit: 'credits' },
    { kind: 'addon', id: 'addon', total: 100, used: 25, remaining: 75, unit: 'credits' },
  ],
});

describe('parseQoderCNQuotaPayload', () => {
  test('reads the multi-bucket ledger and status payload', () => {
    const parsed = parseQoderCNQuotaPayload(twoBucketPayload());
    expect(parsed?.plan).toBe('Free');
    expect(parsed?.plan_tier).toBe('PLAN_TIER_FREE');
    expect(parsed?.unit).toBe('credits');
    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.rows[0].kind).toBe('plan');
    expect(parsed?.rows[1].kind).toBe('addon');
  });

  test('preserves a legitimately zeroed bucket', () => {
    const parsed = parseQoderCNQuotaPayload(twoBucketPayload());
    expect(parsed).not.toBeNull();
    expect(parsed?.rows[0].total).toBe(0);
    expect(parsed?.rows[1].total).toBe(200);
  });

  test('keeps resource packs with their name, expiry and availability', () => {
    const parsed = parseQoderCNQuotaPayload({
      plan: 'Pro',
      rows: [
        { kind: 'plan', id: 'plan', total: 0, used: 0 },
        {
          kind: 'pack',
          id: 'pack-a',
          name: 'Sign-in bonus',
          total: 150,
          remaining: 150,
          expires_at: 1800000000000,
          available: true,
          status: 'available',
        },
      ],
    });
    const pack = parsed?.rows[1];
    expect(pack?.kind).toBe('pack');
    expect(pack?.name).toBe('Sign-in bonus');
    expect(pack?.expires_at).toBe(1800000000000);
    expect(pack?.available).toBe(true);
    expect(pack?.status).toBe('available');
  });

  test('rejects a payload carrying no numeric meter at all', () => {
    expect(parseQoderCNQuotaPayload(null)).toBeNull();
    expect(parseQoderCNQuotaPayload({})).toBeNull();
    expect(parseQoderCNQuotaPayload({ plan: 'Free' })).toBeNull();
    expect(parseQoderCNQuotaPayload({ rows: [] })).toBeNull();
    expect(parseQoderCNQuotaPayload({ rows: [{ kind: 'plan' }] })).toBeNull();
    expect(parseQoderCNQuotaPayload('nope')).toBeNull();
  });

  test('drops malformed rows but keeps the usable ones', () => {
    const parsed = parseQoderCNQuotaPayload({
      rows: [{ kind: 'plan' }, { kind: 'addon', total: 50, remaining: 50 }, null, 'x'],
    });
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0].kind).toBe('addon');
  });

  test('tolerates numeric strings and drops blank labels', () => {
    const parsed = parseQoderCNQuotaPayload({
      plan: '   ',
      rows: [{ kind: 'plan', total: '100', used: '40' }],
    });
    expect(parsed?.plan).toBeUndefined();
    expect(parsed?.rows[0].total).toBe(100);
    expect(parsed?.rows[0].used).toBe(40);
  });

  test('folds a legacy flat payload into a single plan row', () => {
    const parsed = parseQoderCNQuotaPayload({
      plan: 'Free',
      unit: 'credits',
      total: 0,
      used: 0,
      remaining: 0,
      reset_at: 1785166151983,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0].kind).toBe('plan');
    expect(parsed?.rows[0].reset_at).toBe(1785166151983);
  });

  test('accepts a rows-only payload with no legacy scalars', () => {
    // The shape a backend that predates the flat-scalar compatibility emits. It
    // must keep working: the panel and the backend are versioned apart.
    const rowsOnly = {
      plan: 'Free',
      plan_tier: 'PLAN_TIER_FREE',
      unit: 'credits',
      is_quota_exceeded: false,
      reset_at: 1785166151983,
      rows: [
        { kind: 'plan', id: 'plan', total: 0, used: 0, remaining: 0, unit: 'credits', reset_at: 1785166151983 },
        { kind: 'addon', id: 'addon', total: 200, used: 0, remaining: 200, unit: 'credits' },
      ],
    };
    const parsed = parseQoderCNQuotaPayload(rowsOnly);
    expect(parsed?.rows).toHaveLength(2);
    const rows = buildQoderCNQuotaRows(parsed!, t);
    expect(rows.map((row) => row.kind)).toEqual(['plan', 'addon']);
    expect(rows[0]).toMatchObject({ used: 0, total: 0 });
    expect(rows[1]).toMatchObject({ used: 0, total: 200 });
    expect(rows[0].resetAtMs).toBe(1785166151983);
  });
});

describe('buildQoderCNQuotaRows', () => {
  test('emits one meter per bucket, plan first', () => {
    const rows = buildQoderCNQuotaRows(twoBucketPayload() as never, t);
    expect(rows.map((row) => row.kind)).toEqual(['plan', 'addon']);
    expect(rows[0].total).toBe(0);
    expect(rows[1].total).toBe(200);
    expect(rows[1].used).toBe(0);
  });

  test('localizes the bucket labels', () => {
    const rows = buildQoderCNQuotaRows(twoBucketPayload() as never, t);
    expect(rows[0].label).toBe('Plan credits');
    expect(rows[1].label).toBe('Resource pack');
  });

  test('renders a funded account with partially consumed buckets', () => {
    const rows = buildQoderCNQuotaRows(fundedPayload() as never, t);
    expect(rows.map((row) => row.kind)).toEqual(['plan', 'addon']);
    expect(rows[0]).toMatchObject({ used: 500, total: 2000 });
    expect(rows[1]).toMatchObject({ used: 25, total: 100 });
    expect(rows[0].resetAtMs).toBe(1785166151983);
  });

  test('prefers an upstream pack name over the generic label', () => {
    const rows = buildQoderCNQuotaRows(
      {
        rows: [
          { kind: 'plan', total: 0, used: 0 },
          { kind: 'pack', id: 'p1', name: '签到大礼包', total: 10, remaining: 10 },
        ],
      } as never,
      t
    );
    expect(rows[1].label).toBe('签到大礼包');
    expect(rows[1].name).toBe('签到大礼包');
  });

  test('keeps a real zero-total row rather than hiding an exhausted account', () => {
    const rows = buildQoderCNQuotaRows(twoBucketPayload() as never, t);
    expect(rows[0].total).toBe(0);
    expect(rows[0].used).toBe(0);
  });

  test('derives used from remaining when used is absent', () => {
    const rows = buildQoderCNQuotaRows(
      { rows: [{ kind: 'addon', total: 1000, remaining: 250 }] } as never,
      t
    );
    expect(rows[0].used).toBe(750);
  });

  test('maps the plan reset to resetAtMs and a pack expiry to expiresAtMs', () => {
    const rows = buildQoderCNQuotaRows(
      {
        rows: [
          { kind: 'plan', total: 0, used: 0, reset_at: 1785166151983 },
          { kind: 'pack', id: 'p1', total: 10, remaining: 10, expires_at: 1800000000000 },
        ],
      } as never,
      t
    );
    expect(rows[0].resetAtMs).toBe(1785166151983);
    expect(rows[0].expiresAtMs).toBeNull();
    expect(rows[1].expiresAtMs).toBe(1800000000000);
    expect(rows[1].resetAtMs).toBeNull();
  });

  test('reports no countdown when neither instant is present', () => {
    const rows = buildQoderCNQuotaRows({ rows: [{ kind: 'plan', total: 100 }] } as never, t);
    expect(rows[0].resetAtMs).toBeNull();
    expect(rows[0].expiresAtMs).toBeNull();
  });

  test('generates a stable id when the row has none', () => {
    const rows = buildQoderCNQuotaRows(
      { rows: [{ kind: 'pack', total: 1 }, { kind: 'pack', total: 2 }] } as never,
      t
    );
    expect(rows.map((row) => row.id)).toEqual(['pack-0', 'pack-1']);
  });

  test('exposes the label key per bucket kind', () => {
    expect(qoderCNRowLabelKey('plan')).toBe('qodercn_quota.row.plan');
    expect(qoderCNRowLabelKey('addon')).toBe('qodercn_quota.row.addon');
    expect(qoderCNRowLabelKey('org')).toBe('qodercn_quota.row.org');
    expect(qoderCNRowLabelKey('pack')).toBe('qodercn_quota.row.pack');
  });
});

describe('qoderCNPlanLabel and qoderCNUnit', () => {
  test('prefers the user-facing tag over the tier id', () => {
    expect(qoderCNPlanLabel({ plan: 'Free', plan_tier: 'PLAN_TIER_FREE' } as never)).toBe('Free');
  });

  test('falls back to the tier id when no tag is sent', () => {
    expect(qoderCNPlanLabel({ plan_tier: 'PLAN_TIER_PRO' } as never)).toBe('PLAN_TIER_PRO');
  });

  test('returns null when neither is present', () => {
    expect(qoderCNPlanLabel({} as never)).toBeNull();
    expect(qoderCNPlanLabel({ plan: '  ' } as never)).toBeNull();
  });

  test('reads the unit from the payload, then a row, defaulting to credits', () => {
    expect(qoderCNUnit({ unit: 'credits', rows: [] } as never)).toBe('credits');
    expect(qoderCNUnit({ rows: [{ unit: 'tokens' }] } as never)).toBe('tokens');
    expect(qoderCNUnit({ rows: [] } as never)).toBe('credits');
  });
});

describe('Qoder CN quota wiring', () => {
  test('registers an adapter and a tab-order entry', () => {
    expect(QUOTA_ADAPTERS.qodercn).toBeDefined();
    expect(QUOTA_TAB_ORDER).toContain('qodercn');
    expect(QODERCN_CONFIG.storeSetter).toBe('setQoderCNQuota');
    expect(QODERCN_CONFIG.storeSelector).toBeFunction();
  });

  test('registers the auth-files quota filter type', () => {
    expect(QUOTA_PROVIDER_TYPES.has('qodercn')).toBe(true);
  });

  test('classifies a qoder-cn auth file as a quota entry', () => {
    const file = { name: 'qoder-cn-1.json', type: 'qoder-cn' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(file)).toBe('qodercn');
  });

  test('classifies by provider field as well as type', () => {
    const file = { name: 'q.json', provider: 'qoder-cn' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(file)).toBe('qodercn');
  });

  test('does not classify a disabled file', () => {
    const file = {
      name: 'qoder-cn-1.json',
      type: 'qoder-cn',
      disabled: true,
    } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(file)).toBeNull();
  });

  test('does not absorb other providers', () => {
    const codeArts = { name: 'a.json', type: 'codearts' } as unknown as AuthFileItem;
    const codeBuddy = { name: 'b.json', type: 'codebuddy-cn' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(codeArts)).toBe('codearts');
    expect(resolveQuotaProviderType(codeBuddy)).toBe('codebuddy');
  });

  test('resolves the tab label and icon', () => {
    expect(getTypeLabel(t, 'qoder-cn')).toBe('Qoder CN');
    expect(getAuthFileIcon('qoder-cn', 'light')).toBeTruthy();
  });

  test('builds loading, success and error states from the shared skeleton', () => {
    expect(QODERCN_CONFIG.buildLoadingState().status).toBe('loading');
    const ok = QODERCN_CONFIG.buildSuccessState({
      plan: 'Pro',
      unit: 'credits',
      exhausted: false,
      rows: [
        { id: 'plan', kind: 'plan', used: 0, total: 0 },
        { id: 'addon', kind: 'addon', used: 0, total: 200 },
      ],
    } as never);
    expect(ok.status).toBe('success');
    expect(ok.rows).toHaveLength(2);
    expect(ok.plan).toBe('Pro');
    const bad = QODERCN_CONFIG.buildErrorState('boom', 502);
    expect(bad.status).toBe('error');
    expect(bad.error).toBe('boom');
    expect(bad.errorStatus).toBe(502);
  });
});

describe('Qoder CN reset scheduling', () => {
  test('collects every bucket instant, including pack expiries', () => {
    const state = {
      status: 'success',
      rows: [
        { id: 'plan', resetAtMs: 1785166151983 },
        { id: 'addon', resetAtMs: null, expiresAtMs: 1800000000000 },
      ],
    };
    const instants = collectQuotaRowInstants('qodercn', state);
    expect(instants.map((instant) => instant.rowId)).toEqual(['plan', 'addon']);
    expect(instants[1].atMs).toBe(1800000000000);
  });

  test('prefers resetAtMs over expiresAtMs when both are present', () => {
    const state = {
      status: 'success',
      rows: [{ id: 'r', resetAtMs: 1700000000000, expiresAtMs: 1800000000000 }],
    };
    expect(collectQuotaRowInstants('qodercn', state)[0].atMs).toBe(1700000000000);
  });

  test('ignores rows with no usable instant', () => {
    const state = { status: 'success', rows: [{ id: 'plan', resetAtMs: null }] };
    expect(collectQuotaRowInstants('qodercn', state)).toHaveLength(0);
  });

  test('builds a timeline lane across the buckets', () => {
    const lane = buildTimelineLane({
      provider: 'qodercn',
      quota: {
        status: 'success',
        rows: [
          { id: 'plan', label: 'Plan credits', used: 500, total: 2000, resetAtMs: 1785166151983 },
          { id: 'addon', label: 'Resource pack', used: 0, total: 200, expiresAtMs: 1800000000000 },
        ],
      },
      maxPeriodHours: 24 * 30,
    } as never);
    expect(lane.limits).toHaveLength(2);
    expect(lane.anchorMs).not.toBeNull();
  });
});

describe('Qoder CN quota i18n', () => {
  const quotaKeys = [
    'title',
    'empty_title',
    'empty_desc',
    'idle',
    'loading',
    'load_failed',
    'missing_auth_index',
    'empty_data',
    'invalid_credential',
    'quota_error',
    'no_package',
    'plan_label',
    'status_label',
    'exhausted',
  ];
  const rowKeys = ['plan', 'addon', 'org', 'pack'];

  test('translates every quota string in all four locales', () => {
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of quotaKeys) {
        expect((locale.qodercn_quota as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
    }
  });

  test('translates every bucket label in all four locales', () => {
    for (const locale of [en, zhCN, zhTW, ru]) {
      const rows = (locale.qodercn_quota as unknown as { row: Record<string, string> }).row;
      for (const key of rowKeys) {
        expect(rows[key]?.trim()).toBeTruthy();
      }
    }
  });

  test('uses the client wording: 套餐内 Credits above 资源包', () => {
    const rows = (zhCN.qodercn_quota as unknown as { row: Record<string, string> }).row;
    expect(rows.plan).toBe('套餐内 Credits');
    expect(rows.addon).toBe('资源包');
    const enRows = (en.qodercn_quota as unknown as { row: Record<string, string> }).row;
    expect(enRows.plan).toBe('Plan credits');
    expect(enRows.addon).toBe('Resource pack');
  });

  test('localizes the plan chip label', () => {
    expect(en.qodercn_quota.plan_label).toBe('Plan');
    expect(zhCN.qodercn_quota.plan_label).toBe('套餐');
    expect(zhTW.qodercn_quota.plan_label).toBe('方案');
    expect(ru.qodercn_quota.plan_label).toBe('План');
  });

  test('carries the auth-files filter label in all four locales', () => {
    for (const locale of [en, zhCN, zhTW, ru]) {
      expect(
        (locale.auth_files as Record<string, string>)['filter_qoder-cn']?.trim()
      ).toBeTruthy();
    }
  });
});
