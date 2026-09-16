/**
 * CodeArts credit balance (配额) service.
 *
 * Unlike the bearer-token providers, CodeArts signs every upstream call with a
 * Huawei Cloud SDK-HMAC-SHA256 signature, so the balance request cannot go
 * through the generic /api-call forwarder. The proxy exposes a dedicated
 * management endpoint that resolves the credential, rotates the temporary
 * AK/SK/security-token triple when needed, and returns the balance.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Shape returned by GET /v0/management/codearts-quota. */
export interface CodeArtsQuotaPayload {
  channel?: string;
  total_quota?: number;
  total_balance?: number;
  used_amount?: number;
  daily_token_limit?: number;
  daily_tokens_used?: number;
  monthly_token_limit?: number;
  monthly_tokens_used?: number;
  expire_time?: number;
}

const readInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
};

/** Normalize the management response, tolerating numeric strings. */
export function parseCodeArtsQuotaPayload(input: unknown): CodeArtsQuotaPayload | null {
  if (!isRecord(input)) return null;
  const total = readInt(input.total_quota);
  const balance = readInt(input.total_balance);
  // A payload with neither quota nor balance carries no usable information.
  if (total === null && balance === null) return null;
  return {
    channel: typeof input.channel === 'string' ? input.channel : undefined,
    total_quota: total ?? undefined,
    total_balance: balance ?? undefined,
    used_amount: readInt(input.used_amount) ?? undefined,
    daily_token_limit: readInt(input.daily_token_limit) ?? undefined,
    daily_tokens_used: readInt(input.daily_tokens_used) ?? undefined,
    monthly_token_limit: readInt(input.monthly_token_limit) ?? undefined,
    monthly_tokens_used: readInt(input.monthly_tokens_used) ?? undefined,
    expire_time: readInt(input.expire_time) ?? undefined,
  };
}

export const codeArtsQuotaApi = {
  fetchQuota: async (authIndex: string): Promise<CodeArtsQuotaPayload> => {
    const response = await apiClient.get<unknown>('/codearts-quota', {
      params: { auth_index: authIndex },
    });
    const payload = parseCodeArtsQuotaPayload(response);
    if (!payload) {
      throw new Error('empty_data');
    }
    return payload;
  },
};
