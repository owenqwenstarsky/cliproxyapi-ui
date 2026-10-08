import { describe, expect, test } from 'bun:test';
import {
  countCredentialsByProvider,
  getCredentialHealth,
  isProblemAuthFile,
  summarizeCredentialHealth,
} from '../src/features/authFiles/health';
import type { AuthFileItem } from '../src/types';

const file = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'a.json',
  type: 'codex',
  ...overrides,
});

describe('credential health', () => {
  test('a plain credential is healthy', () => {
    expect(getCredentialHealth(file()).state).toBe('healthy');
    expect(getCredentialHealth(file({ status: 'active', statusMessage: 'ok' })).state).toBe(
      'healthy'
    );
  });

  test('deliberately disabled credentials are never problems, even with a message', () => {
    const health = getCredentialHealth(
      file({ disabled: true, unavailable: true, statusMessage: 'disabled via management API' })
    );
    expect(health.state).toBe('disabled');
    expect(health.reason).toBeUndefined();
  });

  test('reports why a credential is a problem', () => {
    expect(getCredentialHealth(file({ unavailable: true })).reason).toBe('unavailable');
    expect(getCredentialHealth(file({ status: 'error' })).reason).toBe('error');
    const warned = getCredentialHealth(file({ statusMessage: 'quota exhausted' }));
    expect(warned.reason).toBe('status_message');
    expect(warned.message).toBe('quota exhausted');
  });

  test('active cooldowns do not make a credential unhealthy', () => {
    const cooling = file({
      cooldownSnapshot: {
        receivedAtMs: 0,
        records: [
          {
            scope: 'credential',
            reason: 'quota',
            remainingSeconds: 60,
          } as never,
        ],
      },
    });
    expect(getCredentialHealth(cooling).state).toBe('healthy');
  });

  test('isProblemAuthFile agrees with getCredentialHealth', () => {
    const samples = [
      file(),
      file({ disabled: true }),
      file({ unavailable: true }),
      file({ status: 'error' }),
      file({ statusMessage: 'rate limited' }),
      file({ statusMessage: 'ok' }),
    ];
    for (const sample of samples) {
      expect(isProblemAuthFile(sample)).toBe(getCredentialHealth(sample).state === 'problem');
    }
  });

  test('summarizes counts that add up to the total', () => {
    const summary = summarizeCredentialHealth([
      file(),
      file(),
      file({ disabled: true }),
      file({ unavailable: true }),
      file({ statusMessage: 'bad' }),
    ]);
    expect(summary).toEqual({ total: 5, healthy: 2, disabled: 1, problem: 2 });
  });
});

describe('credential counts by provider', () => {
  const normalize = (value: string) => value.trim().toLowerCase();

  test('counts totals and problems per provider', () => {
    const counts = countCredentialsByProvider(
      [
        file({ type: 'codex' }),
        file({ type: 'Codex', unavailable: true }),
        file({ type: 'claude', disabled: true }),
        file({ type: '', provider: '' }),
      ],
      normalize
    );
    expect(counts.get('codex')).toEqual({ total: 2, problem: 1 });
    expect(counts.get('claude')).toEqual({ total: 1, problem: 0 });
    expect(counts.has('')).toBe(false);
  });

  test('falls back to the provider field when type is missing', () => {
    const counts = countCredentialsByProvider(
      [file({ type: undefined, provider: 'xai' })],
      normalize
    );
    expect(counts.get('xai')?.total).toBe(1);
  });
});
