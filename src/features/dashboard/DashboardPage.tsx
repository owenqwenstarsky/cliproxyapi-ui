import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LastUpdated } from '@/components/ui/LastUpdated';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge';
import { useAuthStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { formatCompactNumber, formatDateValue, formatPercent } from '@/utils/format';
import { DASHBOARD_REFRESH_MS, useDashboardOverview } from './hooks/useDashboardOverview';
import { sortProvidersWorstFirst } from './aggregate';
import {
  MIN_SAMPLE_REQUESTS,
  buildAttentionItems,
  buildVerdict,
  type AttentionItem,
  type VerdictLevel,
  type VerdictReason,
} from './verdict';
import { Meter } from './components/Meter';
import { Sparkline } from './components/Sparkline';
import { ThroughputChart } from './components/ThroughputChart';
import { TRAFFIC_BUCKET_MINUTES } from './types';
import { providerLabel, splitWindowMinutes, toneForSuccessRate } from './utils';
import styles from './dashboard.module.scss';

const DASH = '—';

/** 后端固定返回 20 个 10 分钟的桶 */
const DEFAULT_WINDOW_MINUTES = 20 * TRAFFIC_BUCKET_MINUTES;

const VERDICT_GLYPH: Record<VerdictLevel, string> = {
  healthy: '✓',
  idle: '–',
  attention: '!',
  critical: '✕',
  connecting: '…',
  offline: '–',
};

const ATTENTION_TONE: Record<AttentionItem['severity'], StatusTone> = {
  critical: 'danger',
  warning: 'warning',
  info: 'neutral',
};

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);

  const {
    connectionStatus,
    connected,
    config,
    counts,
    traffic,
    providers,
    credentials,
    refresh,
    updatedAt,
    status,
  } = useDashboardOverview();

  useHeaderRefresh(refresh, connected);

  const unknownProviderLabel = t('dashboard.provider_unknown');
  const nameOf = (id: string) => providerLabel(id, unknownProviderLabel);

  const windowLabel = useMemo(() => {
    // 窗口由后端固定为 20 桶；还没有数据时也如实说明它覆盖多久，而不是显示破折号
    const windowMinutes = traffic.windowMinutes || DEFAULT_WINDOW_MINUTES;
    const { hours, minutes } = splitWindowMinutes(windowMinutes);
    if (hours === 0) return t('dashboard.window_m', { minutes });
    if (minutes === 0) return t('dashboard.window_h', { hours });
    return t('dashboard.window_hm', { hours, minutes });
  }, [traffic.windowMinutes, t]);

  const loading = connected && (status.traffic.loading || status.credentials.loading);
  const trafficFailed = status.traffic.error && !status.traffic.ready;
  const credentialsFailed = status.credentials.error && !status.credentials.ready;

  const verdict = useMemo(
    () =>
      buildVerdict({
        connection: connectionStatus,
        traffic,
        providers,
        credentials,
        errors: { traffic: status.traffic.error, credentials: status.credentials.error },
      }),
    [
      connectionStatus,
      traffic,
      providers,
      credentials,
      status.traffic.error,
      status.credentials.error,
    ]
  );

  const attention = useMemo(
    () =>
      buildAttentionItems({
        providers,
        credentials,
        totalFailure: traffic.totalFailure,
        totalSuccess: traffic.totalSuccess,
      }),
    [providers, credentials, traffic.totalFailure, traffic.totalSuccess]
  );

  const sortedProviders = useMemo(
    () => sortProvidersWorstFirst(providers, MIN_SAMPLE_REQUESTS),
    [providers]
  );

  // 供应商迷你图共用一个纵轴，才能横向比较忙闲
  const sparkMax = useMemo(
    () =>
      providers.reduce(
        (peak, provider) =>
          Math.max(peak, ...provider.buckets.map((bucket) => bucket.success + bucket.failed)),
        0
      ),
    [providers]
  );

  const describeReason = (reason: VerdictReason): string => {
    switch (reason.kind) {
      case 'all_credentials_down':
        return t('dashboard.reason.all_credentials_down', { count: reason.problem });
      case 'credentials_problem':
        return t('dashboard.reason.credentials_problem', {
          count: reason.count,
          total: reason.total,
        });
      case 'low_success':
        return t('dashboard.reason.low_success', { rate: formatPercent(reason.rate) });
      case 'provider_failing':
        return t('dashboard.reason.provider_failing', {
          provider: nameOf(reason.id),
          rate: formatPercent(reason.rate),
        });
      case 'data_error':
        return t(`dashboard.reason.data_error_${reason.source}`);
    }
  };

  const statusDetail = (() => {
    if (verdict.reasons.length > 0) {
      return verdict.reasons.slice(0, 3).map(describeReason).join(' · ');
    }
    if (verdict.level === 'healthy') {
      return t('dashboard.status_detail_healthy', {
        rate: formatPercent(traffic.successRate ?? 100),
        total: traffic.total.toLocaleString(),
        window: windowLabel,
      });
    }
    if (verdict.level === 'idle') return t('dashboard.status_detail_idle', { window: windowLabel });
    if (verdict.level === 'offline') return t('dashboard.status_detail_offline');
    return '';
  })();

  const describeAttention = (item: AttentionItem): { title: string; detail?: string } => {
    const names = item.names ?? [];
    switch (item.kind) {
      case 'credentials_problem': {
        const extra = (item.count ?? 0) - names.length;
        const detail = names.join(', ') + (extra > 0 ? ` +${extra}` : '');
        return {
          title: t('dashboard.attention.credentials_problem', { count: item.count }),
          detail: detail || undefined,
        };
      }
      case 'provider_failing':
        return {
          title: t('dashboard.attention.provider_failing', {
            provider: nameOf(names[0] ?? ''),
            rate: formatPercent(item.rate ?? 0),
          }),
          detail: t('dashboard.attention.provider_failing_detail', { window: windowLabel }),
        };
      case 'recent_failures':
        return {
          title: t('dashboard.attention.recent_failures', {
            count: item.count,
            window: windowLabel,
          }),
        };
      case 'cooling':
        return { title: t('dashboard.attention.cooling', { count: item.count }) };
    }
  };

  const hasRate = traffic.total > 0 && traffic.successRate !== null;
  const hasSample = traffic.total >= MIN_SAMPLE_REQUESTS && traffic.successRate !== null;
  // 小样本也如实显示数字，但不用颜色下结论
  const successTone = hasSample ? toneForSuccessRate(traffic.successRate) : 'idle';

  const routingStrategy = (() => {
    const raw = config?.routingStrategy?.trim() ?? '';
    if (!raw) return DASH;
    if (raw === 'round-robin') return t('basic_settings.routing_strategy_round_robin');
    if (raw === 'weighted-round-robin') {
      return t('basic_settings.routing_strategy_weighted_round_robin');
    }
    if (raw === 'fill-first') return t('basic_settings.routing_strategy_fill_first');
    return raw;
  })();

  const runtimeRows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t('dashboard.runtime_routing'), value: routingStrategy },
    { label: t('dashboard.runtime_retry'), value: String(config?.requestRetry ?? 0) },
    {
      label: t('dashboard.runtime_management_keys'),
      value: counts.managementKeys === null ? DASH : String(counts.managementKeys),
    },
    { label: t('dashboard.runtime_version'), value: serverVersion?.trim() || DASH },
    {
      label: t('dashboard.runtime_build'),
      value: formatDateValue(serverBuildDate, i18n.language) || DASH,
    },
    { label: t('dashboard.runtime_proxy'), value: config?.proxyUrl?.trim() || DASH, mono: true },
  ];

  // 调试 / 请求日志开着是需要留意的状态，用警示色标出；其余开关保持中性
  const runtimeToggles = config
    ? [
        { label: t('dashboard.runtime_debug'), on: Boolean(config.debug), risky: true },
        { label: t('dashboard.runtime_file_logging'), on: Boolean(config.loggingToFile) },
        { label: t('dashboard.runtime_request_log'), on: Boolean(config.requestLog), risky: true },
        { label: t('dashboard.runtime_ws_auth'), on: Boolean(config.wsAuth) },
        { label: t('dashboard.runtime_model_prefix'), on: Boolean(config.forceModelPrefix) },
      ]
    : [];

  const retryButton = (
    <Button variant="secondary" size="sm" onClick={() => void refresh()}>
      {t('dashboard.retry')}
    </Button>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('nav.dashboard')}
        description={t('dashboard.page_description')}
        meta={<LastUpdated timestamp={updatedAt} staleAfterMs={DASHBOARD_REFRESH_MS * 2} />}
      />

      {/* ---------- 结论条 ---------- */}
      {loading ? (
        <Skeleton className={styles.statusSkeleton} />
      ) : (
        <section
          className={`${styles.status} ${styles[`status_${verdict.level}`]}`}
          aria-labelledby="dashboard-status-title"
        >
          <span className={styles.statusGlyph} aria-hidden="true">
            {VERDICT_GLYPH[verdict.level]}
          </span>
          <div className={styles.statusText}>
            <h2 id="dashboard-status-title" className={styles.statusTitle}>
              {t(`dashboard.verdict.${verdict.level}`)}
            </h2>
            {statusDetail ? <p className={styles.statusDetail}>{statusDetail}</p> : null}
          </div>
        </section>
      )}

      {/* ---------- 需要处理 ---------- */}
      <section className={styles.panel} aria-labelledby="dashboard-attention-title">
        <header className={styles.panelHead}>
          <h2 id="dashboard-attention-title" className={styles.panelTitle}>
            {t('dashboard.attention.title')}
          </h2>
          {attention.length > 0 ? <span className={styles.count}>{attention.length}</span> : null}
        </header>

        {loading ? (
          <div className={styles.rows}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : (
          <>
            {(trafficFailed || credentialsFailed) && (
              <div className={styles.errorNote} role="alert">
                <span>
                  {trafficFailed && credentialsFailed
                    ? t('dashboard.error_all')
                    : trafficFailed
                      ? t('dashboard.error_traffic')
                      : t('dashboard.error_credentials')}
                </span>
                {retryButton}
              </div>
            )}
            {attention.length === 0 && !trafficFailed && !credentialsFailed ? (
              <p className={styles.allClear}>
                <span aria-hidden="true">✓</span> {t('dashboard.attention.empty')}
              </p>
            ) : (
              <ul className={styles.rows}>
                {attention.map((item) => {
                  const { title, detail } = describeAttention(item);
                  return (
                    <li key={item.id}>
                      <Link to={item.to} className={styles.attentionRow}>
                        <StatusBadge tone={ATTENTION_TONE[item.severity]}>
                          {t(`dashboard.attention.severity_${item.severity}`)}
                        </StatusBadge>
                        <span className={styles.attentionText}>
                          <span className={styles.attentionTitle}>{title}</span>
                          {detail ? <span className={styles.attentionDetail}>{detail}</span> : null}
                        </span>
                        <span className={styles.attentionAction}>
                          {t('dashboard.attention.review')} <span aria-hidden="true">→</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ---------- 关键数字 ---------- */}
      <section className={styles.kpiGrid} aria-label={t('dashboard.kpi.label')}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('dashboard.kpi.requests')}</span>
          {status.traffic.ready ? (
            <>
              <b className={styles.kpiValue}>
                {traffic.total < 100_000
                  ? traffic.total.toLocaleString()
                  : formatCompactNumber(traffic.total)}
              </b>
              <span className={styles.kpiHint}>
                {t('dashboard.kpi.requests_hint', {
                  window: windowLabel,
                  failed: traffic.totalFailure.toLocaleString(),
                })}
              </span>
            </>
          ) : (
            <KpiPlaceholder loading={status.traffic.loading} />
          )}
        </div>

        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>{t('dashboard.success_rate')}</span>
          {status.traffic.ready ? (
            <>
              <b className={styles.kpiValue}>
                {hasRate ? formatPercent(traffic.successRate ?? 0) : DASH}
              </b>
              {hasRate ? (
                <Meter
                  value={traffic.successRate}
                  tone={successTone}
                  ariaLabel={t('dashboard.success_rate')}
                />
              ) : null}
              <span className={styles.kpiHint}>
                {hasSample
                  ? t('dashboard.kpi.success_hint', { window: windowLabel })
                  : hasRate
                    ? t('dashboard.kpi.success_small_sample', { count: traffic.total })
                    : t('dashboard.kpi.success_no_requests', { window: windowLabel })}
              </span>
            </>
          ) : (
            <KpiPlaceholder loading={status.traffic.loading} />
          )}
        </div>

        <Link to="/auth-files" className={`${styles.kpi} ${styles.kpiLink}`}>
          <span className={styles.kpiLabel}>{t('dashboard.stat_credentials')}</span>
          {credentials ? (
            <>
              <b className={styles.kpiValue}>
                {credentials.healthy.toLocaleString()}
                <span className={styles.kpiOf}> / {credentials.total.toLocaleString()}</span>
              </b>
              <span
                className={`${styles.kpiHint} ${credentials.problem > 0 ? styles.kpiHintAlert : ''}`}
              >
                {credentials.problem > 0
                  ? t('dashboard.kpi.credentials_problem', { count: credentials.problem })
                  : credentials.disabled > 0
                    ? t('dashboard.kpi.credentials_disabled', { count: credentials.disabled })
                    : credentials.total > 0
                      ? t('dashboard.kpi.credentials_ok')
                      : t('dashboard.stat_credentials_empty')}
              </span>
            </>
          ) : (
            <KpiPlaceholder loading={status.credentials.loading} />
          )}
        </Link>

        <Link to="/ai-providers" className={`${styles.kpi} ${styles.kpiLink}`}>
          <span className={styles.kpiLabel}>{t('dashboard.stat_provider_keys')}</span>
          {counts.providerKeys === null ? (
            <KpiPlaceholder loading={!status.config.error} />
          ) : (
            <>
              <b className={styles.kpiValue}>{counts.providerKeys.toLocaleString()}</b>
              <span className={styles.kpiHint}>
                {counts.models === null
                  ? t('dashboard.stat_provider_keys_hint')
                  : t('dashboard.kpi.providers_hint', { models: counts.models.toLocaleString() })}
              </span>
            </>
          )}
        </Link>
      </section>

      {/* ---------- 流量 ---------- */}
      <section className={styles.panel} aria-labelledby="dashboard-traffic-title">
        <header className={styles.panelHead}>
          <div>
            <h2 id="dashboard-traffic-title" className={styles.panelTitle}>
              {t('dashboard.traffic_title')}
            </h2>
            <p className={styles.panelSub}>
              {t('dashboard.traffic_subtitle', { window: windowLabel })}
            </p>
          </div>
        </header>
        {status.traffic.loading ? (
          <Skeleton height={240} />
        ) : trafficFailed ? (
          <div className={styles.errorNote} role="alert">
            <span>{t('dashboard.error_traffic')}</span>
            {retryButton}
          </div>
        ) : (
          <ThroughputChart traffic={traffic} />
        )}
      </section>

      {/* ---------- 供应商 + 凭证 ---------- */}
      <div className={styles.split}>
        <section className={styles.panel} aria-labelledby="dashboard-providers-title">
          <header className={styles.panelHead}>
            <h2 id="dashboard-providers-title" className={styles.panelTitle}>
              {t('dashboard.providers_title')}
            </h2>
          </header>
          {status.traffic.loading ? (
            <Skeleton height={160} />
          ) : trafficFailed ? (
            <p className={styles.emptyNote}>{t('dashboard.error_traffic')}</p>
          ) : sortedProviders.length === 0 ? (
            <p className={styles.emptyNote}>{t('dashboard.providers_empty')}</p>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className={styles.srOnly}>{t('dashboard.providers_title')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('dashboard.col_provider')}</th>
                      <th scope="col" className={styles.num}>
                        {t('dashboard.col_requests')}
                      </th>
                      <th scope="col" className={styles.num}>
                        {t('dashboard.col_failures')}
                      </th>
                      <th scope="col">{t('dashboard.success_rate')}</th>
                      <th scope="col" className={styles.trendCol}>
                        {t('dashboard.col_trend')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProviders.map((provider) => {
                      const rateKnown =
                        provider.total >= MIN_SAMPLE_REQUESTS && provider.successRate !== null;
                      return (
                        <tr key={provider.id}>
                          <th scope="row">
                            <Link to="/ai-providers" className={styles.providerLink}>
                              {nameOf(provider.id)}
                            </Link>
                            <span className={styles.providerSub}>
                              {t('dashboard.provider_credentials', { count: provider.credentials })}
                            </span>
                          </th>
                          <td className={styles.num}>{provider.total.toLocaleString()}</td>
                          <td
                            className={`${styles.num} ${provider.failure > 0 ? styles.failureCell : ''}`}
                          >
                            {provider.failure.toLocaleString()}
                          </td>
                          <td>
                            {provider.successRate === null ? (
                              <span className={styles.muted}>{DASH}</span>
                            ) : (
                              <span className={styles.rateCell}>
                                <b>{formatPercent(provider.successRate)}</b>
                                <Meter
                                  value={provider.successRate}
                                  tone={rateKnown ? undefined : 'idle'}
                                  ariaLabel={t('dashboard.success_rate')}
                                  className={styles.rateMeter}
                                />
                              </span>
                            )}
                          </td>
                          <td className={styles.trendCol}>
                            <Sparkline
                              points={provider.buckets.map(
                                (bucket) => bucket.success + bucket.failed
                              )}
                              max={sparkMax}
                              ariaLabel={t('dashboard.provider_trend_label', {
                                provider: nameOf(provider.id),
                              })}
                              className={styles.sparkline}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={styles.footnote}>
                {t('dashboard.providers_footnote', { window: windowLabel })}
              </p>
            </>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="dashboard-credentials-title">
          <header className={styles.panelHead}>
            <h2 id="dashboard-credentials-title" className={styles.panelTitle}>
              {t('dashboard.health_title')}
            </h2>
          </header>
          {status.credentials.loading ? (
            <Skeleton height={160} />
          ) : credentialsFailed ? (
            <div className={styles.errorNote} role="alert">
              <span>{t('dashboard.error_credentials')}</span>
              {retryButton}
            </div>
          ) : !credentials || credentials.total === 0 ? (
            <p className={styles.emptyNote}>{t('dashboard.health_empty')}</p>
          ) : (
            <>
              <div
                className={styles.healthBar}
                role="img"
                aria-label={t('dashboard.health_bar_label', {
                  healthy: credentials.healthy,
                  problem: credentials.problem,
                  disabled: credentials.disabled,
                })}
              >
                {credentials.healthy > 0 && (
                  <span
                    className={`${styles.healthSegment} ${styles.healthActive}`}
                    style={{ flexGrow: credentials.healthy }}
                  />
                )}
                {credentials.problem > 0 && (
                  <span
                    className={`${styles.healthSegment} ${styles.healthProblem}`}
                    style={{ flexGrow: credentials.problem }}
                  />
                )}
                {credentials.disabled > 0 && (
                  <span
                    className={`${styles.healthSegment} ${styles.healthDisabled}`}
                    style={{ flexGrow: credentials.disabled }}
                  />
                )}
              </div>
              <ul className={styles.healthLegend}>
                <li>
                  <i className={`${styles.healthKey} ${styles.healthActive}`} aria-hidden="true" />
                  {t('dashboard.health_active')}
                  <b>{credentials.healthy.toLocaleString()}</b>
                </li>
                <li>
                  <i className={`${styles.healthKey} ${styles.healthProblem}`} aria-hidden="true" />
                  <Link to="/auth-files?filter=problem">{t('dashboard.health_unavailable')}</Link>
                  <b>{credentials.problem.toLocaleString()}</b>
                </li>
                <li>
                  <i
                    className={`${styles.healthKey} ${styles.healthDisabled}`}
                    aria-hidden="true"
                  />
                  {t('dashboard.health_disabled')}
                  <b>{credentials.disabled.toLocaleString()}</b>
                </li>
              </ul>
              <ul className={styles.typeList}>
                {credentials.byType.map((entry) => (
                  <li key={entry.type} className={styles.typeChip}>
                    {nameOf(entry.type)}
                    <b>{entry.count.toLocaleString()}</b>
                  </li>
                ))}
              </ul>
              <Link to="/auth-files" className={styles.panelLink}>
                {t('dashboard.health_link')} <span aria-hidden="true">→</span>
              </Link>
            </>
          )}
        </section>
      </div>

      {/* ---------- 运行时（默认折叠） ---------- */}
      <details className={styles.runtime}>
        <summary className={styles.runtimeSummary}>{t('dashboard.runtime_title')}</summary>
        <div className={styles.runtimeBody}>
          <dl className={styles.specList}>
            {runtimeRows.map((row) => (
              <div key={row.label} className={styles.specRow}>
                <dt className={styles.specLabel}>{row.label}</dt>
                <dd className={`${styles.specValue} ${row.mono ? styles.specMono : ''}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {runtimeToggles.length > 0 && (
            <ul className={styles.toggleList}>
              {runtimeToggles.map((toggle) => (
                <li key={toggle.label}>
                  <StatusBadge
                    tone={toggle.on ? (toggle.risky ? 'warning' : 'success') : 'neutral'}
                  >
                    {toggle.label}: {toggle.on ? t('common.yes') : t('common.no')}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
          <Link to="/config" className={styles.panelLink}>
            {t('dashboard.runtime_link')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </details>
    </div>
  );
}

function KpiPlaceholder({ loading }: { loading: boolean }) {
  return loading ? (
    <>
      <Skeleton height={30} width="60%" />
      <Skeleton height={14} width="80%" />
    </>
  ) : (
    <b className={styles.kpiValue}>{DASH}</b>
  );
}
