/**
 * LobsterAI quota mapping tests.
 *
 * The backend exposes two credit reads and the whole point of the card is that
 * they are not interchangeable: the free-tier bucket from /api/user/quota is
 * routinely 0 and expired while the account is funded by activity grants, and
 * the account total lives in /api/user/profile-summary. The other invariant is
 * that a value the backend did not measure stays UNKNOWN (its `*Known` flag is
 * false): rendering an omitted balance as 0 would say "exhausted". The check-in
 * counters are observation only.
 */

import { describe, expect, test } from 'bun:test';
import { buildLobsteraiServerQuotaData } from '@/features/quota/providers/lobsteraiserver/data';
import { parseLobsteraiServerQuotaPayload } from '@/services/api/lobsteraiServerQuota';

describe('lobsterai-server quota payload parsing', () => {
  test('normalizes a full payload', () => {
    const parsed = parseLobsteraiServerQuotaPayload({
      subscription_status: 'active',
      credits: 42,
      credits_known: true,
      purchased_credits: 10,
      total_credits: 200.5,
      total_credits_known: true,
      credit_packages: [
        {
          type: 'campaign',
          label: '每日登录奖励',
          label_en: 'Daily Login Reward',
          credits_remaining: 100,
          expires_at: '2026-11-14T16:41:26',
        },
      ],
      activity_available: true,
      activity_code: 'daily_check_in',
      activity_template: 'native_daily_check_in_v1',
      activity_placement: 'desktop_sidebar',
      activity_context: { progress: '1/7' },
      claimed_today: true,
      claimed_days: 3,
      claimed_credits: 300,
    });
    expect(parsed).toEqual({
      subscription_status: 'active',
      credits: 42,
      credits_known: true,
      purchased_credits: 10,
      total_credits: 200.5,
      total_credits_known: true,
      credit_packages: [
        {
          type: 'campaign',
          label: '每日登录奖励',
          label_en: 'Daily Login Reward',
          credits_remaining: 100,
          expires_at: '2026-11-14T16:41:26',
        },
      ],
      activity_available: true,
      activity_code: 'daily_check_in',
      activity_template: 'native_daily_check_in_v1',
      activity_placement: 'desktop_sidebar',
      activity_context: { progress: '1/7' },
      claimed_today: true,
      claimed_days: 3,
      claimed_credits: 300,
    });
  });

  test('keeps the plan when the balance is unknown', () => {
    // A backend that reports only the plan is still useful.
    const parsed = parseLobsteraiServerQuotaPayload({ subscription_status: 'free' });
    expect(parsed).not.toBeNull();
    expect(parsed?.credits_known).toBe(false);
    expect(parsed?.credits).toBeUndefined();
    expect(parsed?.subscription_status).toBe('free');
  });

  test('keeps the activity state when the balance is unknown', () => {
    const parsed = parseLobsteraiServerQuotaPayload({
      activity_available: true,
      activity_code: 'daily_check_in',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.activity_available).toBe(true);
    expect(parsed?.credits_known).toBe(false);
  });

  test('rejects a payload carrying no usable field', () => {
    expect(parseLobsteraiServerQuotaPayload({})).toBeNull();
    expect(parseLobsteraiServerQuotaPayload({ credits_known: true })).toBeNull();
    expect(parseLobsteraiServerQuotaPayload(null)).toBeNull();
    expect(parseLobsteraiServerQuotaPayload('nope')).toBeNull();
  });

  test('accepts a total on its own', () => {
    // An account whose free tier is exhausted still has a usable total.
    const parsed = parseLobsteraiServerQuotaPayload({
      total_credits: 200,
      total_credits_known: true,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.total_credits).toBe(200);
    expect(parsed?.total_credits_known).toBe(true);
    expect(parsed?.credits).toBeUndefined();
  });

  test('defaults the known flags to false unless explicitly true', () => {
    expect(parseLobsteraiServerQuotaPayload({ credits: 5 })?.credits_known).toBe(false);
    expect(
      parseLobsteraiServerQuotaPayload({ credits: 5, credits_known: 'yes' })?.credits_known
    ).toBe(false);
    expect(
      parseLobsteraiServerQuotaPayload({ total_credits: 5, total_credits_known: 1 })
        ?.total_credits_known
    ).toBe(false);
  });

  test('accepts a numeric string balance', () => {
    const parsed = parseLobsteraiServerQuotaPayload({ credits: '17', credits_known: true });
    expect(parsed?.credits).toBe(17);
  });

  test('drops buckets without an amount and ignores a malformed list', () => {
    const parsed = parseLobsteraiServerQuotaPayload({
      total_credits: 100,
      total_credits_known: true,
      credit_packages: [
        { type: 'campaign', credits_remaining: 60 },
        { type: 'campaign' },
        'nonsense',
        { type: 'bonus', credits_remaining: '40.5' },
      ],
    });
    expect(parsed?.credit_packages).toEqual([
      {
        type: 'campaign',
        label: undefined,
        label_en: undefined,
        credits_remaining: 60,
        expires_at: undefined,
      },
      {
        type: 'bonus',
        label: undefined,
        label_en: undefined,
        credits_remaining: 40.5,
        expires_at: undefined,
      },
    ]);
    expect(
      parseLobsteraiServerQuotaPayload({ total_credits: 1, credit_packages: 'nope' })
        ?.credit_packages
    ).toBeUndefined();
  });
});

describe('lobsterai-server quota view model', () => {
  test('keeps the free-tier bucket and the account total apart', () => {
    // The live account shape: the free tier is exhausted, the funded balance is
    // entirely activity grants. Reading only the free tier would show 0.
    const data = buildLobsteraiServerQuotaData({
      subscription_status: 'free',
      credits: 0,
      credits_known: true,
      total_credits: 200,
      total_credits_known: true,
      credit_packages: [
        { type: 'campaign', label: '每日登录奖励', credits_remaining: 100 },
        { type: 'campaign', label: '每日登录奖励', credits_remaining: 100 },
      ],
    });
    expect(data.creditsKnown).toBe(true);
    expect(data.credits).toBe(0);
    expect(data.totalCreditsKnown).toBe(true);
    expect(data.totalCredits).toBe(200);
    expect(data.creditPackages).toHaveLength(2);
    expect(data.creditPackages[0]).toEqual({
      type: 'campaign',
      label: '每日登录奖励',
      labelEn: undefined,
      creditsRemaining: 100,
      expiresAt: undefined,
    });
  });

  test('carries a measured balance and the activity through', () => {
    const data = buildLobsteraiServerQuotaData({
      subscription_status: 'free',
      credits: 12,
      credits_known: true,
      purchased_credits: 3,
      activity_available: true,
      activity_code: 'daily_check_in',
      claimed_today: true,
      claimed_days: 3,
      claimed_credits: 300,
    });
    expect(data.creditsKnown).toBe(true);
    expect(data.credits).toBe(12);
    expect(data.purchasedCredits).toBe(3);
    expect(data.subscriptionStatus).toBe('free');
    expect(data.activity.available).toBe(true);
    expect(data.activity.code).toBe('daily_check_in');
    expect(data.activity.claimedToday).toBe(true);
    expect(data.activity.claimedDays).toBe(3);
    expect(data.activity.claimedCredits).toBe(300);
  });

  test('marks unreported values as unknown', () => {
    const data = buildLobsteraiServerQuotaData({ subscription_status: 'free' });
    expect(data.creditsKnown).toBe(false);
    expect(data.totalCreditsKnown).toBe(false);
    expect(data.creditPackages).toEqual([]);
    expect(data.activity.available).toBe(false);
    expect(data.activity.claimedToday).toBe(false);
  });
});
