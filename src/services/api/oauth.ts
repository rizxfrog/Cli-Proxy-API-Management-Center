/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';
import {
  isManagementOAuthProviderKey,
  normalizeManagementOAuthProviderKey,
} from '@/utils/providerKeys';

export type BuiltInOAuthProvider =
  | 'codex'
  | 'anthropic'
  | 'antigravity'
  | 'kimi'
  | 'codebuddy-cn'
  | 'codebuddy-ai'
  | 'qoder-cn'
  | 'qoder-ai'
  | 'xai'
  | 'trae'
  | 'devin'
  | 'xiaohuanxiong'
  | 'codearts'
  | 'meta';

export interface OAuthStartResponse {
  url: string;
  state?: string;
  machine?: string;
  device?: string;
  user_code?: string;
  flow?: string;
  expires_in?: number;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

export interface OAuthCancelResponse {
  status: 'ok';
  cancelled: boolean;
}

const WEBUI_SUPPORTED = new Set<string>(['codex', 'anthropic', 'antigravity', 'xai', 'devin']);

const normalizeProviderForManagementPath = (provider: string): string => {
  const key = normalizeManagementOAuthProviderKey(provider);
  if (!isManagementOAuthProviderKey(key)) {
    throw new Error('Invalid OAuth provider');
  }
  return key;
};

export const oauthApi = {
  startAuth: (provider: string, signal?: AbortSignal) => {
    const providerKey = normalizeProviderForManagementPath(provider);
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.has(providerKey)) {
      params.is_webui = true;
    }
    return apiClient.get<OAuthStartResponse>(`/${providerKey}-auth-url`, {
      params: Object.keys(params).length ? params : undefined,
      ...(signal ? { signal } : {}),
    });
  },

  getAuthStatus: (state: string, signal?: AbortSignal) =>
    apiClient.get<{ status: 'ok' | 'wait' | 'error'; error?: string }>(`/get-auth-status`, {
      params: { state },
      ...(signal ? { signal } : {}),
    }),

  cancelSession: (state: string, signal?: AbortSignal) =>
    apiClient.delete<OAuthCancelResponse>('/oauth-session', {
      params: { state },
      ...(signal ? { signal } : {}),
    }),

  submitCallback: (provider: string, redirectUrl: string, signal?: AbortSignal) => {
    const providerKey = normalizeProviderForManagementPath(provider);
    return apiClient.post<OAuthCallbackResponse>(
      '/oauth-callback',
      { provider: providerKey, redirect_url: redirectUrl },
      signal ? { signal } : undefined
    );
  },

  /**
   * Xiaohuanxiong redirects to an office-raccoon:// deep link that carries only
   * a one-time code and no state, so the shared /oauth-callback contract (which
   * requires state) cannot be used. The dedicated endpoint re-associates the
   * callback with the pending session server-side and accepts the full deep
   * link, an https callback, or a bare authorization code.
   */
  submitXiaohuanxiongCallback: (state: string, redirectUrl: string, signal?: AbortSignal) =>
    apiClient.post<OAuthCallbackResponse>(
      '/xiaohuanxiong-auth-callback',
      { state, redirect_url: redirectUrl },
      signal ? { signal } : undefined
    ),

  /**
   * TRAE has no device-code endpoint and forces a 127.0.0.1 loopback callback,
   * so its callback is submitted through a dedicated endpoint that parses the
   * full browser URL (refreshToken / userInfo / userJwt) server-side.
   */
  submitTraeCallback: (state: string, redirectUrl: string, machineId?: string, deviceId?: string) =>
    apiClient.post<{ status: 'ok'; uid?: string; path?: string }>('/trae-auth-callback', {
      state,
      redirect_url: redirectUrl,
      machine_id: machineId,
      device_id: deviceId,
    }),

  /**
   * CodeArts redirects to a loopback URL (http://127.0.0.1:<port>/oauth/callback)
   * rather than a deep link, so the proxy never receives the authorization code
   * directly. The dedicated endpoint binds the pasted callback to the pending
   * session server-side and accepts the full callback URL or a bare code.
   */
  submitCodeArtsCallback: (state: string, redirectUrl: string, signal?: AbortSignal) =>
    apiClient.post<OAuthCallbackResponse>(
      '/codearts-auth-callback',
      { state, redirect_url: redirectUrl },
      signal ? { signal } : undefined
    ),
};
