/**
 * CodeArts credits data layer.
 * React-free / SCSS-free -- consumed directly by tests.
 *
 * The balance comes from the proxy's dedicated /codearts-quota endpoint, which
 * signs the upstream Huawei Cloud call. The payload exposes an aggregate
 * balance plus daily/monthly windows, each rendered as a usage meter.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, CodeArtsQuotaRow, CodeArtsQuotaState } from '@/types';
import { codeArtsQuotaApi, type CodeArtsQuotaPayload } from '@/services/api/codeArtsQuota';
import { isCodeArtsFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type CodeArtsQuotaData = {
  plan: string | null;
  rows: CodeArtsQuotaRow[];
};

const statusOf = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

/** Build the usage meters from the balance payload, skipping empty windows. */
export function buildCodeArtsQuotaRows(payload: CodeArtsQuotaPayload, t: TFunction): CodeArtsQuotaRow[] {
  const rows: CodeArtsQuotaRow[] = [];
  const creditsKnown = payload.credits_known === true;

  // A package with no credits granted (or all of them spent) reports zero. That
  // is a real answer from the ledger, so it still needs a row: without one the
  // page would say "no quota package found" and hide the actual state.
  if (creditsKnown || (typeof payload.total_quota === 'number' && payload.total_quota > 0)) {
    const total = payload.total_quota ?? 0;
    const used = payload.used_amount ?? Math.max(0, total - (payload.total_balance ?? 0));
    rows.push({
      id: 'total',
      label: t('codearts_quota.total_credits'),
      used,
      total,
      resetAtMs: payload.expire_time && payload.expire_time > 0 ? payload.expire_time : null,
    });
  }

  if (typeof payload.daily_token_limit === 'number' && payload.daily_token_limit > 0) {
    rows.push({
      id: 'daily',
      label: t('codearts_quota.daily_tokens'),
      used: payload.daily_tokens_used ?? 0,
      total: payload.daily_token_limit,
      resetAtMs: null,
    });
  }

  if (typeof payload.monthly_token_limit === 'number' && payload.monthly_token_limit > 0) {
    rows.push({
      id: 'monthly',
      label: t('codearts_quota.monthly_tokens'),
      used: payload.monthly_tokens_used ?? 0,
      total: payload.monthly_token_limit,
      resetAtMs: null,
    });
  }

  return rows;
}

const fetchCodeArtsQuota = async (file: AuthFileItem, t: TFunction): Promise<CodeArtsQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codearts_quota.missing_auth_index'));
  }

  let payload: CodeArtsQuotaPayload;
  try {
    payload = await codeArtsQuotaApi.fetchQuota(authIndex);
  } catch (error: unknown) {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      const err = new Error(t('codearts_quota.invalid_credential')) as Error & { status?: number };
      err.status = status;
      throw err;
    }
    const message = error instanceof Error && error.message ? error.message : t('codearts_quota.quota_error');
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }

  const rows = buildCodeArtsQuotaRows(payload, t);
  if (rows.length === 0) {
    throw new Error(t('codearts_quota.no_package'));
  }

  // The ledger reports which subscription the credits belong to; showing it is
  // more useful than a generic label, and it explains an all-zero balance.
  const plan = payload.package ?? (payload.credits_known ? null : t('codearts_quota.plan_credits'));
  return { plan, rows };
};

export const CODEARTS_CONFIG: QuotaProviderData<CodeArtsQuotaState, CodeArtsQuotaData> = {
  type: 'codearts',
  i18nPrefix: 'codearts_quota',
  filterFn: (file) => isCodeArtsFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCodeArtsQuota,
  storeSelector: (state) => state.codeArtsQuota,
  storeSetter: 'setCodeArtsQuota',
  buildLoadingState: () => ({ status: 'loading', rows: [], plan: null }),
  buildSuccessState: (data) => ({ status: 'success', rows: data.rows, plan: data.plan }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    plan: null,
    error: message,
    errorStatus: status,
  }),
};
