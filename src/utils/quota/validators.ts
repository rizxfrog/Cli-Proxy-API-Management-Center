/**
 * Validation and type checking functions for quota management.
 */

import type { AuthFileItem } from '@/types';

export function resolveAuthProvider(file: AuthFileItem): string {
  const raw = file.provider ?? file.type ?? '';
  const key = String(raw).trim().toLowerCase().replace(/_/g, '-');
  if (key === 'x-ai' || key === 'grok') return 'xai';
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
  return provider === 'codebuddy-cn' || provider === 'codebuddy-ai';
}

export function isCodeArtsFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'codearts';
}

/**
 * Qoder CN credentials reach the quota page as a bare `qoder-cn` provider (the
 * auth file's `type`), matching how the provider key is registered.
 */
export function isQoderCNFile(file: AuthFileItem): boolean {
  return resolveAuthProvider(file) === 'qoder-cn';
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

export function isDisabledAuthFile(file: AuthFileItem): boolean {
  const raw = (file as { disabled?: unknown }).disabled;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}
