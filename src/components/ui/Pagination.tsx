import { useTranslation } from 'react-i18next';
import { getPageItems } from './paginationModel';
import styles from './Pagination.module.scss';

interface PaginationProps {
  /** 当前页，从 1 开始 */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** 总条目数，用于“共 N 条”摘要 */
  totalItems?: number;
  className?: string;
}

export function Pagination({ page, pageCount, onChange, totalItems, className }: PaginationProps) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(1, page), pageCount);
  const items = getPageItems(current, pageCount);

  return (
    <nav
      className={[styles.nav, className].filter(Boolean).join(' ')}
      aria-label={t('common.pagination_label')}
    >
      {typeof totalItems === 'number' ? (
        <span className={styles.summary}>
          {t('common.pagination_total', { count: totalItems })}
        </span>
      ) : null}
      <button
        type="button"
        className={styles.step}
        onClick={() => onChange(current - 1)}
        disabled={current <= 1}
      >
        {t('common.pagination_prev')}
      </button>
      {items.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className={styles.gap} aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`${styles.page} ${item === current ? styles.current : ''}`}
            onClick={() => onChange(item)}
            aria-current={item === current ? 'page' : undefined}
            aria-label={t('common.pagination_page', { page: item })}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className={styles.step}
        onClick={() => onChange(current + 1)}
        disabled={current >= pageCount}
      >
        {t('common.pagination_next')}
      </button>
    </nav>
  );
}
