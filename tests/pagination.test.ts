import { describe, expect, test } from 'bun:test';
import { getPageItems } from '../src/components/ui/paginationModel';

describe('pagination page window', () => {
  test('renders nothing when there is nothing to page', () => {
    expect(getPageItems(1, 0)).toEqual([]);
  });

  test('a single page has no navigation targets beyond itself', () => {
    expect(getPageItems(1, 1)).toEqual([1]);
  });

  test('short ranges list every page', () => {
    expect(getPageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('long ranges collapse the far sides but keep first, last and neighbours', () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(getPageItems(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(getPageItems(20, 20)).toEqual([1, 'gap', 19, 20]);
  });

  test('never shows a gap for a single hidden page', () => {
    // a gap that would hide exactly one page shows that page instead
    expect(getPageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(getPageItems(17, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
  });

  test('clamps an out-of-range current page', () => {
    expect(getPageItems(99, 20)).toEqual(getPageItems(20, 20));
    expect(getPageItems(-5, 20)).toEqual(getPageItems(1, 20));
  });
});
