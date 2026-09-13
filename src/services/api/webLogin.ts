import { apiClient } from './client';

export type WebLoginMethod = 'cookie' | 'password' | 'token';
export type WebLoginRequest =
  | { method: 'cookie'; cookie: string }
  | { method: 'password'; email: string; password: string }
  | { method: 'token'; token: string };

export interface WebLoginResult {
  status: 'ok';
  provider: string;
  id: string;
}

export const webLoginApi = {
  login: (provider: string, request: WebLoginRequest, signal?: AbortSignal) =>
    apiClient.post<WebLoginResult>(`/web-login/${encodeURIComponent(provider)}`, request, {
      signal,
      timeout: 65_000,
    }),
};
