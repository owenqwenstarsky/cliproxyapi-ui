import { describe, expect, test } from 'bun:test';
import { resolveInitialAuthFilesUiState } from '../src/features/authFiles/uiState';

const resolve = (overrides: Partial<Parameters<typeof resolveInitialAuthFilesUiState>[0]> = {}) =>
  resolveInitialAuthFilesUiState({
    persisted: null,
    persistedCompactMode: null,
    defaults: { regularPageSize: 9, compactPageSize: 12 },
    normalizeFilter: (value) => value.trim().toLowerCase(),
    clampPageSize: (value) => Math.min(30, Math.max(3, Math.round(value))),
    ...overrides,
  });

describe('initial auth files UI state', () => {
  test('starts from defaults when nothing was saved', () => {
    expect(resolve()).toEqual({
      filter: 'all',
      statusFilterMode: 'all',
      compactMode: false,
      pageSizeByMode: { regular: 9, compact: 12 },
      sortMode: 'default',
    });
  });

  test('restores saved filters, sort and per-mode page sizes', () => {
    const state = resolve({
      persisted: {
        filter: ' Codex ',
        statusFilterMode: 'disabled',
        sortMode: 'az',
        regularPageSize: 15,
        compactPageSize: 24,
      },
    });
    expect(state).toMatchObject({
      filter: 'codex',
      statusFilterMode: 'disabled',
      sortMode: 'az',
      pageSizeByMode: { regular: 15, compact: 24 },
    });
  });

  test('never restores a stale search term or page number', () => {
    const state = resolve({
      persisted: { search: 'old-query', page: 7, filter: 'claude' },
    });
    expect(JSON.stringify(state)).not.toContain('old-query');
    expect(state).not.toHaveProperty('search');
    expect(state).not.toHaveProperty('page');
  });

  test('understands the legacy boolean and combined filter encodings', () => {
    expect(resolve({ persisted: { problemOnly: true } }).statusFilterMode).toBe('problem');
    expect(resolve({ persisted: { disabledOnly: true } }).statusFilterMode).toBe('disabled');
    expect(
      resolve({ persisted: { statusFilterMode: 'disabledProblem' as never } }).statusFilterMode
    ).toBe('problem');
  });

  test('a legacy single page size applies to both modes, clamped', () => {
    expect(resolve({ persisted: { pageSize: 100 } }).pageSizeByMode).toEqual({
      regular: 30,
      compact: 30,
    });
  });

  test('an explicit compact-mode preference wins over the one inside saved state', () => {
    expect(
      resolve({ persisted: { compactMode: true }, persistedCompactMode: false }).compactMode
    ).toBe(false);
    expect(resolve({ persisted: { compactMode: true } }).compactMode).toBe(true);
  });

  test('a ?filter=problem link overrides saved filters and clears the provider tab', () => {
    const state = resolve({
      persisted: { filter: 'codex', statusFilterMode: 'enabled' },
      urlStatusFilter: 'problem',
    });
    expect(state.statusFilterMode).toBe('problem');
    expect(state.filter).toBe('all');
  });

  test('ignores an unknown ?filter value', () => {
    const state = resolve({
      persisted: { filter: 'codex', statusFilterMode: 'enabled' },
      urlStatusFilter: 'bogus',
    });
    expect(state.statusFilterMode).toBe('enabled');
    expect(state.filter).toBe('codex');
  });
});
