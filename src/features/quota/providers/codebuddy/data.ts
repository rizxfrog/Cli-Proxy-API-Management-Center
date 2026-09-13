/**
 * CodeBuddy 额度数据层：Tencent billing-meter 计费端点。
 * 同时覆盖中国版（copilot.tencent.com）与国际版（www.codebuddy.ai），
 * 两者为同一套 /v2 REST 协议，仅 host 与鉴权域名不同。
 * React-free / SCSS-free —— 由 tests/codebuddyQuota.test.ts 直接消费。
 */

import type { TFunction } from 'i18next';
import type { AuthFileItem, CodeBuddyQuotaRow, CodeBuddyQuotaState } from '@/types';
import { apiCallApi, getApiCallErrorMessage } from '@/services/api';
import {
  CODEBUDDY_USAGE_URL,
  CODEBUDDY_REQUEST_HEADERS,
  CODEBUDDY_AI_USAGE_URL,
  CODEBUDDY_AI_REQUEST_HEADERS,
  parseCodeBuddyUsagePayload,
  buildCodeBuddyQuotaRows,
  createStatusError,
  isCodeBuddyFile,
  isCodeBuddyAiFile,
  isDisabledAuthFile,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/authIndex';
import type { QuotaProviderData } from '../types';

export type CodeBuddyQuotaData = {
  plan: string | null;
  rows: CodeBuddyQuotaRow[];
};

const fetchCodeBuddyQuota = async (file: AuthFileItem, t: TFunction): Promise<CodeBuddyQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codebuddy_quota.missing_auth_index'));
  }

  const isInternational = isCodeBuddyAiFile(file);

  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: isInternational ? CODEBUDDY_AI_USAGE_URL : CODEBUDDY_USAGE_URL,
    header: { ...(isInternational ? CODEBUDDY_AI_REQUEST_HEADERS : CODEBUDDY_REQUEST_HEADERS) },
    data: '{}',
  });

  if (result.statusCode === 401 || result.statusCode === 403) {
    throw createStatusError(t('codebuddy_quota.invalid_credential'), result.statusCode);
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseCodeBuddyUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('codebuddy_quota.empty_data'));
  }
  if (payload.code !== 0) {
    throw new Error(
      payload.msg ? `${t('codebuddy_quota.quota_error')}: ${payload.msg}` : t('codebuddy_quota.quota_error')
    );
  }

  const accounts = payload.data?.Response?.Data?.Accounts ?? [];
  if (accounts.length === 0) {
    throw new Error(t('codebuddy_quota.no_package'));
  }

  const basePkg = accounts[0] ?? {};
  const plan =
    basePkg.PackageName || basePkg.SubProductName || (isInternational ? 'CodeBuddy AI' : 'CodeBuddy CN');

  return { plan, rows: buildCodeBuddyQuotaRows(accounts) };
};

export const CODEBUDDY_CONFIG: QuotaProviderData<CodeBuddyQuotaState, CodeBuddyQuotaData> = {
  type: 'codebuddy',
  i18nPrefix: 'codebuddy_quota',
  filterFn: (file) => isCodeBuddyFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCodeBuddyQuota,
  storeSelector: (state) => state.codebuddyQuota,
  storeSetter: 'setCodebuddyQuota',
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
