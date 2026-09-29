import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import {
  buildMinimaxQuotaWindows,
  minimaxWindowLabelKey,
  MINIMAX_CONFIG,
  MINIMAX_WINDOW_ORDER,
} from '@/features/quota/providers/minimax/data';
import { MinimaxQuotaBody } from '@/features/quota/providers/minimax/MinimaxQuotaBody';
import { parseMinimaxQuotaPayload } from '@/services/api/minimaxQuota';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { resolveQuotaProviderType } from '@/features/quota/logic';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import { QUOTA_PROVIDER_TYPES, getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import { collectQuotaRowInstants, nextRecoveryMs } from '@/features/quota/resetSchedule';
import { buildTimelineLane } from '@/features/quota/quotaTimelineModel';
import { QUOTA_CLASS_KEYS } from '@/features/quota/types';
import en from '@/i18n/locales/en.json';
import zhCN from '@/i18n/locales/zh-CN.json';
import zhTW from '@/i18n/locales/zh-TW.json';
import ru from '@/i18n/locales/ru.json';
import type { AuthFileItem, MinimaxQuotaState } from '@/types';

const t = (() => {
  const instance = createInstance();
  instance.init({ lng: 'en', resources: { en: { translation: en } } });
  return instance.t.bind(instance);
})();

const boundedPayload = () => ({
  plan: 'PRO',
  has_token_plan: true,
  not_subscribed: false,
  expires_at_ms: 1800000000000,
  credit_balance: '5000',
  windows: [
    { kind: 'five_hour', remaining_percent: 80, reset_at_ms: 1785166151983, unlimited: false },
    { kind: 'weekly', remaining_percent: 40, reset_at_ms: 1790000000000, unlimited: false },
  ],
});

const unlimitedWeeklyPayload = () => ({
  plan: 'MAX',
  windows: [
    { kind: 'five_hour', remaining_percent: 55, reset_at_ms: 1785166151983 },
    { kind: 'weekly', unlimited: true, reset_at_ms: 1790000000000 },
  ],
});

describe('parseMinimaxQuotaPayload', () => {
  test('reads the plan, credits and both windows', () => {
    const parsed = parseMinimaxQuotaPayload(boundedPayload());
    expect(parsed?.plan).toBe('PRO');
    expect(parsed?.credit_balance).toBe('5000');
    expect(parsed?.expires_at_ms).toBe(1800000000000);
    expect(parsed?.windows).toHaveLength(2);
    expect(parsed?.windows[0].kind).toBe('five_hour');
    expect(parsed?.windows[1].kind).toBe('weekly');
  });

  test('preserves an unlimited window with no percentage', () => {
    const parsed = parseMinimaxQuotaPayload(unlimitedWeeklyPayload());
    expect(parsed?.windows[1].unlimited).toBe(true);
    expect(parsed?.windows[1].remaining_percent).toBeUndefined();
  });

  test('tolerates numeric strings and drops a bounded window without a percentage', () => {
    const parsed = parseMinimaxQuotaPayload({
      plan: '  ',
      windows: [
        { kind: 'five_hour', remaining_percent: '75', reset_at_ms: '1785166151983' },
        { kind: 'weekly' },
      ],
    });
    expect(parsed?.plan).toBeUndefined();
    expect(parsed?.windows).toHaveLength(1);
    expect(parsed?.windows[0].remaining_percent).toBe(75);
    expect(parsed?.windows[0].reset_at_ms).toBe(1785166151983);
  });

  test('rejects non-object payloads and unknown window kinds', () => {
    expect(parseMinimaxQuotaPayload(null)).toBeNull();
    expect(parseMinimaxQuotaPayload('nope')).toBeNull();
    const parsed = parseMinimaxQuotaPayload({
      windows: [{ kind: 'monthly', remaining_percent: 50 }, { kind: 'weekly', remaining_percent: 30 }],
    });
    expect(parsed?.windows).toHaveLength(1);
    expect(parsed?.windows[0].kind).toBe('weekly');
  });
});

describe('buildMinimaxQuotaWindows', () => {
  test('orders windows five_hour then weekly', () => {
    const windows = buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(boundedPayload())!);
    expect(windows.map((window) => window.id)).toEqual(['five_hour', 'weekly']);
    expect(windows[0].remainingPercent).toBe(80);
    expect(windows[1].remainingPercent).toBe(40);
    expect(windows[0].periodHours).toBe(5);
    expect(windows[1].periodHours).toBe(168);
  });

  test('keeps only the windows the upstream reported', () => {
    const windows = buildMinimaxQuotaWindows(
      parseMinimaxQuotaPayload({ windows: [{ kind: 'weekly', remaining_percent: 10 }] })!
    );
    expect(windows.map((window) => window.id)).toEqual(['weekly']);
  });

  test('clamps a percentage into 0-100', () => {
    const windows = buildMinimaxQuotaWindows(
      parseMinimaxQuotaPayload({
        windows: [{ kind: 'five_hour', remaining_percent: 130 }, { kind: 'weekly', remaining_percent: -3 }],
      })!
    );
    expect(windows[0].remainingPercent).toBe(100);
    expect(windows[1].remainingPercent).toBe(0);
  });

  test('marks an unlimited window and drops its percentage', () => {
    const windows = buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(unlimitedWeeklyPayload())!);
    expect(windows[1].unlimited).toBe(true);
    expect(windows[1].remainingPercent).toBeNull();
  });

  test('exposes the label key per window kind', () => {
    expect(minimaxWindowLabelKey('five_hour')).toBe('minimax_quota.window.five_hour');
    expect(minimaxWindowLabelKey('weekly')).toBe('minimax_quota.window.weekly');
  });
});

describe('MiniMax quota wiring', () => {
  test('registers an adapter and a tab-order entry', () => {
    expect(QUOTA_ADAPTERS.minimax).toBeDefined();
    expect(QUOTA_TAB_ORDER).toContain('minimax');
    expect(MINIMAX_CONFIG.type).toBe('minimax');
    expect(MINIMAX_CONFIG.storeSetter).toBe('setMinimaxQuota');
    expect(MINIMAX_CONFIG.i18nPrefix).toBe('minimax_quota');
    expect(MINIMAX_WINDOW_ORDER).toEqual(['five_hour', 'weekly']);
  });

  test('registers the auth-files quota filter type', () => {
    expect(QUOTA_PROVIDER_TYPES.has('minimax')).toBe(true);
  });

  test('classifies minimax and minimax-cn auth files', () => {
    const intl = { name: 'minimax-1.json', type: 'minimax' } as unknown as AuthFileItem;
    const cn = { name: 'minimax-cn-1.json', type: 'minimax-cn' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(intl)).toBe('minimax');
    expect(resolveQuotaProviderType(cn)).toBe('minimax');
  });

  test('classifies by provider field and skips disabled files', () => {
    const byProvider = { name: 'm.json', provider: 'minimax' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(byProvider)).toBe('minimax');
    const disabled = {
      name: 'minimax-1.json',
      type: 'minimax',
      disabled: true,
    } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(disabled)).toBeNull();
  });

  test('does not absorb other providers', () => {
    const codeBuddy = { name: 'b.json', type: 'codebuddy-cn' } as unknown as AuthFileItem;
    expect(resolveQuotaProviderType(codeBuddy)).toBe('codebuddy');
  });

  test('resolves the tab label and icon', () => {
    expect(getTypeLabel(t, 'minimax')).toBe('MiniMax Code');
    expect(getAuthFileIcon('minimax', 'light')).toBeTruthy();
  });

  test('builds loading, success and error states from the shared skeleton', () => {
    expect(MINIMAX_CONFIG.buildLoadingState().status).toBe('loading');
    const ok = MINIMAX_CONFIG.buildSuccessState({
      plan: 'PRO',
      expiresAtMs: 1800000000000,
      creditBalance: '5000',
      notSubscribed: false,
      windows: [{ id: 'five_hour', remainingPercent: 80, resetAtMs: 1, periodHours: 5, unlimited: false }],
    });
    expect(ok.status).toBe('success');
    expect(ok.windows).toHaveLength(1);
    const failed = MINIMAX_CONFIG.buildErrorState('boom', 401);
    expect(failed.status).toBe('error');
    expect(failed.errorStatus).toBe(401);
    expect(failed.windows).toEqual([]);
  });

  test('renders a not-subscribed account without meters', () => {
    const state = MINIMAX_CONFIG.buildSuccessState({
      plan: null,
      expiresAtMs: null,
      creditBalance: null,
      notSubscribed: true,
      windows: [],
    });
    expect(state.notSubscribed).toBe(true);
    expect(state.windows).toEqual([]);
  });
});

describe('MiniMax reset instants and timeline', () => {
  test('collects a recovery instant per bounded window', () => {
    const state = { status: 'success', windows: buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(boundedPayload())!) };
    const instants = collectQuotaRowInstants('minimax', state);
    expect(instants.map((instant) => instant.rowId)).toEqual(['five_hour', 'weekly']);
    expect(nextRecoveryMs('minimax', state, 1785000000000)).toBe(1785166151983);
  });

  test('excludes an unlimited window from recovery instants', () => {
    const snapshot = parseMinimaxQuotaPayload(unlimitedWeeklyPayload())!;
    const windows = buildMinimaxQuotaWindows(snapshot).map((window) => ({
      ...window,
      // An unlimited window carries no usable reset; the timeline/instants must
      // ignore it even if an instant leaks through.
      resetAtMs: window.id === 'weekly' ? null : window.resetAtMs,
    }));
    const state = { status: 'success', windows };
    const instants = collectQuotaRowInstants('minimax', state);
    expect(instants.map((instant) => instant.rowId)).toEqual(['five_hour']);
  });

  test('builds a timeline lane anchored to the nearest window', () => {
    const state = { status: 'success', windows: buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(boundedPayload())!) };
    const lane = buildTimelineLane({
      name: 'minimax-1.json',
      displayName: 'MiniMax',
      provider: 'minimax',
      quota: state,
    });
    expect(lane.provider).toBe('minimax');
    expect(typeof lane.remaining).toBe('number');
    expect(lane.limits.length).toBeGreaterThan(0);
  });

  test('returns an empty lane for a not-subscribed account', () => {
    const lane = buildTimelineLane({
      name: 'm.json',
      displayName: 'MiniMax',
      provider: 'minimax',
      quota: { status: 'success', windows: [] },
    });
    expect(lane.anchorMs).toBeNull();
    expect(lane.remaining).toBeNull();
  });
});

describe('MinimaxQuotaBody', () => {
  const classes = Object.fromEntries(QUOTA_CLASS_KEYS.map((key) => [key, key])) as never;

  const render = (quota: MinimaxQuotaState) =>
    renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n: i18nInstance() },
        createElement(MinimaxQuotaBody, { quota, classes })
      )
    );

  test('renders one meter per window with its localized label', () => {
    const state = MINIMAX_CONFIG.buildSuccessState({
      plan: 'PRO',
      expiresAtMs: null,
      creditBalance: null,
      notSubscribed: false,
      windows: buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(boundedPayload())!),
    }) as MinimaxQuotaState;
    const markup = render(state);
    expect(markup).toContain('5-hour window');
    expect(markup).toContain('Weekly window');
    expect(markup).toContain('80%');
    expect(markup).toContain('40%');
    expect(markup).toContain('PRO');
  });

  test('renders the unlimited label for an uncapped window', () => {
    const state = MINIMAX_CONFIG.buildSuccessState({
      plan: 'MAX',
      expiresAtMs: null,
      creditBalance: null,
      notSubscribed: false,
      windows: buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(unlimitedWeeklyPayload())!),
    }) as MinimaxQuotaState;
    const markup = render(state);
    expect(markup).toContain('Unlimited');
  });

  test('renders the not-subscribed message', () => {
    const state = MINIMAX_CONFIG.buildSuccessState({
      plan: null,
      expiresAtMs: null,
      creditBalance: null,
      notSubscribed: true,
      windows: [],
    }) as MinimaxQuotaState;
    expect(render(state)).toContain('no active coding plan');
  });

  test('never emits a raw i18n key', () => {
    const state = MINIMAX_CONFIG.buildSuccessState({
      plan: 'PRO',
      expiresAtMs: null,
      creditBalance: null,
      notSubscribed: false,
      windows: buildMinimaxQuotaWindows(parseMinimaxQuotaPayload(boundedPayload())!),
    }) as MinimaxQuotaState;
    expect(render(state)).not.toContain('minimax_quota.');
  });
});

function i18nInstance() {
  const instance = createInstance();
  instance.init({ lng: 'en', resources: { en: { translation: en } } });
  return instance;
}

describe('MiniMax quota i18n', () => {
  test('supplies every label in all four locales', () => {
    const keys = Object.keys(en.minimax_quota).filter((key) => key !== 'window');
    const windowKeys = Object.keys(en.minimax_quota.window);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const locale of [en, zhCN, zhTW, ru]) {
      for (const key of keys) {
        expect((locale.minimax_quota as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
      for (const key of windowKeys) {
        expect((locale.minimax_quota.window as Record<string, string>)[key]?.trim()).toBeTruthy();
      }
    }
  });
});
