/**
 * Dumate (百度搭子) quota data layer.
 * React-free / SCSS-free -- consumed directly by tests.
 *
 * The wallet is measured in points and lives on the Baidu Cloud console, so the
 * read needs the console cookie stored in the credential; a credential exported
 * without it fails with a clear message instead of reporting an empty balance.
 *
 * Two bucket families are reported: the plan subscription and every granted or
 * event bonus. The console's remaining package types have no observed sample, so
 * they are not given a row here. This snapshot is neither usage accounting nor
 * scheduler cooldown: a healthy balance does not prove the credential is routable.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, DumateQuotaState } from '@/types';
import { dumateQuotaApi, type DumateQuotaPayload } from '@/services/api/dumateQuota';
import { isDumateFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type DumateQuotaData = {
  availablePoints: number;
  usedPoints: number;
  subscriptionPoints: number;
  bonusPoints: number;
  isSubscribed: boolean;
  throttled: boolean;
  throttleReason: string;
  /** Absent when no active bucket reported an expiry. */
  expiresAt?: number;
};

const toPoints = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Map the management payload to the view model. */
export function buildDumateQuotaData(payload: DumateQuotaPayload): DumateQuotaData {
  return {
    availablePoints: toPoints(payload.available_points),
    usedPoints: toPoints(payload.used_points),
    subscriptionPoints: toPoints(payload.subscription_points),
    bonusPoints: toPoints(payload.bonus_points),
    isSubscribed: payload.is_subscribed,
    throttled: payload.throttled,
    throttleReason: payload.throttled ? (payload.throttle_reason ?? '') : '',
    ...(payload.expires_at > 0 ? { expiresAt: payload.expires_at } : {}),
  };
}

const statusOf = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'status' in error) {
    const status: unknown = error.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

const fetchDumateQuota = async (file: AuthFileItem, t: TFunction): Promise<DumateQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('dumate_quota.missing_auth_index'));
  }

  try {
    return buildDumateQuotaData(await dumateQuotaApi.fetchQuota(authIndex));
  } catch (error: unknown) {
    const status = statusOf(error);
    if (status === 401 || status === 403) {
      const err = new Error(t('dumate_quota.invalid_credential')) as Error & { status?: number };
      err.status = status;
      throw err;
    }
    const message =
      error instanceof Error && error.message ? error.message : t('dumate_quota.quota_error');
    const err = new Error(message) as Error & { status?: number };
    err.status = status;
    throw err;
  }
};

export const DUMATE_CONFIG: QuotaProviderData<DumateQuotaState, DumateQuotaData> = {
  type: 'dumate',
  i18nPrefix: 'dumate_quota',
  filterFn: (file) => isDumateFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchDumateQuota,
  storeSelector: (state) => state.dumateQuota,
  storeSetter: 'setDumateQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    error: message,
    errorStatus: status,
  }),
};
