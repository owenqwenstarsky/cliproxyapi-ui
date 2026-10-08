import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconX } from '../icons';
import { lockScroll, unlockScroll } from '../scrollLock';
import { useDialogBehavior } from '../useDialogBehavior';
import styles from './Sheet.module.scss';

export type SheetSize = 'md' | 'lg' | 'xl';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  size?: SheetSize;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  closeDisabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * If provided, called before starting the close animation when the user
   * triggers a close (Escape, overlay click, or close button). Return false
   * (or a Promise that resolves to false) to keep the sheet open.
   */
  confirmClose?: () => boolean | Promise<boolean>;
}

const CLOSE_ANIMATION_DURATION = 280;
const SIZE_CLASS: Record<SheetSize, string> = {
  md: styles.sizeMd,
  lg: styles.sizeLg,
  xl: styles.sizeXl,
};

export function Sheet({
  open,
  onClose,
  size = 'md',
  eyebrow,
  title,
  description,
  footer,
  closeDisabled = false,
  className,
  ariaLabel,
  confirmClose,
  children,
}: PropsWithChildren<SheetProps>) {
  const { t } = useTranslation();
  const titleId = useId();
  const descId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用户已发起关闭、动画进行中：此时父组件重渲染不得把这次关闭取消掉
  const userClosingRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const startClose = useCallback(
    (notifyParent: boolean) => {
      if (closeTimerRef.current !== null) return;
      if (notifyParent) userClosingRef.current = true;
      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
        closeTimerRef.current = null;
        userClosingRef.current = false;
        if (notifyParent) {
          onClose();
        }
      }, CLOSE_ANIMATION_DURATION);
    },
    [onClose]
  );

  useEffect(() => {
    let cancelled = false;

    if (open) {
      // startClose 的身份会随父组件重渲染变化，使本 effect 重跑；关闭动画进行中不能被它打断，
      // 否则确认框一关（触发重渲染），刚确认放弃的面板又“弹”了回来
      if (userClosingRef.current) return;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      queueMicrotask(() => {
        if (cancelled) return;
        setIsVisible(true);
        setIsClosing(false);
      });
    } else if (isVisible) {
      queueMicrotask(() => {
        if (cancelled) return;
        startClose(false);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [open, isVisible, startClose]);

  const handleClose = useCallback(async () => {
    if (confirmClose) {
      try {
        const ok = await confirmClose();
        if (ok === false) return;
      } catch {
        return;
      }
    }
    startClose(true);
  }, [confirmClose, startClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const shouldLockScroll = open || isVisible;

  useEffect(() => {
    if (!shouldLockScroll) return;
    lockScroll();
    return () => unlockScroll();
  }, [shouldLockScroll]);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [open]);

  useDialogBehavior({
    open,
    visible: isVisible,
    containerRef: sheetRef,
    closeButtonRef: closeBtnRef,
    closeDisabled,
    onRequestClose: handleClose,
  });

  if (!open && !isVisible) return null;

  const stateClass = isClosing ? styles.exiting : styles.entering;
  const overlayCls = `${styles.overlay} ${stateClass}`.trim();
  const contentCls = [styles.content, SIZE_CLASS[size], stateClass, className]
    .filter(Boolean)
    .join(' ');

  const content = (
    <div
      className={overlayCls}
      role="presentation"
      onMouseDown={(e) => {
        if (closeDisabled) return;
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={sheetRef}
        className={contentCls}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-label={!title && ariaLabel ? ariaLabel : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className={styles.closeBtn}
          onClick={closeDisabled ? undefined : handleClose}
          disabled={closeDisabled}
          aria-label={t('common.close')}
        >
          <IconX size={18} />
        </button>
        {(eyebrow || title || description) && (
          <div className={styles.header}>
            {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
            {title ? (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descId} className={styles.description}>
                {description}
              </p>
            ) : null}
          </div>
        )}
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
