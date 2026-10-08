/**
 * 以最多 `limit` 个并发执行 `worker`，结果顺序与输入一致。
 * worker 自身负责处理错误（抛出会让整体 reject，与 Promise.all 一致）。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const size = Math.max(1, Math.floor(limit) || 1);
  let next = 0;

  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
