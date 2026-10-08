/**
 * FloatBoat quota mapping tests.
 *
 * The gateway reports a spending ceiling and a spend, not a usage window. The
 * important invariant is that a balance the gateway did not measure stays
 * UNKNOWN: rendering a failed read as 0 would say "exhausted", and treating it
 * as unlimited would be worse.
 */

import { describe, expect, test } from 'bun:test';
import { buildFloatboatQuotaData } from '@/features/quota/providers/floatboat/data';
import { parseFloatboatQuotaPayload } from '@/services/api/floatboatQuota';

describe('floatboat quota payload parsing', () => {
  test('normalizes a measured payload', () => {
    const parsed = parseFloatboatQuotaPayload({
      currency: 'USD',
      soft_limit: 0.8,
      hard_limit: 0.8,
      used: 14.4,
      remaining: -13.6,
      remaining_known: true,
      has_payment_method: true,
      has_active_subscription: false,
      groups: ['default'],
    });
    expect(parsed).toEqual({
      currency: 'USD',
      soft_limit: 0.8,
      hard_limit: 0.8,
      used: 14.4,
      remaining: -13.6,
      remaining_known: true,
      has_payment_method: true,
      has_active_subscription: false,
      groups: ['default'],
    });
  });

  test('keeps the ceiling and spend when the balance is unknown', () => {
    // A failing usage read clears remaining_known; the payload is still useful.
    const parsed = parseFloatboatQuotaPayload({
      currency: 'USD',
      hard_limit: 0.8,
      used: 0,
      remaining_known: false,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.remaining_known).toBe(false);
    expect(parsed?.hard_limit).toBe(0.8);
  });

  test('rejects a payload carrying no amount at all', () => {
    expect(parseFloatboatQuotaPayload({ currency: 'USD' })).toBeNull();
    expect(parseFloatboatQuotaPayload(null)).toBeNull();
    expect(parseFloatboatQuotaPayload('nope')).toBeNull();
  });

  test('defaults remaining_known to false unless explicitly true', () => {
    // Anything other than a literal true must not be read as "measured".
    expect(parseFloatboatQuotaPayload({ hard_limit: 1 })?.remaining_known).toBe(false);
    expect(parseFloatboatQuotaPayload({ hard_limit: 1, remaining_known: 'yes' })?.remaining_known).toBe(
      false
    );
  });

  test('ignores non-string groups and drops an empty list', () => {
    const parsed = parseFloatboatQuotaPayload({ hard_limit: 1, groups: ['default', 7, null] });
    expect(parsed?.groups).toEqual(['default']);
    expect(parseFloatboatQuotaPayload({ hard_limit: 1, groups: [] })?.groups).toBeUndefined();
  });
});

describe('floatboat quota view model', () => {
  test('carries the measured balance through', () => {
    const data = buildFloatboatQuotaData({
      currency: 'USD',
      hard_limit: 0.8,
      used: 0.4,
      remaining: 0.4,
      remaining_known: true,
      has_active_subscription: false,
      groups: ['default'],
    });
    expect(data.remainingKnown).toBe(true);
    expect(data.remaining).toBeCloseTo(0.4, 6);
    expect(data.hasActiveSubscription).toBe(false);
    expect(data.groups).toEqual(['default']);
  });

  test('marks an unmeasured balance as unknown', () => {
    const data = buildFloatboatQuotaData({ hard_limit: 0.8, used: 0 });
    expect(data.remainingKnown).toBe(false);
  });

  test('defaults the currency when the gateway omits it', () => {
    expect(buildFloatboatQuotaData({ hard_limit: 1 }).currency).toBe('USD');
    expect(buildFloatboatQuotaData({ hard_limit: 1, currency: '   ' }).currency).toBe('USD');
  });
});
