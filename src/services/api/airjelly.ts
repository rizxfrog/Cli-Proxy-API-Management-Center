import { apiClient } from './client';

export interface AirJellyQuotaPayload {
  plan: string;
  status: string;
  dailyRemaining: number;
  dailyUsed: number;
  dailyLimit: number;
  monthlyRemaining: number;
  monthlyLimit: number;
  monthlyPeriodEnd?: string;
  permanentRemaining: number;
  totalRemaining: number;
}

export const airJellyApi = {
  startOAuth: () => apiClient.post<{ state: string; url: string; callback: string }>('/airjelly/oauth/start', {}),
  completeOAuth: (state: string, callbackUrl: string) =>
    apiClient.post('/airjelly/oauth/complete', { state, callback_url: callbackUrl }),
  login: (email: string, password: string) =>
    apiClient.post('/airjelly/login', { email, password }),
  signup: (email: string, password: string) =>
    apiClient.post<{ status: 'ok' | 'confirmation_required' }>('/airjelly/signup', { email, password }),
  verifySignup: (email: string, code: string) =>
    apiClient.post('/airjelly/signup/verify', { email, code }),
  resendSignupCode: (email: string) =>
    apiClient.post('/airjelly/signup/resend', { email }),
  fetchQuota: (authIndex: string) =>
    apiClient.get<AirJellyQuotaPayload>('/airjelly-quota', { params: { auth_index: authIndex } }),
};
