/**
 * Qoder credits data layer (CN + international Qoder AI).
 * React-free / SCSS-free -- consumed directly by tests.
 *
 * The ledger comes from the proxy's dedicated /qoder-cn-quota (CN) or
 * /qoder-ai-quota (international) endpoint, which resolves the credential,
 * refreshes a stale access token once, and merges GET /api/v2/quota/usage (the
 * credit buckets) with GET /api/v3/user/status (the plan tier and reset
 * instant). Both environments return the same payload shape.
 *
 * An account's credits are split across buckets, so a card carries more than one
 * meter. The official client renders the plan allowance (套餐内 Credits) above the
 * resource packs (资源包); the same order is preserved here.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, QoderCNQuotaRow, QoderCNQuotaState } from '@/types';
import {
  qoderCnQuotaApi,
  type QoderCNQuotaPayload,
  type QoderCNQuotaRowKind,
} from '@/services/api/qoderCnQuota';
import { isQoderCNFile, isQoderAIFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type QoderCNQuotaData = {
  plan: string | null;
  unit: string | null;
  exhausted: boolean;
  rows: QoderCNQuotaRow[];
};

const statusOf = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

/** i18n key for a bucket's row label. */
export const qoderCNRowLabelKey = (kind: QoderCNQuotaRowKind): string =>
  `qodercn_quota.row.${kind}`;

/**
 * Build the usage meters from the ledger payload.
 *
 * `reset_at` on the plan row is the next quota reset; a pack's `expires_at` is its
 * own deadline. A zero-total bucket is still rendered: an exhausted account is a
 * real observation (the screenshot shows `0 / 0` and `0 / 200`), not missing data,
 * and hiding it would make the card look like a load failure.
 */
export function buildQoderCNQuotaRows(
  payload: QoderCNQuotaPayload,
  t: TFunction
): QoderCNQuotaRow[] {
  const payloadResetAt = payload.reset_at && payload.reset_at > 0 ? payload.reset_at : null;
  return payload.rows.map((row, index) => {
    const kind: QoderCNQuotaRowKind = row.kind ?? 'plan';
    const total = row.total ?? 0;
    const used = row.used ?? Math.max(0, total - (row.remaining ?? 0));
    // The plan reset can also arrive at the payload level (an older proxy that
    // never stamped the row), so the row value wins but the payload is a fallback.
    const rowResetAt = row.reset_at && row.reset_at > 0 ? row.reset_at : null;
    const resetAtMs = kind === 'plan' ? (rowResetAt ?? payloadResetAt) : rowResetAt;
    const expiresAtMs = row.expires_at && row.expires_at > 0 ? row.expires_at : null;
    // A named pack shows its upstream name; otherwise the bucket kind is localized.
    const named = row.name?.trim();
    const label = named && named !== '' ? named : t(qoderCNRowLabelKey(kind));

    return {
      id: row.id?.trim() || `${kind}-${index}`,
      kind,
      name: named || undefined,
      label,
      used,
      total,
      resetAtMs,
      expiresAtMs,
    };
  });
}

/** Display label for the plan chip: the user tag wins, then the tier id. */
export function qoderCNPlanLabel(payload: QoderCNQuotaPayload): string | null {
  const label = payload.plan?.trim() || payload.plan_tier?.trim() || '';
  return label === '' ? null : label;
}

/** Pick the payload's denomination, defaulting to credits. */
export function qoderCNUnit(payload: QoderCNQuotaPayload): string {
  for (const candidate of [payload.unit, ...payload.rows.map((row) => row.unit)]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return 'credits';
}

const fetchQoderCNQuota = async (file: AuthFileItem, t: TFunction): Promise<QoderCNQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('qodercn_quota.missing_auth_index'));
  }

  const kind: 'cn' | 'ai' = isQoderAIFile(file) ? 'ai' : 'cn';

  let payload: QoderCNQuotaPayload;
  try {
    payload = await qoderCnQuotaApi.fetchQuota(authIndex, kind);
  } catch (error: unknown) {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      const err = new Error(t('qodercn_quota.invalid_credential')) as Error & { status?: number };
      err.status = status;
      throw err;
    }
    const message =
      error instanceof Error && error.message ? error.message : t('qodercn_quota.quota_error');
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }

  const rows = buildQoderCNQuotaRows(payload, t);
  if (rows.length === 0) {
    throw new Error(t('qodercn_quota.empty_data'));
  }

  return {
    plan: qoderCNPlanLabel(payload),
    unit: qoderCNUnit(payload),
    exhausted: payload.is_quota_exceeded === true,
    rows,
  };
};

export const QODERCN_CONFIG: QuotaProviderData<QoderCNQuotaState, QoderCNQuotaData> = {
  type: 'qodercn',
  i18nPrefix: 'qodercn_quota',
  filterFn: (file) => (isQoderCNFile(file) || isQoderAIFile(file)) && !isDisabledAuthFile(file),
  fetchQuota: fetchQoderCNQuota,
  storeSelector: (state) => state.qoderCNQuota,
  storeSetter: 'setQoderCNQuota',
  buildLoadingState: () => ({
    status: 'loading',
    rows: [],
    plan: null,
    unit: null,
    exhausted: false,
  }),
  buildSuccessState: (data) => ({
    status: 'success',
    rows: data.rows,
    plan: data.plan,
    unit: data.unit,
    exhausted: data.exhausted,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    plan: null,
    unit: null,
    exhausted: false,
    error: message,
    errorStatus: status,
  }),
};
