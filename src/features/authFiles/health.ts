import type { AuthFileItem } from '@/types';

/**
 * 凭证健康度的唯一判定来源。Dashboard、凭证列表、额度页与侧边栏徽标都必须通过这里取值，
 * 避免“不可用”在不同页面含义不同。
 *
 * 冷却（cooldownSnapshot）刻意不参与健康度：它只是运行时限速信息，由 cooldowns.ts 单独呈现。
 */

export type CredentialHealthState = 'healthy' | 'disabled' | 'problem';
export type CredentialProblemReason = 'unavailable' | 'error' | 'status_message';

export interface CredentialHealth {
  state: CredentialHealthState;
  /** 仅当 state === 'problem' 时存在 */
  reason?: CredentialProblemReason;
  /** 后端给出的原始 status_message（可能为空） */
  message: string;
}

/** 这些 status_message 视为健康，不触发告警态。 */
export const HEALTHY_AUTH_FILE_STATUS_MESSAGES = new Set([
  'ok',
  'healthy',
  'ready',
  'success',
  'available',
]);

export const getAuthFileStatusMessage = (file: AuthFileItem): string => {
  const raw = file['status_message'] ?? file.statusMessage;
  if (typeof raw === 'string') return raw.trim();
  if (raw == null) return '';
  return String(raw).trim();
};

/** 是否存在非健康的 status_message（卡片告警态 / 谱条琥珀色共用判定）。 */
export const hasAuthFileStatusWarning = (file: AuthFileItem): boolean => {
  const message = getAuthFileStatusMessage(file);
  return Boolean(message) && !HEALTHY_AUTH_FILE_STATUS_MESSAGES.has(message.toLowerCase());
};

export const getCredentialHealth = (file: AuthFileItem): CredentialHealth => {
  const message = getAuthFileStatusMessage(file);
  const status = typeof file.status === 'string' ? file.status.trim().toLowerCase() : '';

  // 主动停用是独立状态，不算问题
  if (file.disabled === true || status === 'disabled') return { state: 'disabled', message };

  if (file.unavailable === true) return { state: 'problem', reason: 'unavailable', message };
  if (status === 'error') return { state: 'problem', reason: 'error', message };
  if (hasAuthFileStatusWarning(file)) {
    return { state: 'problem', reason: 'status_message', message };
  }
  return { state: 'healthy', message };
};

/** 是否为需要用户处理的问题凭证（主动停用不算）。 */
export const isProblemAuthFile = (file: AuthFileItem): boolean =>
  getCredentialHealth(file).state === 'problem';

export interface CredentialHealthSummary {
  total: number;
  healthy: number;
  disabled: number;
  problem: number;
}

export const summarizeCredentialHealth = (
  files: readonly AuthFileItem[]
): CredentialHealthSummary => {
  const summary: CredentialHealthSummary = {
    total: files.length,
    healthy: 0,
    disabled: 0,
    problem: 0,
  };
  for (const file of files) {
    summary[getCredentialHealth(file).state] += 1;
  }
  return summary;
};

export interface ProviderCredentialCount {
  total: number;
  problem: number;
}

/**
 * 按供应商统计已有凭证数与问题凭证数（OAuth 登录页用它提示“你已经有 N 个了”）。
 * 供应商键与登录卡片共用同一套归一化。
 */
export const countCredentialsByProvider = (
  files: readonly AuthFileItem[],
  normalizeKey: (value: string) => string
): Map<string, ProviderCredentialCount> => {
  const counts = new Map<string, ProviderCredentialCount>();
  for (const file of files) {
    const key = normalizeKey(String(file.type ?? file.provider ?? ''));
    if (!key) continue;
    const entry = counts.get(key) ?? { total: 0, problem: 0 };
    entry.total += 1;
    if (getCredentialHealth(file).state === 'problem') entry.problem += 1;
    counts.set(key, entry);
  }
  return counts;
};
