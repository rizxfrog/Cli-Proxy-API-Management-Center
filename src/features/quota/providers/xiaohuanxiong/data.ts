import type { TFunction } from 'i18next';
import type { AuthFileItem, XiaohuanxiongQuotaState } from '@/types';
import {
  xiaohuanxiongQuotaApi,
  type XiaohuanxiongQuotaPayload,
} from '@/services/api/xiaohuanxiongQuota';
import { isDisabledAuthFile, isXiaohuanxiongFile } from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

const fetchQuota = async (file: AuthFileItem, t: TFunction): Promise<XiaohuanxiongQuotaPayload> => {
  const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
  if (!authIndex) throw new Error(t('xiaohuanxiong_quota.missing_auth_index'));
  try {
    return await xiaohuanxiongQuotaApi.fetchQuota(authIndex);
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object' && 'status' in error && typeof error.status === 'number'
        ? error.status
        : undefined;
    const message =
      status === 401 || status === 403
        ? t('xiaohuanxiong_quota.invalid_credential')
        : error instanceof Error && error.message
          ? error.message
          : t('xiaohuanxiong_quota.quota_error');
    const wrapped = new Error(message) as Error & { status?: number };
    wrapped.status = status;
    throw wrapped;
  }
};

export const XIAOHUANXIONG_CONFIG: QuotaProviderData<
  XiaohuanxiongQuotaState,
  XiaohuanxiongQuotaPayload
> = {
  type: 'xiaohuanxiong',
  i18nPrefix: 'xiaohuanxiong_quota',
  filterFn: (file) => isXiaohuanxiongFile(file) && !isDisabledAuthFile(file),
  fetchQuota,
  storeSelector: (state) => state.xiaohuanxiongQuota,
  storeSetter: 'setXiaohuanxiongQuota',
  buildLoadingState: () => ({ status: 'loading' }),
  buildSuccessState: (data) => ({ status: 'success', ...data }),
  buildErrorState: (message, status) => ({
    status: 'error',
    error: message,
    errorStatus: status,
  }),
};
