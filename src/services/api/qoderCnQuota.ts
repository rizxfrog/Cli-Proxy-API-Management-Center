/**
 * Qoder CN credit ledger (配额) service.
 *
 * The ledger is a plain bearer-token read against the CN OpenAPI origin, but it
 * is deliberately not routed through the generic /api-call forwarder: the proxy
 * exposes a dedicated management endpoint that resolves the credential by
 * auth_index, refreshes a stale access token once, and merges the ledger with
 * the account plan tier.
 *
 * An account's credits are split across buckets — the plan allowance
 * (套餐内 Credits) and one or more resource packs (资源包) — so the payload carries a
 * `rows` array rather than a single scalar pair.
 *
 * Distinct from the model catalog, which is signature-gated and therefore not
 * reachable this way.
 */

import { apiClient } from './client';
import { isRecord } from '@/utils/helpers';

/** Bucket kind, mirroring the backend's QoderCNQuotaRow.Kind. */
export type QoderCNQuotaRowKind = 'plan' | 'addon' | 'org' | 'pack';

/** One credit meter returned by GET /v0/management/qoder-cn-quota. */
export interface QoderCNQuotaRowPayload {
  kind?: QoderCNQuotaRowKind;
  id?: string;
  name?: string;
  total?: number;
  used?: number;
  remaining?: number;
  unit?: string;
  reset_at?: number;
  expires_at?: number;
  available?: boolean;
  status?: string;
}

/** Shape returned by GET /v0/management/qoder-cn-quota. */
export interface QoderCNQuotaPayload {
  plan?: string;
  plan_tier?: string;
  usage_type?: string;
  unit?: string;
  is_quota_exceeded?: boolean;
  reset_at?: number;
  expires_at?: number;
  rows: QoderCNQuotaRowPayload[];
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

const ROW_KINDS: readonly QoderCNQuotaRowKind[] = ['plan', 'addon', 'org', 'pack'];

const readKind = (value: unknown): QoderCNQuotaRowKind | undefined => {
  const raw = readString(value);
  if (!raw) return undefined;
  return (ROW_KINDS as readonly string[]).includes(raw) ? (raw as QoderCNQuotaRowKind) : undefined;
};

/** Normalize one meter, dropping rows that carry no numeric ledger at all. */
function parseRow(input: unknown): QoderCNQuotaRowPayload | null {
  if (!isRecord(input)) return null;
  const total = readNumber(input.total);
  const used = readNumber(input.used);
  const remaining = readNumber(input.remaining);
  if (total === null && used === null && remaining === null) return null;
  const available = input.available;
  return {
    kind: readKind(input.kind),
    id: readString(input.id),
    name: readString(input.name),
    total: total ?? undefined,
    used: used ?? undefined,
    remaining: remaining ?? undefined,
    unit: readString(input.unit),
    reset_at: readNumber(input.reset_at) ?? undefined,
    expires_at: readNumber(input.expires_at) ?? undefined,
    available: typeof available === 'boolean' ? available : undefined,
    status: readString(input.status),
  };
}

/**
 * Normalize the management response, tolerating numeric strings and the
 * explicit-null members a merged payload can carry.
 *
 * A payload with no usable meter at all is rejected so the card surfaces an
 * error instead of a misleading zeroed meter. An all-zero ledger, by contrast,
 * is a real observation (an exhausted free account) and is preserved.
 *
 * A flat `total`/`used`/`remaining` payload — an older proxy that reported only
 * the plan allowance — is folded into a single `plan` row so the card still
 * renders against it.
 */
export function parseQoderCNQuotaPayload(input: unknown): QoderCNQuotaPayload | null {
  if (!isRecord(input)) return null;

  const rows: QoderCNQuotaRowPayload[] = [];
  if (Array.isArray(input.rows)) {
    for (const entry of input.rows) {
      const row = parseRow(entry);
      if (row) rows.push(row);
    }
  }

  if (rows.length === 0) {
    // Legacy flat shape: treat the scalars as the plan allowance.
    const legacy = parseRow({
      kind: 'plan',
      id: 'plan',
      total: input.total,
      used: input.used,
      remaining: input.remaining,
      unit: input.unit,
      reset_at: input.reset_at,
    });
    if (!legacy) return null;
    rows.push({ ...legacy, kind: 'plan', id: 'plan' });
  }

  return {
    plan: readString(input.plan),
    plan_tier: readString(input.plan_tier),
    usage_type: readString(input.usage_type),
    unit: readString(input.unit),
    is_quota_exceeded: input.is_quota_exceeded === true,
    reset_at: readNumber(input.reset_at) ?? undefined,
    expires_at: readNumber(input.expires_at) ?? undefined,
    rows,
  };
}

export const qoderCnQuotaApi = {
  fetchQuota: async (authIndex: string, kind: 'cn' | 'ai' = 'cn'): Promise<QoderCNQuotaPayload> => {
    const path = kind === 'ai' ? '/qoder-ai-quota' : '/qoder-cn-quota';
    const response = await apiClient.get<unknown>(path, {
      params: { auth_index: authIndex },
    });
    const payload = parseQoderCNQuotaPayload(response);
    if (!payload) {
      throw new Error('empty_data');
    }
    return payload;
  },
};
