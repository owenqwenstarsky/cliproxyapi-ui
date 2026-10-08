import type { ReactNode } from 'react';
import styles from './PageHeader.module.scss';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 标题下方的状态行（计数、最后更新时间等） */
  meta?: ReactNode;
  /** 右侧操作区 */
  actions?: ReactNode;
  className?: string;
}

/** 页面标题 + 说明 + 操作区的统一布局，每个路由页只应渲染一个。 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(' ')}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {meta ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
