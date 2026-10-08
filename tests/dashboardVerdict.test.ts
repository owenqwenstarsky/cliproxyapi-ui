import { describe, expect, test } from 'bun:test';
import {
  MIN_SAMPLE_REQUESTS,
  buildAttentionItems,
  buildVerdict,
  type VerdictInput,
} from '../src/features/dashboard/verdict';

const base = (overrides: Partial<VerdictInput> = {}): VerdictInput => ({
  connection: 'connected',
  traffic: { total: 0, successRate: null },
  providers: [],
  credentials: { total: 4, healthy: 4, problem: 0 },
  ...overrides,
});

describe('dashboard verdict', () => {
  test('connection state wins over everything else', () => {
    expect(buildVerdict(base({ connection: 'disconnected' })).level).toBe('offline');
    expect(buildVerdict(base({ connection: 'error' })).level).toBe('offline');
    expect(buildVerdict(base({ connection: 'connecting' })).level).toBe('connecting');
  });

  test('no traffic and healthy credentials is idle, not an alarm', () => {
    expect(buildVerdict(base())).toEqual({ level: 'idle', reasons: [] });
  });

  test('healthy traffic is healthy', () => {
    const verdict = buildVerdict(base({ traffic: { total: 200, successRate: 99.5 } }));
    expect(verdict.level).toBe('healthy');
  });

  test('every credential broken is critical even with zero traffic', () => {
    const verdict = buildVerdict(base({ credentials: { total: 3, healthy: 0, problem: 3 } }));
    expect(verdict.level).toBe('critical');
    expect(verdict.reasons[0]).toEqual({ kind: 'all_credentials_down', problem: 3 });
  });

  test('a minority of broken credentials needs attention but is not critical', () => {
    const verdict = buildVerdict(base({ credentials: { total: 10, healthy: 9, problem: 1 } }));
    expect(verdict.level).toBe('attention');
  });

  test('a majority of broken credentials is critical', () => {
    const verdict = buildVerdict(base({ credentials: { total: 4, healthy: 1, problem: 3 } }));
    expect(verdict.level).toBe('critical');
  });

  test('disabled credentials are not problems', () => {
    // 4 credentials, all deliberately disabled -> healthy 0, problem 0
    const verdict = buildVerdict(base({ credentials: { total: 4, healthy: 0, problem: 0 } }));
    expect(verdict.level).toBe('idle');
  });

  test('a tiny sample never produces a success-rate verdict', () => {
    // 1 failure out of 1 request is 0%, but means nothing
    const verdict = buildVerdict(base({ traffic: { total: 1, successRate: 0 } }));
    expect(verdict.level).toBe('healthy');
    expect(verdict.reasons).toEqual([]);
    expect(MIN_SAMPLE_REQUESTS).toBeGreaterThan(1);
  });

  test('a small sample that is clearly all failures is still reported', () => {
    // 7 of 7 requests failed: not "too little data", the gateway is broken
    const verdict = buildVerdict(base({ traffic: { total: 7, successRate: 0 } }));
    expect(verdict.level).toBe('critical');
    expect(verdict.reasons).toEqual([{ kind: 'low_success', rate: 0 }]);
  });

  test('two failures in a small sample are not enough to alarm', () => {
    const verdict = buildVerdict(base({ traffic: { total: 2, successRate: 0 } }));
    expect(verdict.level).toBe('healthy');
  });

  test('a real sample with a poor success rate escalates by severity', () => {
    expect(buildVerdict(base({ traffic: { total: 100, successRate: 90 } })).level).toBe(
      'attention'
    );
    expect(buildVerdict(base({ traffic: { total: 100, successRate: 60 } })).level).toBe('critical');
  });

  test('names a failing provider only when it has enough requests', () => {
    const verdict = buildVerdict(
      base({
        traffic: { total: 300, successRate: 97 },
        providers: [
          { id: 'codex', total: 200, successRate: 99 },
          { id: 'claude', total: 80, successRate: 70 },
          { id: 'xai', total: 2, successRate: 0 },
        ],
      })
    );
    expect(verdict.reasons).toEqual([{ kind: 'provider_failing', id: 'claude', rate: 70 }]);
    expect(verdict.level).toBe('critical');
  });

  test('a failed data fetch is reported instead of being shown as empty', () => {
    const verdict = buildVerdict(base({ errors: { credentials: true } }));
    expect(verdict.level).toBe('attention');
    expect(verdict.reasons).toContainEqual({ kind: 'data_error', source: 'credentials' });
  });

  test('critical reasons sort ahead of attention reasons', () => {
    const verdict = buildVerdict(
      base({
        credentials: { total: 10, healthy: 9, problem: 1 },
        traffic: { total: 100, successRate: 50 },
      })
    );
    expect(verdict.reasons[0].kind).toBe('low_success');
  });
});

describe('attention items', () => {
  const credentials = (overrides = {}) => ({
    total: 5,
    healthy: 4,
    problem: 1,
    problemNames: ['a@example.com'],
    cooling: 0,
    ...overrides,
  });

  test('is empty when nothing needs attention', () => {
    expect(
      buildAttentionItems({
        providers: [],
        credentials: credentials({ problem: 0, problemNames: [] }),
        totalFailure: 0,
        totalSuccess: 50,
      })
    ).toEqual([]);
  });

  test('links broken credentials to the problem filter and names them', () => {
    const [item] = buildAttentionItems({
      providers: [],
      credentials: credentials(),
      totalFailure: 0,
      totalSuccess: 0,
    });
    expect(item.kind).toBe('credentials_problem');
    expect(item.to).toBe('/auth-files?filter=problem');
    expect(item.names).toEqual(['a@example.com']);
  });

  test('sorts critical before warning before info', () => {
    const items = buildAttentionItems({
      providers: [{ id: 'claude', total: 50, successRate: 40 }],
      credentials: credentials({ cooling: 2 }),
      totalFailure: 30,
      totalSuccess: 20,
    });
    const severities = items.map((item) => item.severity);
    expect(severities).toEqual([...severities].sort((a, b) => order(a) - order(b)));
    expect(items[0].severity).toBe('critical');
    expect(items.at(-1)?.kind).toBe('cooling');
  });

  test('repeated failures with no successes are a warning, not mere info', () => {
    const [item] = buildAttentionItems({
      providers: [],
      credentials: null,
      totalFailure: 7,
      totalSuccess: 0,
    });
    expect(item).toMatchObject({ kind: 'recent_failures', severity: 'warning' });
  });

  test('a couple of failures in a quiet window is informational', () => {
    const items = buildAttentionItems({
      providers: [],
      credentials: null,
      totalFailure: 1,
      totalSuccess: 3,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'recent_failures', severity: 'info', count: 1 });
  });
});

const order = (severity: string) => ({ critical: 0, warning: 1, info: 2 })[severity] ?? 3;
