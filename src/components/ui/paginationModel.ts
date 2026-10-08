export type PageItem = number | 'gap';

/**
 * 页码窗口：始终包含首页、末页与当前页前后各 `siblings` 页，其余用省略号折叠。
 * page 从 1 开始。
 */
export function getPageItems(page: number, pageCount: number, siblings = 1): PageItem[] {
  if (pageCount <= 1) return pageCount === 1 ? [1] : [];
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);

  const slots = siblings * 2 + 5; // 首、末、当前、两侧、两个省略位
  if (pageCount <= slots) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const left = Math.max(current - siblings, 2);
  const right = Math.min(current + siblings, pageCount - 1);
  const items: PageItem[] = [1];

  if (left > 2) items.push(left === 3 ? 2 : 'gap');
  for (let p = left; p <= right; p += 1) items.push(p);
  if (right < pageCount - 1) items.push(right === pageCount - 2 ? pageCount - 1 : 'gap');
  items.push(pageCount);
  return items;
}
