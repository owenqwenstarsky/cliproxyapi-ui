import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/features/quota/QuotaPage.tsx', 'utf8');
const styles = readFileSync('src/features/quota/QuotaPage.module.scss', 'utf8');

describe('quota toolbar presentation contracts', () => {
  test('uses the shared search input with a named clear action that restores focus', () => {
    expect(source).toContain('<SearchInput');
    expect(source).toContain('ref={searchInputRef}');
    expect(source).toContain("label={t('quota_management.search_label')}");

    const searchInput = readFileSync(
      new URL('../src/components/ui/SearchInput.tsx', import.meta.url),
      'utf8'
    );
    expect(searchInput).toContain('type="search"');
    expect(searchInput).toContain('{value ? (');
    expect(searchInput).toContain("aria-label={t('common.clear_search')}");
    expect(searchInput).toContain("onChange('');");
    expect(searchInput).toContain('inputRef.current?.focus()');
  });

  test('groups search and sorting separately from provider navigation', () => {
    const toolbarStart = source.indexOf('<div className={styles.toolbar}>');
    const searchStart = source.indexOf('<div className={styles.search}>');
    const sortStart = source.indexOf('<div className={styles.sort}>');
    expect(toolbarStart).toBeGreaterThan(source.indexOf('<ProviderTabs'));
    expect(searchStart).toBeGreaterThan(toolbarStart);
    expect(sortStart).toBeGreaterThan(searchStart);
    expect(styles).toMatch(/\.toolbar\s*\{[^}]*flex-wrap: wrap;/);
    expect(styles).toContain('&:focus-within');
    expect(styles).toContain('&:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
