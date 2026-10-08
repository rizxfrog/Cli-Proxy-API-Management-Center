/**
 * FloatBoat (aoe.chat) quota service.
 *
 * Unlike the bearer-token providers, FloatBoat bills through the inference
 * gateway (newapi.aoe.chat) rather than the product backend, so the balance
 * cannot be read through the generic /api-call forwarder. The proxy exposes a
 * dedicated management endpoint that resolves the credential's inference key
 * and returns the gateway's measured allowance.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Shape returned by GET /v0/management/floatboat-quota. */
export interface FloatboatQuotaPayload {
  currency?: string;
  soft_limit?: number;
  hard_limit?: number;
  used?: number;
  remaining?: number;
  /** False when either gateway billing read failed. */
  remaining_known?: boolean;
  has_payment_method?: boolean;
  has_active_subscription?: boolean;
  groups?: string[];
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Normalize the management response.
 *
 * A payload with no readable amount carries no usable information and is
 * rejected; a payload whose `remaining_known` is false is kept, because the
 * allowance ceiling and spend are still worth showing even when the balance
 * cannot be derived.
 */
export function parseFloatboatQuotaPayload(input: unknown): FloatboatQuotaPayload | null {
  if (!isRecord(input)) return null;
  const hardLimit = readNumber(input.hard_limit);
  const used = readNumber(input.used);
  if (hardLimit === null && used === null) return null;
  const groups = Array.isArray(input.groups)
    ? input.groups.filter((group): group is string => typeof group === 'string')
    : undefined;
  return {
    currency: typeof input.currency === 'string' ? input.currency : undefined,
    soft_limit: readNumber(input.soft_limit) ?? undefined,
    hard_limit: hardLimit ?? undefined,
    used: used ?? undefined,
    remaining: readNumber(input.remaining) ?? undefined,
    // Default to unknown unless the backend explicitly reports otherwise.
    remaining_known: input.remaining_known === true,
    has_payment_method: input.has_payment_method === true,
    has_active_subscription: input.has_active_subscription === true,
    groups: groups && groups.length > 0 ? groups : undefined,
  };
}

export const floatboatQuotaApi = {
  fetchQuota: async (authIndex: string): Promise<FloatboatQuotaPayload> => {
    const response = await apiClient.get<unknown>('/floatboat-quota', {
      params: { auth_index: authIndex },
    });
    const payload = parseFloatboatQuotaPayload(response);
    if (!payload) {
      throw new Error('empty_data');
    }
    return payload;
  },
};
