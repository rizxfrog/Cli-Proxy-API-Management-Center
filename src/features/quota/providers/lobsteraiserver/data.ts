/**
 * LobsterAI (NetEase/Youdao) quota data layer.
 * React-free / SCSS-free -- consumed directly by tests.
 *
 * The backend reports two credit reads plus the state of its daily check-in
 * activity through the proxy's dedicated /lobsterai-server-quota endpoint. They
 * are kept apart because they answer different questions:
 *   1. `credits` -- the free-tier bucket from /api/user/quota, which the desktop
 *      client's low-credit purchase gate watches;
 *   2. `totalCredits` -- the account's own total from /api/user/profile-summary,
 *      which is what the client's account menu renders, with `creditPackages`
 *      as its breakdown;
 *   3. usage accounting (tokens for a single request) and scheduler cooldown
 *      (local routing state) are separate concerns and not balances at all.
 *
 * Reading only (1) understates an account whose credits also include activity
 * and daily-login grants, which live in (2) -- the two must not be conflated.
 * A balance the backend did not report stays unknown: its `*Known` flag is false
 * and the card renders "--" rather than zero or "unlimited".
 */

import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  LobsteraiServerCreditPackage,
  LobsteraiServerQuotaState,
  LobsteraiServerQuotaActivity,
} from '@/types';
import {
  lobsteraiServerQuotaApi,
  type LobsteraiServerQuotaPayload,
} from '@/services/api/lobsteraiServerQuota';
import { isLobsteraiServerFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type LobsteraiServerQuotaData = {
  subscriptionStatus: string;
  credits: number;
  creditsKnown: boolean;
  purchasedCredits: number;
  totalCredits: number;
  totalCreditsKnown: boolean;
  creditPackages: LobsteraiServerCreditPackage[];
  activity: LobsteraiServerQuotaActivity;
};

/**
 * Map the management payload to the view model.
 *
 * The `*_known` flags are honoured rather than inferred from the amount: the
 * backend omits them when the account has no measured value, and fabrication
 * here would show a healthy balance for an account that was never measured.
 */
export function buildLobsteraiServerQuotaData(
  payload: LobsteraiServerQuotaPayload
): LobsteraiServerQuotaData {
  return {
    subscriptionStatus: (payload.subscription_status ?? '').trim(),
    credits: payload.credits ?? 0,
    creditsKnown: payload.credits_known === true,
    purchasedCredits: payload.purchased_credits ?? 0,
    totalCredits: payload.total_credits ?? 0,
    totalCreditsKnown: payload.total_credits_known === true,
    creditPackages: (payload.credit_packages ?? []).map((item) => ({
      type: item.type,
      label: item.label,
      labelEn: item.label_en,
      creditsRemaining: item.credits_remaining,
      expiresAt: item.expires_at,
    })),
    activity: {
      available: payload.activity_available === true,
      code: payload.activity_code,
      template: payload.activity_template,
      placement: payload.activity_placement,
      context: payload.activity_context,
      claimedToday: payload.claimed_today === true,
      claimedDays: payload.claimed_days,
      claimedCredits: payload.claimed_credits,
    },
  };
}

const statusOf = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status: unknown = error.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

const fetchLobsteraiServerQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<LobsteraiServerQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('lobsterai_server_quota.missing_auth_index'));
  }

  try {
    return buildLobsteraiServerQuotaData(await lobsteraiServerQuotaApi.fetchQuota(authIndex));
  } catch (error: unknown) {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      const err = new Error(t('lobsterai_server_quota.invalid_credential')) as Error & {
        status?: number;
      };
      err.status = status;
      throw err;
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('lobsterai_server_quota.quota_error');
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }
};

export const LOBSTERAI_SERVER_CONFIG: QuotaProviderData<
  LobsteraiServerQuotaState,
  LobsteraiServerQuotaData
> = {
  type: 'lobsterai-server',
  i18nPrefix: 'lobsterai_server_quota',
  filterFn: (file) => isLobsteraiServerFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchLobsteraiServerQuota,
  storeSelector: (state) => state.lobsteraiServerQuota,
  storeSetter: 'setLobsteraiServerQuota',
  buildLoadingState: () => ({ status: 'loading', creditsKnown: false }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    creditsKnown: false,
    error: message,
    errorStatus: status,
  }),
};
