import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFilesApi } from '@/services/api';
import { useAuthStore, useConfigStore, useModelsStore } from '@/stores';
import { useApiKeysForModels } from '@/hooks/useApiKeysForModels';
import { useInterval } from '@/hooks/useInterval';
import { useProviderRecentRequests } from '@/components/providers/hooks/useProviderRecentRequests';
import type { Config } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import { buildCredentialSummary, buildTrafficOverview } from '../aggregate';
import type { DashboardCounts } from '../types';

/** 与 useProviderRecentRequests 的刷新周期一致：整页数据同一节奏刷新 */
export const DASHBOARD_REFRESH_MS = 240_000;

export const getProviderKeyCounts = (config: Config) => ({
  gemini: config.geminiApiKeys?.length ?? 0,
  interactions: config.interactionsApiKeys?.length ?? 0,
  codex: config.codexApiKeys?.length ?? 0,
  meta: config.metaApiKeys?.length ?? 0,
  xai: config.xaiApiKeys?.length ?? 0,
  claude: config.claudeApiKeys?.length ?? 0,
  vertex: config.vertexApiKeys?.length ?? 0,
  openai: config.openaiCompatibility?.length ?? 0,
});

/**
 * 汇总仪表盘所需的全部数据，并如实暴露每个来源的加载 / 失败 / 更新时间，
 * 让页面能区分“还在加载”“加载失败”“确实为空”。
 */
export function useDashboardOverview() {
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const modelsError = useModelsStore((state) => state.error);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const connected = connectionStatus === 'connected';
  const resolveApiKeysForModels = useApiKeysForModels();

  const {
    usageByProvider,
    refreshRecentRequests,
    isLoading: trafficLoading,
    hasError: trafficError,
    updatedAt: trafficUpdatedAt,
  } = useProviderRecentRequests({ enabled: connected });

  const [authFiles, setAuthFiles] = useState<AuthFileItem[] | null>(null);
  const [authFilesLoading, setAuthFilesLoading] = useState(false);
  const [authFilesError, setAuthFilesError] = useState(false);
  const [authFilesUpdatedAt, setAuthFilesUpdatedAt] = useState<number | null>(null);
  const [configError, setConfigError] = useState(false);
  const authFilesRequestRef = useRef(0);

  const loadAuthFiles = useCallback(async () => {
    if (!connected) return;
    const requestId = ++authFilesRequestRef.current;
    setAuthFilesLoading(true);
    try {
      const response = await authFilesApi.list();
      if (requestId !== authFilesRequestRef.current) return;
      setAuthFiles(response.files);
      setAuthFilesError(false);
      setAuthFilesUpdatedAt(Date.now());
    } catch {
      if (requestId !== authFilesRequestRef.current) return;
      // 保留上一次成功的数据，只标记失败；绝不把“请求失败”伪装成“没有凭证”
      setAuthFilesError(true);
    } finally {
      if (requestId === authFilesRequestRef.current) setAuthFilesLoading(false);
    }
  }, [connected]);

  const loadConfig = useCallback(
    async (force = false) => {
      if (!connected) return;
      try {
        await fetchConfig(force);
        setConfigError(false);
      } catch {
        setConfigError(true);
      }
    },
    [connected, fetchConfig]
  );

  const loadModels = useCallback(async () => {
    if (!connected || !apiBase) return;
    try {
      const apiKeys = await resolveApiKeysForModels();
      await fetchModelsFromStore(apiBase, apiKeys[0]);
    } catch {
      // 模型列表失败不应影响仪表盘其余部分
    }
  }, [connected, apiBase, resolveApiKeysForModels, fetchModelsFromStore]);

  useEffect(() => {
    if (!connected) return;
    void loadConfig();
    void loadAuthFiles();
    void loadModels();
    // 断开 / 切换连接后，旧会话的异步结果不得写入新会话
    return () => {
      authFilesRequestRef.current += 1;
    };
  }, [connected, apiBase, loadConfig, loadAuthFiles, loadModels]);

  // 凭证与配置此前只在挂载时取一次，页面开着就越来越旧；与流量数据同一节奏轮询
  useInterval(
    () => {
      void loadAuthFiles();
      void loadConfig(true);
    },
    connected ? DASHBOARD_REFRESH_MS : null
  );

  /**
   * 手动刷新由顶栏刷新按钮触发，它已经先清缓存并强制取了一次配置；
   * 这里不再强制，直接复用那次进行中的请求（之前页面会再取一次，共两次）。
   */
  const refresh = useCallback(async () => {
    if (!connected) return;
    await Promise.allSettled([
      loadConfig(),
      loadAuthFiles(),
      loadModels(),
      refreshRecentRequests(),
    ]);
  }, [connected, loadConfig, loadAuthFiles, loadModels, refreshRecentRequests]);

  const providerKeyCounts = useMemo(() => (config ? getProviderKeyCounts(config) : null), [config]);

  const { traffic, providers } = useMemo(
    () => buildTrafficOverview(usageByProvider, authFiles),
    [usageByProvider, authFiles]
  );

  const credentials = useMemo(
    // 冷却倒计时按取回时刻计算，避免渲染期读取时钟
    () => (authFiles ? buildCredentialSummary(authFiles, authFilesUpdatedAt ?? 0) : null),
    [authFiles, authFilesUpdatedAt]
  );

  const counts = useMemo<DashboardCounts>(
    () => ({
      managementKeys: config ? (config.apiKeys?.length ?? 0) : null,
      providerKeys: providerKeyCounts
        ? Object.values(providerKeyCounts).reduce((sum, count) => sum + count, 0)
        : null,
      credentials: authFiles ? authFiles.length : null,
      models: modelsLoading || modelsError ? null : models.length,
    }),
    [config, providerKeyCounts, authFiles, models.length, modelsLoading, modelsError]
  );

  // 诚实的新鲜度：取各来源中最旧的那次成功时间
  const updatedAt = useMemo(() => {
    const stamps = [trafficUpdatedAt, authFilesUpdatedAt].filter(
      (value): value is number => value !== null
    );
    return stamps.length === 2 ? Math.min(...stamps) : null;
  }, [trafficUpdatedAt, authFilesUpdatedAt]);

  return {
    connectionStatus,
    connected,
    config,
    counts,
    providerKeyCounts,
    traffic,
    providers,
    credentials,
    refresh,
    updatedAt,
    status: {
      traffic: {
        loading: trafficLoading && trafficUpdatedAt === null,
        error: trafficError,
        ready: trafficUpdatedAt !== null,
      },
      credentials: {
        loading: authFilesLoading && authFiles === null,
        error: authFilesError,
        ready: authFiles !== null,
      },
      config: { error: configError, ready: config !== null },
    },
  };
}
