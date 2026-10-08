import type { ReactNode } from 'react';
import styles from './StatusBadge.module.scss';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const GLYPHS: Record<StatusTone, string> = {
  success: '✓',
  warning: '!',
  danger: '✕',
  neutral: '–',
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  title?: string;
  className?: string;
}

/**
 * 全站统一的状态徽标（启用 / 停用 / 异常 / 冷却 / 额度耗尽 ……）。
 * 色调 + 形状图标双重编码，颜色不是唯一的信息通道。
 */
export function StatusBadge({ tone, children, title, className }: StatusBadgeProps) {
  return (
    <span
      className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')}
      title={title}
    >
      <span className={styles.glyph} aria-hidden="true">
        {GLYPHS[tone]}
      </span>
      <span className={styles.label}>{children}</span>
    </span>
  );
}
