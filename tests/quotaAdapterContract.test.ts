/**
 * Guard for the quota adapter <-> store contract.
 *
 * QUOTA_ADAPTERS is keyed by provider type, but each adapter also names the
 * store slice it reads/writes through `storeSetter`. Nothing structurally ties
 * the two together, and a hand-written lookup map in QuotaPage previously used
 * `as unknown as Record<...>`, so adding a provider without adding its cache
 * key compiled cleanly and only crashed at runtime. These checks keep the
 * adapter table, the store, and the tab order in sync.
 */

import { describe, expect, test } from 'bun:test';
import { QUOTA_ADAPTERS } from '@/features/quota/providers';
import { QUOTA_TAB_ORDER } from '@/features/quota/constants';
import { useQuotaStore } from '@/stores';
import type { QuotaProviderType } from '@/features/quota/providers/types';

describe('quota adapter store contract', () => {
  const types = Object.keys(QUOTA_ADAPTERS) as QuotaProviderType[];

  test('every tab in QUOTA_TAB_ORDER has an adapter', () => {
    for (const type of QUOTA_TAB_ORDER) {
      expect(QUOTA_ADAPTERS[type]).toBeDefined();
    }
  });

  test('every adapter is reachable from QUOTA_TAB_ORDER', () => {
    expect(new Set(types)).toEqual(new Set(QUOTA_TAB_ORDER));
  });

  test('every storeSetter names a real store action', () => {
    const state = useQuotaStore.getState() as unknown as Record<string, unknown>;
    for (const type of types) {
      const key = QUOTA_ADAPTERS[type].storeSetter as string;
      expect(key.startsWith('set')).toBe(true);
      expect(state).toHaveProperty(key);
      expect(state[key]).toBeTypeOf('function');
      // Each setter must have a matching slice named without the "set" prefix
      // and lower-cased first letter, which is what QuotaPage subscribes to.
      const sliceKey = key.slice(3, 4).toLowerCase() + key.slice(4);
      expect(state).toHaveProperty(sliceKey);
      expect(state[sliceKey]).toBeTypeOf('object');
    }
  });

  test('every storeSelector reads a real slice without throwing', () => {
    const state = useQuotaStore.getState();
    for (const type of types) {
      const slice = QUOTA_ADAPTERS[type].storeSelector(state as never);
      expect(slice).toBeTypeOf('object');
    }
  });

  test('every storeSelector returns its own slice, distinct per provider', () => {
    const state = useQuotaStore.getState();
    const seen = new Set<unknown>();
    for (const type of types) {
      const slice = QUOTA_ADAPTERS[type].storeSelector(state as never);
      expect(slice).toBeTypeOf('object');
      seen.add(slice);
    }
    // A shared/duplicated slice would make two providers clobber each other.
    expect(seen.size).toBe(types.length);
  });
});
