import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatRelativeAge } from '@/utils/relativeTime';

interface LastUpdatedProps {
  /** 数据最近一次成功取回的时间戳（ms）；null = 尚未成功 */
  timestamp: number | null;
  /** 超过这个时长未更新就标记为“可能已过期” */
  staleAfterMs?: number;
  className?: string;
}

const TICK_MS = 5_000;

/**
 * “更新于 N 秒前”。常驻的真实新鲜度指示，取代恒亮的“Live”徽标。
 */
export function LastUpdated({ timestamp, staleAfterMs, className }: LastUpdatedProps) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  if (timestamp === null) {
    return <span className={className}>{t('common.updated_never')}</span>;
  }

  const ageMs = Math.max(0, now - timestamp);
  const stale = staleAfterMs !== undefined && ageMs > staleAfterMs;
  const time =
    ageMs < TICK_MS ? t('common.just_now') : formatRelativeAge(ageMs / 1000, i18n.language);

  return (
    <span
      className={className}
      data-stale={stale || undefined}
      title={stale ? t('common.stale_data') : new Date(timestamp).toLocaleString(i18n.language)}
    >
      {t('common.updated', { time })}
      {stale ? ` · ${t('common.stale_data')}` : ''}
    </span>
  );
}
