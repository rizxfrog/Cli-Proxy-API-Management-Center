import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildWebLoginRequest, webLoginProviders } from '../src/features/webLogin/providers';

describe('Web login', () => {
  const fields = { cookie: ' token=session ', email: ' user@example.com ', password: ' secret ', token: ' session ' };
  test('only sends the selected credential fields and preserves the password', () => {
    expect(buildWebLoginRequest('cookie', fields)).toEqual({ method: 'cookie', cookie: 'token=session' });
    expect(buildWebLoginRequest('password', fields)).toEqual({ method: 'password', email: 'user@example.com', password: ' secret ' });
    expect(buildWebLoginRequest('token', fields)).toEqual({ method: 'token', token: 'session' });
    for (const method of ['cookie', 'password', 'token'] as const) {
      expect(buildWebLoginRequest(method, { cookie: '', email: '', password: '', token: '' })).toBeNull();
    }
  });
  test('Qwen has independent web models and all three login modes', () => {
    expect(webLoginProviders[0]).toMatchObject({ id: 'qwen-web', chatModel: 'qwen-web-chat', imageModel: 'qwen-web-image', methods: ['cookie', 'password', 'token'] });
  });
  test('all locales contain the Web login copy', () => {
    for (const language of ['en', 'zh-CN', 'zh-TW', 'ru']) {
      const locale = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), 'utf8'));
      expect(locale.web_login.title).toBeTruthy();
      for (const method of webLoginProviders[0].methods) expect(locale.web_login.methods[method]).toBeTruthy();
      expect(locale.web_login.security).toBeTruthy();
    }
  });
  test('page avoids credential persistence and aborts on connection change', () => {
    const source = readFileSync(new URL('../src/features/webLogin/WebLoginPage.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('localStorage.setItem');
    expect(source).not.toContain('sessionStorage');
    expect(source).toContain('pending.current?.abort()');
    expect(source).toContain('state.managementKey !== previous.managementKey');
    expect(source).toContain("type=\"password\"");
  });
});
