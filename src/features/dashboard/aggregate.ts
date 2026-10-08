import type { ProviderRecentRequests } from '@/components/providers/hooks/useProviderRecentRequests';
import {
  mergeRecentRequestBucketGroups,
  normalizeRecentRequestUsageEntry,
  type RecentRequestBucket,
} from '@/utils/recentRequests';
import type { AuthFileItem } from '@/types/authFile';
import { summarizeCooldowns } from '@/features/authFiles/cooldowns';
import { deriveAuthFileIdentity } from '@/features/authFiles/identity';
import { getCredentialHealth } from '@/features/authFiles/health';
import {
  TRAFFIC_BUCKET_MINUTES,
  type CredentialSummary,
  type ProviderTraffic,
  type TrafficWindow,
} from './types';

export const EMPTY_TRAFFIC: TrafficWindow = {
  buckets: [],
  totalSuccess: 0,
  totalFailure: 0,
  total: 0,
  successRate: null,
  peakTotal: 0,
  peakIndex: -1,
  windowMinutes: 0,
};

/** `api-key-usage` 的键形如 `<baseUrl>|<apiKey>`，取第一个分隔符之后的部分 */
const apiKeyFromCompositeKey = (compositeKey: string): string => {
  const separatorIndex = compositeKey.indexOf('|');
  return separatorIndex < 0 ? '' : compositeKey.slice(separatorIndex + 1).trim();
};

export const providerIdOfAuthFile = (file: AuthFileItem): string => {
  const candidate = String(file.type ?? file.provider ?? '')
    .trim()
    .toLowerCase();
  return candidate && candidate !== 'empty' ? candidate : 'unknown';
};

const sumBuckets = (buckets: RecentRequestBucket[]) => {
  let success = 0;
  let failure = 0;
  for (const bucket of buckets) {
    success += bucket.success;
    failure += bucket.failed;
  }
  return { success, failure, total: success + failure };
};

export const buildTrafficWindow = (bucketGroups: RecentRequestBucket[][]): TrafficWindow => {
  const buckets = mergeRecentRequestBucketGroups(bucketGroups);
  if (buckets.length === 0) return EMPTY_TRAFFIC;

  let peakTotal = 0;
  let peakIndex = -1;
  buckets.forEach((bucket, index) => {
    const bucketTotal = bucket.success + bucket.failed;
    if (bucketTotal > peakTotal) {
      peakTotal = bucketTotal;
      peakIndex = index;
    }
  });

  const { success, failure, total } = sumBuckets(buckets);
  return {
    buckets,
    totalSuccess: success,
    totalFailure: failure,
    total,
    successRate: total > 0 ? (success / total) * 100 : null,
    peakTotal,
    peakIndex,
    windowMinutes: buckets.length * TRAFFIC_BUCKET_MINUTES,
  };
};

interface ProviderAccumulator {
  credentials: number;
  bucketGroups: RecentRequestBucket[][];
}

/**
 * 流量数据有两个互不重叠的来源：`api-key-usage`（配置内联的 API Key 凭证）与
 * `auth-files`（文件/运行时凭证）。二者判定条件互斥，但插件提供的凭证理论上可同时命中，
 * 因此按 `account_type` + `account` 做一次防御性去重。
 *
 * 供应商的请求数一律由窗口内的桶求和得到——后端条目上的 success/failed 是进程启动以来的
 * 累计计数器，与图表、总览不同口径，不能混用。
 */
export function buildTrafficOverview(
  usageByProvider: ProviderRecentRequests,
  authFiles: readonly AuthFileItem[] | null
): { traffic: TrafficWindow; providers: ProviderTraffic[] } {
  const accumulators = new Map<string, ProviderAccumulator>();
  const allBucketGroups: RecentRequestBucket[][] = [];
  const apiKeysFromUsage = new Set<string>();

  const accumulatorFor = (providerId: string): ProviderAccumulator => {
    const existing = accumulators.get(providerId);
    if (existing) return existing;
    const created: ProviderAccumulator = { credentials: 0, bucketGroups: [] };
    accumulators.set(providerId, created);
    return created;
  };

  usageByProvider.forEach((entriesByKey, providerId) => {
    const accumulator = accumulatorFor(providerId);
    entriesByKey.forEach((entry, compositeKey) => {
      const apiKey = apiKeyFromCompositeKey(compositeKey);
      if (apiKey) apiKeysFromUsage.add(apiKey);
      accumulator.credentials += 1;
      if (entry.recentRequests.length > 0) {
        accumulator.bucketGroups.push(entry.recentRequests);
        allBucketGroups.push(entry.recentRequests);
      }
    });
  });

  (authFiles ?? []).forEach((file) => {
    const accountType = String(file.account_type ?? '')
      .trim()
      .toLowerCase();
    const account = String(file.account ?? '').trim();
    if (accountType === 'api_key' && account && apiKeysFromUsage.has(account)) return;

    const accumulator = accumulatorFor(providerIdOfAuthFile(file));
    const entry = normalizeRecentRequestUsageEntry(file);
    accumulator.credentials += 1;
    if (entry.recentRequests.length > 0) {
      accumulator.bucketGroups.push(entry.recentRequests);
      allBucketGroups.push(entry.recentRequests);
    }
  });

  const providers: ProviderTraffic[] = Array.from(accumulators.entries()).map(([id, acc]) => {
    const buckets = mergeRecentRequestBucketGroups(acc.bucketGroups);
    const { success, failure, total } = sumBuckets(buckets);
    return {
      id,
      credentials: acc.credentials,
      success,
      failure,
      total,
      successRate: total > 0 ? (success / total) * 100 : null,
      buckets,
    };
  });

  return { traffic: buildTrafficWindow(allBucketGroups), providers };
}

export const hasActiveCooldown = (file: AuthFileItem, nowMs: number): boolean => {
  const snapshot = file.cooldownSnapshot;
  if (!snapshot?.records) return false;
  const summary = summarizeCooldowns(snapshot, nowMs);
  return summary.credentialWide || summary.modelCount > 0;
};

export function buildCredentialSummary(
  authFiles: readonly AuthFileItem[],
  nowMs: number
): CredentialSummary {
  const summary: CredentialSummary = {
    total: authFiles.length,
    healthy: 0,
    disabled: 0,
    problem: 0,
    cooling: 0,
    problemNames: [],
    byType: [],
  };
  const countsByType = new Map<string, number>();

  for (const file of authFiles) {
    const health = getCredentialHealth(file);
    summary[health.state] += 1;
    if (health.state === 'problem') {
      const identity = deriveAuthFileIdentity(file);
      summary.problemNames.push(identity.primary || identity.fullName);
    }
    if (health.state !== 'disabled' && hasActiveCooldown(file, nowMs)) summary.cooling += 1;

    const type = providerIdOfAuthFile(file);
    countsByType.set(type, (countsByType.get(type) ?? 0) + 1);
  }

  summary.byType = Array.from(countsByType.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return summary;
}

/** 供应商表默认排序：先看出问题的（成功率低且样本足够），再按请求量 */
export function sortProvidersWorstFirst(
  providers: readonly ProviderTraffic[],
  minSample: number
): ProviderTraffic[] {
  const rank = (provider: ProviderTraffic) =>
    provider.total >= minSample && provider.successRate !== null ? provider.successRate : 101;
  return [...providers].sort(
    (a, b) =>
      rank(a) - rank(b) || b.failure - a.failure || b.total - a.total || a.id.localeCompare(b.id)
  );
}
