/**
 * TRAE SOLO CN credits data layer.
 * React-free / SCSS-free -- consumed directly by tests/traeQuota.test.ts.
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, TraeQuotaState } from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import {
  TRAE_USAGE_URL,
  TRAE_USAGE_BODY,
  TRAE_REQUEST_HEADERS,
  parseTraeUsagePayload,
  buildTraeQuotaRows,
  createStatusError,
  isTraeFile,
  isDisabledAuthFile,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type TraeQuotaData = {
  plan: string | null;
  rows: ReturnType<typeof buildTraeQuotaRows>;
};

const fetchTraeQuota = async (file: AuthFileItem, t: TFunction): Promise<TraeQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('trae_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: TRAE_USAGE_URL,
    header: { ...TRAE_REQUEST_HEADERS },
    data: TRAE_USAGE_BODY,
  });

  if (result.statusCode === 401 || result.statusCode === 403) {
    throw createStatusError(t('trae_quota.invalid_credential'), result.statusCode);
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseTraeUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('trae_quota.empty_data'));
  }
  if (typeof payload.code === 'number' && payload.code !== 0) {
    throw new Error(
      payload.message
        ? `${t('trae_quota.quota_error')}: ${payload.message}`
        : t('trae_quota.quota_error')
    );
  }

  const rows = buildTraeQuotaRows(payload);
  if (rows.length === 0) {
    throw new Error(t('trae_quota.no_package'));
  }

  const plan = payload.is_credits_billing ? t('trae_quota.plan_credits') : null;

  return { plan, rows };
};

export const TRAE_CONFIG: QuotaProviderData<TraeQuotaState, TraeQuotaData> = {
  type: 'trae',
  i18nPrefix: 'trae_quota',
  filterFn: (file) => isTraeFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchTraeQuota,
  storeSelector: (state) => state.traeQuota,
  storeSetter: 'setTraeQuota',
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
