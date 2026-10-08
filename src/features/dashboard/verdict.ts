import type { ConnectionStatus } from '@/types';
import type { CredentialSummary, ProviderTraffic, TrafficWindow } from './types';

/**
 * 请求量低于此值时不报告成功率结论：1 次失败 / 1 次请求 = 0% 并不代表网关坏了。
 */
export const MIN_SAMPLE_REQUESTS = 10;

/**
 * 小样本也不能无视明显的失败：至少这么多次失败、且失败占多数时，哪怕没到 MIN_SAMPLE 也要报。
 * （7 次请求全部失败不是“样本太少”，是网关出了问题。）
 */
export const SMALL_SAMPLE_MIN_FAILURES = 3;

/** 成功率低于此值视为需要关注 / 严重 */
export const SUCCESS_WARNING_BELOW = 95;
export const SUCCESS_CRITICAL_BELOW = 80;

export type VerdictLevel = 'critical' | 'attention' | 'healthy' | 'idle' | 'connecting' | 'offline';

export type VerdictReason =
  | { kind: 'all_credentials_down'; problem: number }
  | { kind: 'credentials_problem'; count: number; total: number }
  | { kind: 'low_success'; rate: number }
  | { kind: 'provider_failing'; id: string; rate: number }
  | { kind: 'data_error'; source: 'traffic' | 'credentials' };

export interface Verdict {
  level: VerdictLevel;
  reasons: VerdictReason[];
}

export interface VerdictInput {
  connection: ConnectionStatus;
  traffic: Pick<TrafficWindow, 'total' | 'successRate'>;
  providers: ReadonlyArray<Pick<ProviderTraffic, 'id' | 'total' | 'successRate'>>;
  credentials: Pick<CredentialSummary, 'total' | 'healthy' | 'problem'> | null;
  errors?: { traffic?: boolean; credentials?: boolean };
}

const SEVERITY: Record<'critical' | 'attention', number> = { critical: 2, attention: 1 };

const reasonSeverity = (reason: VerdictReason): 'critical' | 'attention' => {
  switch (reason.kind) {
    case 'all_credentials_down':
      return 'critical';
    case 'credentials_problem':
      return reason.total > 0 && reason.count / reason.total >= 0.5 ? 'critical' : 'attention';
    case 'low_success':
    case 'provider_failing':
      return reason.rate < SUCCESS_CRITICAL_BELOW ? 'critical' : 'attention';
    case 'data_error':
      return 'attention';
  }
};

/** 供应商是否在窗口内样本足够且成功率偏低 */
export const failingProviders = (providers: VerdictInput['providers']) =>
  providers
    .filter(
      (provider) =>
        provider.total >= MIN_SAMPLE_REQUESTS &&
        provider.successRate !== null &&
        provider.successRate < SUCCESS_WARNING_BELOW
    )
    .sort((a, b) => (a.successRate ?? 100) - (b.successRate ?? 100));

/**
 * 综合判定网关当前状态。判定同时考虑连接、凭证健康与（足够样本下的）成功率；
 * 之前只看窗口成功率，会把“全部凭证不可用但暂无流量”误报成“安静”。
 */
export function buildVerdict(input: VerdictInput): Verdict {
  if (input.connection === 'connecting') return { level: 'connecting', reasons: [] };
  if (input.connection !== 'connected') return { level: 'offline', reasons: [] };

  const reasons: VerdictReason[] = [];
  const { credentials, traffic } = input;

  if (credentials && credentials.total > 0) {
    if (credentials.healthy === 0 && credentials.problem > 0) {
      reasons.push({ kind: 'all_credentials_down', problem: credentials.problem });
    } else if (credentials.problem > 0) {
      reasons.push({
        kind: 'credentials_problem',
        count: credentials.problem,
        total: credentials.total,
      });
    }
  }

  if (traffic.successRate !== null && traffic.total > 0) {
    const failed = Math.round(traffic.total * (1 - traffic.successRate / 100));
    const enoughSample = traffic.total >= MIN_SAMPLE_REQUESTS;
    const clearlyBroken =
      !enoughSample && failed >= SMALL_SAMPLE_MIN_FAILURES && traffic.successRate < 50;
    if ((enoughSample && traffic.successRate < SUCCESS_WARNING_BELOW) || clearlyBroken) {
      reasons.push({ kind: 'low_success', rate: traffic.successRate });
    }
  }

  for (const provider of failingProviders([...input.providers]).slice(0, 3)) {
    reasons.push({ kind: 'provider_failing', id: provider.id, rate: provider.successRate ?? 0 });
  }

  if (input.errors?.traffic) reasons.push({ kind: 'data_error', source: 'traffic' });
  if (input.errors?.credentials) reasons.push({ kind: 'data_error', source: 'credentials' });

  reasons.sort((a, b) => SEVERITY[reasonSeverity(b)] - SEVERITY[reasonSeverity(a)]);

  if (reasons.length === 0) {
    return { level: traffic.total === 0 ? 'idle' : 'healthy', reasons };
  }
  const level = reasons.some((reason) => reasonSeverity(reason) === 'critical')
    ? 'critical'
    : 'attention';
  return { level, reasons };
}

export type AttentionKind =
  'credentials_problem' | 'provider_failing' | 'recent_failures' | 'cooling';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: 'critical' | 'warning' | 'info';
  /** 应用内跳转目标（hash 路由下的 path + query） */
  to: string;
  count?: number;
  /** 受影响对象的名称（凭证标识 / 供应商 id），最多若干个 */
  names?: string[];
  rate?: number;
}

export interface AttentionInput {
  providers: VerdictInput['providers'];
  credentials: Pick<
    CredentialSummary,
    'total' | 'healthy' | 'problem' | 'problemNames' | 'cooling'
  > | null;
  totalFailure: number;
  totalSuccess: number;
}

const SEVERITY_ORDER: Record<AttentionItem['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * “需要处理”清单：每一行都指向能解决问题的页面。
 */
export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { credentials } = input;

  if (credentials && credentials.problem > 0) {
    items.push({
      id: 'credentials-problem',
      kind: 'credentials_problem',
      severity: credentials.healthy === 0 ? 'critical' : 'warning',
      to: '/auth-files?filter=problem',
      count: credentials.problem,
      names: credentials.problemNames.slice(0, 3),
    });
  }

  for (const provider of failingProviders(input.providers)) {
    items.push({
      id: `provider-${provider.id}`,
      kind: 'provider_failing',
      severity: (provider.successRate ?? 100) < SUCCESS_CRITICAL_BELOW ? 'critical' : 'warning',
      to: '/ai-providers',
      names: [provider.id],
      rate: provider.successRate ?? 0,
    });
  }

  if (input.totalFailure > 0) {
    const total = input.totalFailure + input.totalSuccess;
    items.push({
      id: 'recent-failures',
      kind: 'recent_failures',
      severity:
        input.totalFailure >= SMALL_SAMPLE_MIN_FAILURES && input.totalFailure / total > 0.05
          ? 'warning'
          : 'info',
      to: '/logs?level=error',
      count: input.totalFailure,
    });
  }

  if (credentials && credentials.cooling > 0) {
    items.push({
      id: 'cooling',
      kind: 'cooling',
      severity: 'info',
      to: '/auth-files',
      count: credentials.cooling,
    });
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
