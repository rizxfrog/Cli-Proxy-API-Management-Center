/**
 * Validation and type checking functions for quota management.
 */

import type { AuthFileItem } from '@/types';

export function resolveAuthProvider(file: AuthFileItem): string {
  const raw = file.provider ?? file.type ?? '';
  const key = String(raw).trim().toLowerCase().replace(/_/g, '-');
  if (key === 'x-ai' || key === 'grok') return 'xai';
  // Kimi International (kimi.ai) accounts share Kimi's quota API on another host.
  if (key === 'kimi-ai') return 'kimi';
  return key;
}

export function isAntigravityFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'antigravity';
}

export function isClaudeFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'claude';
}

export function isCodexFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'codex';
}

export function isDevinFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'devin';
}

export function isKimiFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'kimi';
}

export function isXaiFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'xai';
}

export function isCodeBuddyFile(file: AuthFileItem): boolean {
  const provider = resolveAuthProvider(file);
  // The quota card tab id is 'codebuddy'; regional credentials arrive as
  // codebuddy-cn / codebuddy-ai. All three render the same card.
  return provider === 'codebuddy' || provider === 'codebuddy-cn' || provider === 'codebuddy-ai';
}

export function isCodeArtsFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'codearts';
}

/**
 * MiniMax Code credentials reach the quota page as the auth file's `type`
 * (`minimax` or `minimax-cn`), matching how the provider key is registered.
 */
export function isMinimaxFile(file: AuthFileItem): boolean {
  const provider = resolveAuthProvider(file);
  return provider === 'minimax' || provider === 'minimax-cn';
}

/**
 * Qoder CN credentials reach the quota page as a bare `qoder-cn` provider (the
 * auth file's `type`), matching how the provider key is registered. The quota
 * card tab id `qodercn` (shared with Qoder AI) is accepted as an alias.
 */
export function isQoderCNFile(file: AuthFileItem): boolean {
  const provider = resolveAuthProvider(file);
  return provider === 'qoder-cn' || provider === 'qodercn';
}

/**
 * Qoder AI credentials reach the quota page as a bare `qoder-ai` provider (the
 * auth file's `type`), matching how the provider key is registered. The quota
 * payload shape is identical to Qoder CN (the backend merges the same OpenAPI
 * reads from the international origin).
 */
export function isQoderAIFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'qoder-ai';
}

export function isCodeBuddyAiFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'codebuddy-ai';
}

export function isTraeFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'trae';
}

/**
 * FloatBoat credentials reach the quota page as a bare `floatboat` provider
 * (the auth file's `type`), matching how the provider key is registered.
 */
export function isFloatboatFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'floatboat';
}

export function isXiaohuanxiongFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'xiaohuanxiong';
}

export function isLobsteraiServerFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'lobsterai-server';
}

/**
 * Loomy credentials reach the quota page as a bare `loomy` provider (the auth
 * file's `type`), matching how the provider key is registered.
 */
export function isLoomyFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'loomy';
}

export function isAirJellyFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'airjelly';
}

export function isDumateFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'dumate';
}

/**
 * Providers rendered by a dedicated built-in quota card. These are exactly the
 * quota tab ids (minus 'plugin'); the card filters accept the regional
 * provider variants, e.g. the `qodercn` card covers qoder-cn + qoder-ai and
 * `minimax` covers minimax + minimax-cn.
 */
export const BUILT_IN_QUOTA_PROVIDERS: ReadonlySet<string> = new Set([
  'antigravity',
  'claude',
  'codex',
  'devin',
  'kimi',
  'meta',
  'xai',
  'codebuddy',
  'codearts',
  'qodercn',
  'minimax',
  'trae',
  'floatboat',
  'xiaohuanxiong',
  'lobsterai-server',
  'loomy',
  'airjelly',
  'dumate',
]);

/**
 * Generic plugin quota card for providers without a built-in card. Built-in cards win even
 * when a plugin also advertises quota for the same provider.
 */
export function isPluginQuotaFile(file: AuthFileItem): boolean {
  if (BUILT_IN_QUOTA_PROVIDERS.has(resolveAuthProvider(file))) return false;
  const supported = file.supportsQuota ?? file['supports_quota'];
  return supported === true || supported === 'true' || supported === '1';
}

export function isDisabledAuthFile(file: AuthFileItem): boolean {
  const raw = (file as { disabled?: unknown }).disabled;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}
