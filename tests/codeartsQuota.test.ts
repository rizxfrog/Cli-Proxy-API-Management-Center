import { describe, expect, test } from 'bun:test';
import { createInstance } from 'i18next';
import { buildCodeArtsQuotaRows, CODEARTS_CONFIG } from '@/features/quota/providers/codearts/data';
import { parseCodeArtsQuotaPayload } from '@/services/api/codeArtsQuota';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { resolveQuotaProviderType } from '@/features/quota/logic';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
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

/** Shape captured from GET /v0/management/codearts-quota. */
const payload = () => ({
  channel: 'codearts',
  total_quota: 10000000,
  total_balance: 9998929,
  used_amount: 1071,
  daily_token_limit: 10000000,
  daily_tokens_used: 1071,
  monthly_token_limit: 0,
  monthly_tokens_used: 1071,
  expire_time: 0,
});

describe('parseCodeArtsQuotaPayload', () => {
  test('reads the aggregate balance and windows', () => {
    const parsed = parseCodeArtsQuotaPayload(payload());
    expect(parsed?.total_quota).toBe(10000000);
    expect(parsed?.total_balance).toBe(9998929);
    expect(parsed?.used_amount).toBe(1071);
    expect(parsed?.daily_token_limit).toBe(10000000);
    expect(parsed?.monthly_token_limit).toBe(0);
  });

  test('rejects a payload with neither quota nor balance', () => {
    expect(parseCodeArtsQuotaPayload(null)).toBeNull();
    expect(parseCodeArtsQuotaPayload({})).toBeNull();
    expect(parseCodeArtsQuotaPayload({ channel: 'codearts' })).toBeNull();
  });

  test('tolerates numeric strings from the wire', () => {
    const parsed = parseCodeArtsQuotaPayload({ total_quota: '100', total_balance: '42' });
    expect(parsed?.total_quota).toBe(100);
    expect(parsed?.total_balance).toBe(42);
  });
});

describe('buildCodeArtsQuotaRows', () => {
  test('emits aggregate and daily rows, skipping the unlimited monthly window', () => {
    const rows = buildCodeArtsQuotaRows(payload() as never, t);
    const ids = rows.map((row) => row.id);
    // monthly_token_limit is 0 (unlimited) and must not produce a row.
    expect(ids).toEqual(['total', 'daily']);
    const total = rows[0];
    expect(total.used).toBe(1071);
    expect(total.total).toBe(10000000);
  });

  test('derives used from the balance when used_amount is absent', () => {
    const p = { total_quota: 1000, total_balance: 250 } as never;
    const rows = buildCodeArtsQuotaRows(p, t);
    expect(rows[0].used).toBe(750);
  });

  test('keeps an expire_time on the aggregate row only when positive', () => {
    const withExpiry = buildCodeArtsQuotaRows(
      { ...payload(), expire_time: 1800000000000 } as never,
      t
    );
    expect(withExpiry[0].resetAtMs).toBe(1800000000000);
    const noExpiry = buildCodeArtsQuotaRows(payload() as never, t);
    expect(noExpiry[0].resetAtMs).toBeNull();
  });
});

describe('CodeArts quota wiring', () => {
  test('registers an adapter and tab order entry', () => {
    expect(QUOTA_ADAPTERS.codearts).toBeDefined();
    expect(QUOTA_TAB_ORDER).toContain('codearts');
    expect(CODEARTS_CONFIG.storeSetter).toBe('setCodeArtsQuota');
  });

  test('classifies a codearts auth file as a quota entry', () => {
    const file = { name: 'codearts-x.json', type: 'codearts' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(file)).toBe('codearts');
  });

  test('does not classify a disabled codearts file', () => {
    const file = { name: 'codearts-x.json', type: 'codearts', disabled: true } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(file)).toBeNull();
  });

  test('resolves the tab label and icon', () => {
    expect(getTypeLabel(t, 'codearts')).toBe('CodeArts (Huawei)');
    expect(getAuthFileIcon('codearts', 'light')).toBeTruthy();
  });

  test('translates the quota strings in all four locales', () => {
    const keys = [
      'title',
      'empty_title',
      'empty_desc',
      'loading',
      'invalid_credential',
      'no_package',
      'plan_label',
      'plan_credits',
      'total_credits',
      'daily_tokens',
      'monthly_tokens',
    ];
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.codearts_quota as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
    }
  });
});
