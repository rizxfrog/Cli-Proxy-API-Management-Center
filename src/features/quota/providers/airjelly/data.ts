import type { TFunction } from 'i18next';
import type { AuthFileItem, AirJellyQuotaState } from '@/types';
import { airJellyApi, type AirJellyQuotaPayload } from '@/services/api/airjelly';
import { isAirJellyFile, isDisabledAuthFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

type AirJellyQuotaData = Omit<AirJellyQuotaPayload, 'status'> & { subscriptionStatus: string };

const fetchQuota = async (file: AuthFileItem, t: TFunction): Promise<AirJellyQuotaData> => {
  const index = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
  if (!index) throw new Error(t('airjelly_quota.missing_auth_index'));
  const data = await airJellyApi.fetchQuota(index);
  if (!Number.isFinite(data.totalRemaining) || !Number.isFinite(data.dailyRemaining)) {
    throw new Error(t('airjelly_quota.empty_data'));
  }
  const { status, ...quota } = data;
  return { ...quota, subscriptionStatus: status };
};

export const AIRJELLY_CONFIG: QuotaProviderData<AirJellyQuotaState, AirJellyQuotaData> = {
  type: 'airjelly',
  i18nPrefix: 'airjelly_quota',
  filterFn: (file) => isAirJellyFile(file) && !isDisabledAuthFile(file),
  fetchQuota,
  storeSelector: (state) => state.airJellyQuota,
  storeSetter: 'setAirJellyQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({ status: 'error', error: message, errorStatus: status }),
};
