import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { buildDumateQuotaData, DUMATE_CONFIG } from '@/features/quota/providers/dumate/data';
import { DumateQuotaBody } from '@/features/quota/providers/dumate/DumateQuotaBody';
import { parseDumateQuotaPayload } from '@/services/api/dumateQuota';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import { QUOTA_PROVIDER_TYPES } from '@/features/authFiles/constants';
import { BUILT_IN_QUOTA_PROVIDERS, isDumateFile } from '@/utils/quota';
import { bindQuotaClasses, QUOTA_CLASS_KEYS } from '@/features/quota/types';
import en from '@/i18n/locales/en.json';
import type { AuthFileItem, DumateQuotaState } from '@/types';

const classes = bindQuotaClasses(
  Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])),
  'dumateQuota.test'
);

const i18n = createInstance();
i18n.init({ lng: 'en', resources: { en: { translation: en } } });
const t = i18n.t.bind(i18n);

const payload = (overrides: Record<string, unknown> = {}) => ({
  provider: 'dumate',
  observed_at: '2026-11-07T14:00:00Z',
  available_points: '5520.00',
  used_points: '6.09',
  is_subscribed: true,
  throttled: false,
  throttle_reason: '',
  throttle_type: '',
  subscription_points: '4993.91',
  bonus_points: '520.00',
  expires_at: 1794653785,
  ...overrides,
});

const render = (state: DumateQuotaState) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(DumateQuotaBody, { quota: state, classes })
    )
  );

describe('Dumate quota payload', () => {
  test('normalizes decimal strings and keeps the soonest expiry', () => {
    const parsed = parseDumateQuotaPayload(payload());
    expect(parsed).not.toBeNull();
    expect(parsed?.available_points).toBe('5520.00');
    expect(parsed?.subscription_points).toBe('4993.91');
    expect(parsed?.expires_at).toBe(1794653785);
  });

  test('drops an expiry the console did not report', () => {
    expect(parseDumateQuotaPayload(payload({ expires_at: 0 }))?.expires_at).toBe(0);
    expect(parseDumateQuotaPayload(payload({ expires_at: null }))?.expires_at).toBe(0);
  });

  test('rejects a payload without a readable total', () => {
    expect(parseDumateQuotaPayload(payload({ available_points: '' }))).toBeNull();
    expect(parseDumateQuotaPayload(payload({ available_points: 'n/a' }))).toBeNull();
    expect(parseDumateQuotaPayload(null)).toBeNull();
    expect(parseDumateQuotaPayload('5520')).toBeNull();
  });

  test('maps the payload to the view model without inventing an expiry', () => {
    const data = buildDumateQuotaData(parseDumateQuotaPayload(payload())!);
    expect(data.availablePoints).toBe(5520);
    expect(data.subscriptionPoints).toBe(4993.91);
    expect(data.bonusPoints).toBe(520);
    expect(data.expiresAt).toBe(1794653785);

    const withoutExpiry = buildDumateQuotaData(
      parseDumateQuotaPayload(payload({ expires_at: 0 }))!
    );
    expect('expiresAt' in withoutExpiry).toBe(false);
  });

  test('surfaces the throttle reason only while throttled', () => {
    const throttled = buildDumateQuotaData(
      parseDumateQuotaPayload(payload({ throttled: true, throttle_reason: 'daily_limit' }))!
    );
    expect(throttled.throttleReason).toBe('daily_limit');
    const healthy = buildDumateQuotaData(parseDumateQuotaPayload(payload())!);
    expect(healthy.throttleReason).toBe('');
  });
});

describe('Dumate quota registration', () => {
  test('registers the tab, adapter, store slice and built-in card', () => {
    expect(QUOTA_TAB_ORDER).toContain('dumate');
    expect(QUOTA_ADAPTERS.dumate).toBeDefined();
    expect(DUMATE_CONFIG.type).toBe('dumate');
    expect(DUMATE_CONFIG.i18nPrefix).toBe('dumate_quota');
    // The adapter contract test derives the slice name from the setter name.
    expect(DUMATE_CONFIG.storeSetter).toBe('setDumateQuota');
    expect(BUILT_IN_QUOTA_PROVIDERS.has('dumate')).toBe(true);
    expect(QUOTA_PROVIDER_TYPES.has('dumate' as never)).toBe(true);
  });

  test('matches only dumate credentials', () => {
    expect(isDumateFile({ type: 'dumate' } as AuthFileItem)).toBe(true);
    expect(isDumateFile({ type: 'loomy' } as AuthFileItem)).toBe(false);
    expect(isDumateFile({ type: 'dumate', disabled: true } as AuthFileItem)).toBe(true);
    expect(DUMATE_CONFIG.filterFn({ type: 'dumate' } as AuthFileItem)).toBe(true);
    expect(
      DUMATE_CONFIG.filterFn({ type: 'dumate', disabled: true } as AuthFileItem)
    ).toBe(false);
  });
});

describe('Dumate quota body', () => {
  const successState: DumateQuotaState = {
    status: 'success',
    ...buildDumateQuotaData(parseDumateQuotaPayload(payload())!),
  };

  test('renders every reported bucket family', () => {
    const markup = render(successState);
    expect(markup).toContain('Available points');
    expect(markup).toContain('Plan points');
    expect(markup).toContain('Bonus points');
    expect(markup).toContain('5,520');
    expect(markup).toContain('4,993.91');
    // No throttle hint while the account is healthy.
    expect(markup).not.toContain('Rate limited');
  });

  test('renders the throttle hint with the upstream reason', () => {
    const markup = render({
      ...successState,
      throttled: true,
      throttleReason: 'daily_limit',
    });
    expect(markup).toContain('Rate limited');
    expect(markup).toContain('daily_limit');
  });

  test('degrades to a message instead of showing a fabricated balance', () => {
    expect(render({ status: 'error', error: 'boom' })).toContain('No quota data available');
    expect(render({ status: 'loading' })).toContain('No quota data available');
  });

  test('translates every label it renders', () => {
    for (const key of [
      'empty_data',
      'total_row',
      'subscription_row',
      'bonus_row',
      'used_row',
      'expires_hint',
      'throttled_hint',
      'throttled_unknown',
    ]) {
      expect(t(`dumate_quota.${key}`)).not.toBe(`dumate_quota.${key}`);
    }
  });
});
