/**
 * FloatBoat (aoe.chat) quota data layer.
 * React-free / SCSS-free -- consumed directly by tests.
 *
 * FloatBoat bills through its inference gateway (newapi.aoe.chat) rather than
 * the product backend, so the balance comes from the proxy's dedicated
 * /floatboat-quota endpoint: it resolves the credential's inference key and
 * returns the gateway's own billing reads.
 *
 * Three quantities are deliberately kept apart and must not be conflated:
 *   1. this measured allowance (the gateway's subscription + usage reads),
 *   2. the credential's login-time snapshot (`has_active_subscription`), which
 *      is not refreshed with usage, and
 *   3. scheduler cooldown, which is local routing state and not a balance.
 *
 * A balance the gateway did not report stays unknown: `remainingKnown` is false
 * and the meter renders an uncoloured track rather than zero or "unlimited".
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, FloatboatQuotaState } from '@/types';
import {
  floatboatQuotaApi,
  type FloatboatQuotaPayload,
} from '@/services/api/floatboatQuota';
import { isFloatboatFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type FloatboatQuotaData = {
  currency: string;
  hardLimit: number;
  used: number;
  remaining: number;
  remainingKnown: boolean;
  hasActiveSubscription: boolean;
  groups: string[];
};

const statusOf = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status: unknown = error.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

/**
 * Map the management payload to the view model.
 *
 * `remaining_known` is honoured rather than inferred from the amounts: the
 * backend clears it when either gateway read fails, and fabrication here would
 * show a healthy balance for a credential that was never measured.
 */
export function buildFloatboatQuotaData(payload: FloatboatQuotaPayload): FloatboatQuotaData {
  return {
    currency: (payload.currency ?? 'USD').trim() || 'USD',
    hardLimit: payload.hard_limit ?? 0,
    used: payload.used ?? 0,
    remaining: payload.remaining ?? 0,
    remainingKnown: payload.remaining_known === true,
    hasActiveSubscription: payload.has_active_subscription === true,
    groups: payload.groups ?? [],
  };
}

const fetchFloatboatQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<FloatboatQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('floatboat_quota.missing_auth_index'));
  }

  try {
    return buildFloatboatQuotaData(await floatboatQuotaApi.fetchQuota(authIndex));
  } catch (error: unknown) {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      const err = new Error(t('floatboat_quota.invalid_credential')) as Error & { status?: number };
      err.status = status;
      throw err;
    }
    const message =
      error instanceof Error && error.message ? error.message : t('floatboat_quota.quota_error');
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }
};

export const FLOATBOAT_CONFIG: QuotaProviderData<FloatboatQuotaState, FloatboatQuotaData> = {
  type: 'floatboat',
  i18nPrefix: 'floatboat_quota',
  filterFn: (file) => isFloatboatFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchFloatboatQuota,
  storeSelector: (state) => state.floatboatQuota,
  storeSetter: 'setFloatboatQuota',
  buildLoadingState: () => ({ status: 'loading', remainingKnown: false }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    remainingKnown: false,
    error: message,
    errorStatus: status,
  }),
};
