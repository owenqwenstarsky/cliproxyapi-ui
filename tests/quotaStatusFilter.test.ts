import { describe, expect, test } from 'bun:test';
import {
  filterEntriesByStatus,
  isQuotaStatusFilter,
  type QuotaFileEntry,
  type QuotaLoadStatus,
} from '../src/features/quota/logic';

const entry = (name: string): QuotaFileEntry =>
  ({ type: 'codex', file: { name, type: 'codex' } }) as QuotaFileEntry;

describe('quota status filter', () => {
  const statuses: Record<string, QuotaLoadStatus | undefined> = {
    ok: 'success',
    broken: 'error',
    fresh: undefined,
    waiting: 'idle',
    busy: 'loading',
  };
  const entries = Object.keys(statuses).map(entry);
  const statusOf = (e: QuotaFileEntry) => statuses[e.file.name];
  const names = (list: QuotaFileEntry[]) => list.map((e) => e.file.name);

  test('all keeps everything', () => {
    expect(filterEntriesByStatus(entries, 'all', statusOf)).toHaveLength(5);
  });

  test('attention shows only credentials whose quota failed to load', () => {
    expect(names(filterEntriesByStatus(entries, 'attention', statusOf))).toEqual(['broken']);
  });

  test('unloaded shows credentials with no quota data yet (never loaded or idle)', () => {
    expect(names(filterEntriesByStatus(entries, 'unloaded', statusOf))).toEqual([
      'fresh',
      'waiting',
    ]);
  });

  test('validates persisted/URL values', () => {
    expect(isQuotaStatusFilter('attention')).toBe(true);
    expect(isQuotaStatusFilter('bogus')).toBe(false);
    expect(isQuotaStatusFilter(undefined)).toBe(false);
  });
});
