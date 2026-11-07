/**
 * Dumate (百度搭子) points wallet service.
 *
 * The wallet lives on the Baidu Cloud console and is authorized by the console
 * cookie stored in the credential, not by the local backend credential used for
 * inference. The proxy exposes a dedicated management endpoint that reads it, so
 * the card never has to reach the console from the browser.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Shape returned by GET /v8/management/dumate-quota. */
export interface DumateQuotaPayload {
  /** Decimal strings in points, passed through in the console's own units. */
  available_points: string;
  used_points: string;
  subscription_points: string;
  bonus_points: string;
  is_subscribed: boolean;
  throttled: boolean;
  throttle_reason?: string;
  throttle_type?: string;
  /** Unix seconds of the soonest bucket expiry; 0 when none is reported. */
  expires_at: number;
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readPointString = (value: unknown): string => {
  const parsed = readNumber(value);
  return parsed === null ? '0.00' : parsed.toFixed(2);
};

/**
 * Normalize the management response.
 *
 * A payload whose total cannot be read carries no usable wallet information and
 * is rejected rather than being rendered as an empty balance.
 */
export function parseDumateQuotaPayload(input: unknown): DumateQuotaPayload | null {
  if (!isRecord(input)) return null;
  if (readNumber(input.available_points) === null) return null;
  const expiresAt = readNumber(input.expires_at);
  return {
    available_points: readPointString(input.available_points),
    used_points: readPointString(input.used_points),
    subscription_points: readPointString(input.subscription_points),
    bonus_points: readPointString(input.bonus_points),
    is_subscribed: input.is_subscribed === true,
    throttled: input.throttled === true,
    throttle_reason: typeof input.throttle_reason === 'string' ? input.throttle_reason : undefined,
    throttle_type: typeof input.throttle_type === 'string' ? input.throttle_type : undefined,
    expires_at: expiresAt !== null && expiresAt > 0 ? expiresAt : 0,
  };
}

export const dumateQuotaApi = {
  fetchQuota: async (authIndex: string): Promise<DumateQuotaPayload> => {
    const response = await apiClient.get<unknown>('/dumate-quota', {
      params: { auth_index: authIndex },
    });
    const payload = parseDumateQuotaPayload(response);
    if (!payload) {
      throw new Error('empty_data');
    }
    return payload;
  },
};
