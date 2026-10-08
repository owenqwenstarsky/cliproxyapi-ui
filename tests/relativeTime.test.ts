import { describe, expect, test } from 'bun:test';
import { formatRelativeAge } from '../src/utils/relativeTime';

describe('formatRelativeAge', () => {
  test('uses seconds, minutes, hours and days as the age grows', () => {
    expect(formatRelativeAge(12, 'en')).toContain('12');
    expect(formatRelativeAge(12, 'en')).toContain('sec');
    expect(formatRelativeAge(150, 'en')).toContain('2');
    expect(formatRelativeAge(150, 'en')).toContain('min');
    expect(formatRelativeAge(7300, 'en')).toContain('2');
    expect(formatRelativeAge(7300, 'en')).toContain('hr');
    expect(formatRelativeAge(200_000, 'en')).toContain('2');
    expect(formatRelativeAge(200_000, 'en')).toContain('day');
  });

  test('never renders a future time for a negative age', () => {
    expect(formatRelativeAge(-30, 'en')).not.toContain('in ');
  });

  test('is localized', () => {
    expect(formatRelativeAge(150, 'zh-CN')).toContain('分钟');
  });
});
