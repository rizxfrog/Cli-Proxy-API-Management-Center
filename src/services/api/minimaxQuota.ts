/**
 * MiniMax Code coding-plan quota (配额) service.
 *
 * The plan meters a 5-hour rolling window and a weekly window. The probe is a
 * plain bearer-token read against the MiniMax open-platform origin, but it is
 * deliberately not routed through the generic /api-call forwarder: the proxy
 * exposes a dedicated management endpoint that resolves the credential by
 * auth_index, refreshes a stale access token once, and merges the account
 * membership tier with the coding-plan windows.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Window kind, mirroring the backend's MinimaxQuotaWindow.Kind. */
export type MinimaxQuotaWindowKind = 'five_hour' | 'weekly';

/** One rate-limit window returned by GET /v0/management/minimax-quota. */
export interface MinimaxQuotaWindowPayload {
  kind?: MinimaxQuotaWindowKind;
  remaining_percent?: number;
  reset_at_ms?: number;
  unlimited?: boolean;
}

/** Shape returned by GET /v0/management/minimax-quota. */
export interface MinimaxQuotaPayload {
  plan?: string;
  has_token_plan?: boolean;
  not_subscribed?: boolean;
  expires_at_ms?: number;
  credit_balance?: string;
  windows: MinimaxQuotaWindowPayload[];
}

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const WINDOW_KINDS: readonly MinimaxQuotaWindowKind[] = ['five_hour', 'weekly'];

const readKind = (value: unknown): MinimaxQuotaWindowKind | undefined => {
  const raw = readString(value);
  if (!raw) return undefined;
  return (WINDOW_KINDS as readonly string[]).includes(raw)
    ? (raw as MinimaxQuotaWindowKind)
    : undefined;
};

function parseWindow(input: unknown): MinimaxQuotaWindowPayload | null {
  if (!isRecord(input)) return null;
  // The backend only emits the canonical kinds; an unrecognized kind cannot be
  // labeled and is dropped rather than rendered as a generic meter.
  const kind = readKind(input.kind);
  if (!kind) return null;
  const unlimited = input.unlimited === true;
  const remaining = readNumber(input.remaining_percent);
  const resetAt = readNumber(input.reset_at_ms);
  // A bounded window needs a percentage; an unlimited window needs neither.
  if (!unlimited && remaining === null) return null;
  if (unlimited && remaining === null && resetAt === null) return null;
  return {
    kind,
    remaining_percent: remaining ?? undefined,
    reset_at_ms: resetAt ?? undefined,
    unlimited,
  };
}

/**
 * Normalize the management response, tolerating numeric strings and explicit
 * nulls. Windows the upstream did not report are dropped here and re-added with
 * a default order by the data layer.
 */
export function parseMinimaxQuotaPayload(input: unknown): MinimaxQuotaPayload | null {
  if (!isRecord(input)) return null;
  const windows: MinimaxQuotaWindowPayload[] = [];
  if (Array.isArray(input.windows)) {
    for (const entry of input.windows) {
      const window = parseWindow(entry);
      if (window) windows.push(window);
    }
  }
  return {
    plan: readString(input.plan),
    has_token_plan: typeof input.has_token_plan === 'boolean' ? input.has_token_plan : undefined,
    not_subscribed: input.not_subscribed === true,
    expires_at_ms: readNumber(input.expires_at_ms) ?? undefined,
    credit_balance: readString(input.credit_balance),
    windows,
  };
}

export const minimaxQuotaApi = {
  fetchQuota: async (authIndex: string): Promise<MinimaxQuotaPayload> => {
    const response = await apiClient.get<unknown>('/minimax-quota', {
      params: { auth_index: authIndex },
    });
    const payload = parseMinimaxQuotaPayload(response);
    if (!payload) {
      throw new Error('empty_data');
    }
    return payload;
  },
};
