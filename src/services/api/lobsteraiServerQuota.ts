/**
 * LobsterAI (NetEase/Youdao) quota service.
 *
 * LobsterAI reports credits and plan status through its own account backend
 * rather than an OpenAI-compatible billing surface, so the balance cannot be
 * read through the generic /api-call forwarder. The proxy exposes a dedicated
 * management endpoint that resolves the credential's access token and returns
 * the backend's read-only credit/plan view.
 *
 * The endpoint also reports the read-only state of the daily check-in activity.
 * The proxy never performs the check-in on the account's behalf.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** One credit bucket behind the account total. */
export interface LobsteraiServerCreditPackage {
  type?: string;
  label?: string;
  label_en?: string;
  credits_remaining: number;
  expires_at?: string;
}

/** Shape returned by GET /v0/management/lobsterai-server-quota. */
export interface LobsteraiServerQuotaPayload {
  subscription_status?: string;
  /**
   * The free-tier bucket from the backend's own /api/user/quota read. It is the
   * bucket the desktop client's low-credit purchase gate watches, and it is NOT
   * the account total: an account whose credits also include activity and
   * daily-login grants holds more than this.
   */
  credits?: number;
  /** False when the backend omitted the balance; absent is not zero. */
  credits_known?: boolean;
  purchased_credits?: number;
  /** The account's own credit total (the desktop client's account-menu read). */
  total_credits?: number;
  /** False when the backend omitted the total; absent is not zero. */
  total_credits_known?: boolean;
  /** The buckets behind total_credits. */
  credit_packages?: LobsteraiServerCreditPackage[];
  activity_available?: boolean;
  activity_code?: string;
  activity_template?: string;
  activity_placement?: string;
  activity_context?: Record<string, unknown>;
  /** The activity's own "already claimed today" flag. */
  claimed_today?: boolean;
  /** Days already claimed in the activity. */
  claimed_days?: number;
  /** Credits the activity granted so far. */
  claimed_credits?: number;
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** Normalize the per-bucket breakdown; entries without an amount are dropped. */
const parseCreditPackages = (value: unknown): LobsteraiServerCreditPackage[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const packages: LobsteraiServerCreditPackage[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const remaining = readNumber(entry.credits_remaining);
    if (remaining === null) continue;
    packages.push({
      type: readString(entry.type),
      label: readString(entry.label),
      label_en: readString(entry.label_en),
      credits_remaining: remaining,
      expires_at: readString(entry.expires_at),
    });
  }
  return packages.length > 0 ? packages : undefined;
};

/**
 * Normalize the management response.
 *
 * A payload with neither a plan nor a balance carries no usable information and
 * is rejected; a payload whose `credits_known` is false is kept, because the
 * plan and the activity state are still worth showing even when the balance
 * cannot be derived.
 */
export function parseLobsteraiServerQuotaPayload(
  input: unknown
): LobsteraiServerQuotaPayload | null {
  if (!isRecord(input)) return null;
  const credits = readNumber(input.credits);
  const totalCredits = readNumber(input.total_credits);
  const subscriptionStatus = readString(input.subscription_status);
  const activityCode = readString(input.activity_code);
  if (
    credits === null &&
    totalCredits === null &&
    subscriptionStatus === undefined &&
    activityCode === undefined
  ) {
    return null;
  }
  return {
    subscription_status: subscriptionStatus,
    credits: credits ?? undefined,
    // Default to unknown unless the backend explicitly reports otherwise.
    credits_known: input.credits_known === true,
    purchased_credits: readNumber(input.purchased_credits) ?? undefined,
    total_credits: totalCredits ?? undefined,
    total_credits_known: input.total_credits_known === true,
    credit_packages: parseCreditPackages(input.credit_packages),
    activity_available: input.activity_available === true,
    activity_code: activityCode,
    activity_template: readString(input.activity_template),
    activity_placement: readString(input.activity_placement),
    activity_context: isRecord(input.activity_context) ? input.activity_context : undefined,
    claimed_today: input.claimed_today === true,
    claimed_days: readNumber(input.claimed_days) ?? undefined,
    claimed_credits: readNumber(input.claimed_credits) ?? undefined,
  };
}

export const lobsteraiServerQuotaApi = {
  fetchQuota: async (authIndex: string): Promise<LobsteraiServerQuotaPayload> => {
    const response = await apiClient.get<unknown>('/lobsterai-server-quota', {
      params: { auth_index: authIndex },
    });
    const payload = parseLobsteraiServerQuotaPayload(response);
    if (!payload) {
      throw new Error('empty_data');
    }
    return payload;
  },
};
