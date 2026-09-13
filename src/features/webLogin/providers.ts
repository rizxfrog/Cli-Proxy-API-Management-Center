import type { WebLoginMethod, WebLoginRequest } from '@/services/api/webLogin';

// Web sessions are deliberately separate from OAuth/API-key provider configuration.
export const webLoginProviders = [
  {
    id: 'qwen-web',
    name: 'Qwen Web',
    loginUrl: 'https://chat.qwen.ai/auth',
    chatModel: 'qwen-web-chat',
    imageModel: 'qwen-web-image',
    methods: ['cookie', 'password', 'token'] as WebLoginMethod[],
  },
];

export interface WebLoginFields {
  cookie: string;
  email: string;
  password: string;
  token: string;
}

// Only the active method's credentials are sent; passwords must not be trimmed.
export function buildWebLoginRequest(
  method: WebLoginMethod,
  fields: WebLoginFields
): WebLoginRequest | null {
  switch (method) {
    case 'cookie':
      return fields.cookie.trim() ? { method, cookie: fields.cookie.trim() } : null;
    case 'password':
      return fields.email.trim() && fields.password
        ? { method, email: fields.email.trim(), password: fields.password }
        : null;
    case 'token':
      return fields.token.trim() ? { method, token: fields.token.trim() } : null;
  }
}
