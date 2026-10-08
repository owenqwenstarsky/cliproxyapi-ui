import { describe, expect, test } from 'bun:test';
import {
  buildCredentialSummary,
  buildTrafficOverview,
  sortProvidersWorstFirst,
} from '../src/features/dashboard/aggregate';
import type { ProviderRecentRequests } from '../src/components/providers/hooks/useProviderRecentRequests';
import type { AuthFileItem } from '../src/types/authFile';

const bucket = (success: number, failed: number, time = '10:00-10:10') => ({
  time,
  success,
  failed,
});

const authFile = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'a.json',
  type: 'codex',
  ...overrides,
});

describe('traffic overview', () => {
  test('provider totals are windowed so they reconcile with the overall window', () => {
    // 累计计数器远大于窗口内的请求数——这是之前把两种口径混在一起的场景
    const usage: ProviderRecentRequests = new Map([
      [
        'claude',
        new Map([
          ['https://api|sk-1', { success: 50_000, failed: 9_000, recentRequests: [bucket(8, 2)] }],
        ]),
      ],
    ]);
    const files = [
      authFile({
        type: 'codex',
        success: 80_000,
        failed: 100,
        recent_requests: [bucket(30, 0)],
      }),
    ];
    const { traffic, providers } = buildTrafficOverview(usage, files);

    expect(traffic.total).toBe(40);
    expect(providers.reduce((sum, provider) => sum + provider.total, 0)).toBe(traffic.total);
    const claude = providers.find((provider) => provider.id === 'claude');
    expect(claude).toMatchObject({ success: 8, failure: 2, total: 10 });
    expect(claude?.successRate).toBe(80);
  });

  test('an empty source yields an empty window rather than NaN', () => {
    const { traffic, providers } = buildTrafficOverview(new Map(), []);
    expect(traffic.total).toBe(0);
    expect(traffic.successRate).toBeNull();
    expect(providers).toEqual([]);
  });

  test('providers with no requests in the window have no success rate', () => {
    const { providers } = buildTrafficOverview(new Map(), [authFile()]);
    expect(providers[0]).toMatchObject({
      id: 'codex',
      credentials: 1,
      total: 0,
      successRate: null,
    });
  });
});

describe('credential summary', () => {
  test('splits healthy, disabled and problem credentials and names the broken ones', () => {
    const summary = buildCredentialSummary(
      [
        authFile({ email: 'ok@example.com' }),
        authFile({ email: 'off@example.com', disabled: true }),
        authFile({ email: 'bad@example.com', unavailable: true }),
      ],
      0
    );
    expect(summary).toMatchObject({ total: 3, healthy: 1, disabled: 1, problem: 1 });
    expect(summary.problemNames).toEqual(['bad@example.com']);
    expect(summary.healthy + summary.disabled + summary.problem).toBe(summary.total);
  });

  test('counts credentials with an active cooldown separately from health', () => {
    const cooling = authFile({
      cooldownSnapshot: {
        receivedAtMs: 0,
        records: [{ scope: 'credential', reason: 'quota', remainingSeconds: 120 } as never],
      },
    });
    const summary = buildCredentialSummary([cooling, authFile()], 1000);
    expect(summary.cooling).toBe(1);
    expect(summary.healthy).toBe(2);
  });

  test('groups by provider type, largest first', () => {
    const summary = buildCredentialSummary(
      [authFile(), authFile(), authFile({ type: 'claude' })],
      0
    );
    expect(summary.byType).toEqual([
      { type: 'codex', count: 2 },
      { type: 'claude', count: 1 },
    ]);
  });
});

describe('provider ordering', () => {
  const provider = (id: string, success: number, failure: number) => ({
    id,
    credentials: 1,
    success,
    failure,
    total: success + failure,
    successRate: success + failure > 0 ? (success / (success + failure)) * 100 : null,
    buckets: [],
  });

  test('lists failing providers first, then busiest', () => {
    const sorted = sortProvidersWorstFirst(
      [provider('busy', 900, 10), provider('bad', 5, 15), provider('quiet', 0, 0)],
      10
    );
    expect(sorted.map((p) => p.id)).toEqual(['bad', 'busy', 'quiet']);
  });

  test('a provider with too few requests is not ranked as failing', () => {
    const sorted = sortProvidersWorstFirst([provider('big', 100, 0), provider('tiny', 0, 1)], 10);
    expect(sorted.map((p) => p.id)).toEqual(['big', 'tiny']);
  });
});
