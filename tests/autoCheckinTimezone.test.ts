import { describe, expect, test } from 'bun:test';
import { createInstance } from 'i18next';
import {
  canonicalTimezone,
  serializeDraft,
  timezoneNeedsCanonicalization,
  draftChanged,
  validateDraft,
  type CheckinDraft,
} from '@/features/autoCheckin/checkinForm';
import type { CheckinCapability } from '@/services/api/autoCheckin';
import en from '@/i18n/locales/en.json';

const capability = {
  id: 'codearts',
  name: 'CodeArts',
  defaults: {
    enabled: false,
    timezone: 'Asia/Shanghai',
    window: { start: '00:10', end: '03:10' },
    headers: {},
  },
  protectedHeaders: ['Authorization', 'X-Security-Token'],
} as unknown as CheckinCapability;

const draft = (overrides: Partial<CheckinDraft> = {}): CheckinDraft => ({
  enabled: true,
  timezone: 'Asia/Shanghai',
  start: '00:10',
  end: '03:10',
  headers: [],
  ...overrides,
});

describe('canonicalTimezone', () => {
  test('accepts a canonical IANA name unchanged', () => {
    expect(canonicalTimezone('Asia/Shanghai')).toBe('Asia/Shanghai');
    expect(canonicalTimezone('UTC')).toBe('UTC');
    expect(canonicalTimezone('Etc/GMT-8')).toBe('Etc/GMT-8');
  });

  test('resolves the spellings Go rejects but the browser tolerates', () => {
    // The backend uses Go's time.LoadLocation, which is case-sensitive; the
    // browser resolves these. Canonicalizing closes that gap.
    expect(canonicalTimezone('asia/shanghai')).toBe('Asia/Shanghai');
    expect(canonicalTimezone('ASIA/SHANGHAI')).toBe('Asia/Shanghai');
  });

  test('rejects names neither runtime knows', () => {
    expect(canonicalTimezone('Asia/Beijing')).toBeNull();
    expect(canonicalTimezone('China Standard Time')).toBeNull();
    expect(canonicalTimezone('Local')).toBeNull();
    expect(canonicalTimezone('   ')).toBeNull();
  });

  test('flags values that will be rewritten on save', () => {
    expect(timezoneNeedsCanonicalization('asia/shanghai')).toBe(true);
    expect(timezoneNeedsCanonicalization('Asia/Shanghai')).toBe(false);
    // Whitespace is trimmed by canonicalTimezone itself, so it is not a rewrite
    // of the zone; only the case/spelling difference counts.
    expect(timezoneNeedsCanonicalization('  Asia/Shanghai  ')).toBe(false);
    expect(timezoneNeedsCanonicalization('nope/nope')).toBe(false);
  });
});

describe('validateDraft timezone handling', () => {
  test('reports an unknown zone before the round trip', () => {
    expect(validateDraft(draft({ timezone: 'Asia/Beijing' }), capability)).toBe('timezone_invalid');
    expect(validateDraft(draft({ timezone: 'Local' }), capability)).toBe('timezone_invalid');
  });

  test('keeps the empty-field message distinct', () => {
    expect(validateDraft(draft({ timezone: '' }), capability)).toBe('timezone_required');
    expect(validateDraft(draft({ timezone: '   ' }), capability)).toBe('timezone_required');
  });

  test('accepts a canonical zone', () => {
    expect(validateDraft(draft(), capability)).toBeNull();
  });

  test('still checks the window and headers', () => {
    expect(validateDraft(draft({ start: '05:00', end: '04:00' }), capability)).toBe('window_invalid');
    expect(
      validateDraft(draft({ headers: [{ key: 'X-Security-Token', value: 'x' }] }), capability)
    ).toBe('header_protected');
  });
});

describe('serializeDraft timezone handling', () => {
  test('sends the canonical spelling so the backend accepts it', () => {
    expect(serializeDraft(draft({ timezone: 'asia/shanghai' })).timezone).toBe('Asia/Shanghai');
  });

  test('trims surrounding whitespace', () => {
    expect(serializeDraft(draft({ timezone: '  Asia/Shanghai  ' })).timezone).toBe('Asia/Shanghai');
  });

  test('leaves an unresolvable value for the backend to reject', () => {
    expect(serializeDraft(draft({ timezone: 'Nope/Nope' })).timezone).toBe('Nope/Nope');
  });
});

describe('timezone_invalid copy', () => {
  test('is translated', () => {
    const text = (en.auto_checkin.validation as Record<string, string>).timezone_invalid;
    expect(text?.trim()).toBeTruthy();
    expect(text).toContain('Asia/Shanghai');
  });

  test('renders through the i18n pipeline', () => {
    const instance = createInstance();
    instance.init({ lng: 'en', resources: { en: { translation: en } } });
    expect(instance.t('auto_checkin.validation.timezone_invalid')).toContain('IANA');
  });
});

describe('draft dirty tracking', () => {
  test('a differently-spelled zone still counts as a pending change', () => {
    // Serialization canonicalizes both to the same bytes, so comparing the
    // canonical form would disable Save while the field visibly differs.
    const saved = { enabled: true, timezone: 'Asia/Shanghai', window: { start: '00:10', end: '03:10' }, headers: {} };
    expect(draftChanged(draft({ timezone: 'asia/shanghai' }), saved)).toBe(true);
  });

  test('an unchanged draft is clean', () => {
    const saved = { enabled: true, timezone: 'Asia/Shanghai', window: { start: '00:10', end: '03:10' }, headers: {} };
    expect(draftChanged(draft(), saved)).toBe(false);
  });

  test('surrounding whitespace is not a change', () => {
    const saved = { enabled: true, timezone: 'Asia/Shanghai', window: { start: '00:10', end: '03:10' }, headers: {} };
    expect(draftChanged(draft({ timezone: '  Asia/Shanghai  ' }), saved)).toBe(false);
  });
});
