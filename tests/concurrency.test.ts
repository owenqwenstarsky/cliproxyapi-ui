import { describe, expect, test } from 'bun:test';
import { mapWithConcurrency } from '../src/utils/concurrency';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  test('keeps results in input order regardless of completion order', async () => {
    const results = await mapWithConcurrency([30, 5, 15], 3, async (delay, index) => {
      await sleep(delay);
      return index;
    });
    expect(results).toEqual([0, 1, 2]);
  });

  test('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await sleep(2);
        running -= 1;
      }
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  test('handles an empty list and a nonsense limit', async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n * 2)).toEqual([2, 4]);
  });

  test('rejects when a worker throws', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      })
    ).rejects.toThrow('boom');
  });
});
