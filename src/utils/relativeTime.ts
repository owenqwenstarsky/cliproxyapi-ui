/** 把秒差格式化为本地化的相对时间（“12 秒前”“3 分钟前”“2 小时前”） */
export function formatRelativeAge(ageSeconds: number, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const seconds = Math.max(0, ageSeconds);
  if (seconds < 60) return formatter.format(-Math.floor(seconds), 'second');
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86_400) return formatter.format(-Math.floor(seconds / 3600), 'hour');
  return formatter.format(-Math.floor(seconds / 86_400), 'day');
}
