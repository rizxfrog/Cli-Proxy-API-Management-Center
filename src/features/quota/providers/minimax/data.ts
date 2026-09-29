/**
 * MiniMax Code coding-plan quota data layer (international + mainland CN).
 * React-free / SCSS-free -- consumed directly by tests.
 *
 * The plan meters a 5-hour rolling window and a weekly window. Each window is a
 * remaining-percentage meter with its own reset instant; a window the plan does
 * not cap reports unlimited. The payload comes from the proxy's dedicated
 * /minimax-quota endpoint, which resolves the credential by auth_index,
 * refreshes a stale access token once, and merges the account membership tier
 * with the coding-plan windows.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, MinimaxQuotaState, MinimaxQuotaWindow } from '@/types';
import { minimaxQuotaApi, type MinimaxQuotaPayload, type MinimaxQuotaWindowKind } from '@/services/api/minimaxQuota';
import { isMinimaxFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type MinimaxQuotaData = {
  plan: string | null;
  expiresAtMs: number | null;
  creditBalance: string | null;
  notSubscribed: boolean;
  windows: MinimaxQuotaWindow[];
};

/** Display order and default period for each window kind. */
export const MINIMAX_WINDOW_ORDER: readonly MinimaxQuotaWindowKind[] = ['five_hour', 'weekly'];

const WINDOW_PERIOD_HOURS: Record<MinimaxQuotaWindowKind, number> = {
  five_hour: 5,
  weekly: 24 * 7,
};

const statusOf = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

/** i18n key for a window's row label. */
export const minimaxWindowLabelKey = (kind: MinimaxQuotaWindowKind): string =>
  `minimax_quota.window.${kind}`;

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/**
 * Build the window meters from the payload.
 *
 * The backend emits the windows in canonical order and only includes those the
 * upstream reported. Ordering here is defensive (the payload may arrive from an
 * older panel build), and a boundary window is never fabricated: a missing
 * weekly meter means the account has no weekly cap, not a 100% one.
 */
export function buildMinimaxQuotaWindows(payload: MinimaxQuotaPayload): MinimaxQuotaWindow[] {
  const byKind = new Map<MinimaxQuotaWindowKind, MinimaxQuotaWindow>();
  for (const window of payload.windows) {
    const kind = window.kind;
    if (!kind || byKind.has(kind)) continue;
    const unlimited = window.unlimited === true;
    const remaining =
      typeof window.remaining_percent === 'number' && Number.isFinite(window.remaining_percent)
        ? clampPercent(window.remaining_percent)
        : null;
    const resetAtMs =
      typeof window.reset_at_ms === 'number' && window.reset_at_ms > 0 ? window.reset_at_ms : null;
    byKind.set(kind, {
      id: kind,
      remainingPercent: unlimited ? null : remaining,
      resetAtMs,
      periodHours: WINDOW_PERIOD_HOURS[kind],
      unlimited,
    });
  }
  return MINIMAX_WINDOW_ORDER.flatMap((kind) => {
    const window = byKind.get(kind);
    return window ? [window] : [];
  });
}

const fetchMinimaxQuota = async (file: AuthFileItem, t: TFunction): Promise<MinimaxQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('minimax_quota.missing_auth_index'));
  }

  let payload: MinimaxQuotaPayload;
  try {
    payload = await minimaxQuotaApi.fetchQuota(authIndex);
  } catch (error: unknown) {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      const err = new Error(t('minimax_quota.invalid_credential')) as Error & { status?: number };
      err.status = status;
      throw err;
    }
    const message =
      error instanceof Error && error.message ? error.message : t('minimax_quota.quota_error');
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }

  const windows = buildMinimaxQuotaWindows(payload);
  const notSubscribed = payload.not_subscribed === true;
  // An unsubscribed account is a real observation, not a failure: it renders the
  // "not subscribed" state. A subscribed account must carry at least one meter.
  if (!notSubscribed && windows.length === 0) {
    throw new Error(t('minimax_quota.empty_data'));
  }

  return {
    plan: payload.plan?.trim() || null,
    expiresAtMs:
      typeof payload.expires_at_ms === 'number' && payload.expires_at_ms > 0
        ? payload.expires_at_ms
        : null,
    creditBalance: payload.credit_balance?.trim() || null,
    notSubscribed,
    windows,
  };
};

export const MINIMAX_CONFIG: QuotaProviderData<MinimaxQuotaState, MinimaxQuotaData> = {
  type: 'minimax',
  i18nPrefix: 'minimax_quota',
  filterFn: (file) => isMinimaxFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchMinimaxQuota,
  storeSelector: (state) => state.minimaxQuota,
  storeSetter: 'setMinimaxQuota',
  buildLoadingState: () => ({
    status: 'loading',
    windows: [],
    plan: null,
    expiresAtMs: null,
    creditBalance: null,
    notSubscribed: false,
  }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    plan: data.plan,
    expiresAtMs: data.expiresAtMs,
    creditBalance: data.creditBalance,
    notSubscribed: data.notSubscribed,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    plan: null,
    expiresAtMs: null,
    creditBalance: null,
    notSubscribed: false,
    error: message,
    errorStatus: status,
  }),
};
