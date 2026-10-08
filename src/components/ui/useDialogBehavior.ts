import { useCallback, useEffect, useId, useRef, type RefObject } from 'react';
import { isTopDialog, pickInitialFocus, pushDialog, removeDialog } from './dialogStack';
import { FOCUSABLE_SELECTOR } from './scrollLock';

interface UseDialogBehaviorOptions {
  /** 对话框是否处于打开状态（受控 open 属性） */
  open: boolean;
  /** 对话框是否仍挂载在 DOM 中（含关闭动画期间） */
  visible: boolean;
  containerRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLElement | null>;
  closeDisabled?: boolean;
  onRequestClose: () => void;
}

/**
 * 焦点陷阱 + Escape + 初始焦点 + 焦点还原，供 Modal 与 Sheet 共用。
 * 同时打开多个对话框时，只有栈顶的响应键盘事件。
 */
export function useDialogBehavior({
  open,
  visible,
  containerRef,
  closeButtonRef,
  closeDisabled = false,
  onRequestClose,
}: UseDialogBehaviorOptions) {
  const dialogId = useId();
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    const container = containerRef.current;
    if (!container) return [] as HTMLElement[];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1
    );
  }, [containerRef]);

  useEffect(() => {
    if (!open) return;
    pushDialog(dialogId);
    return () => removeDialog(dialogId);
  }, [dialogId, open]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const target = pickInitialFocus(
        getFocusableElements(),
        closeButtonRef.current,
        (element) => element.hasAttribute('data-autofocus')
      );
      (target ?? containerRef.current)?.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [closeButtonRef, containerRef, getFocusableElements, open]);

  useEffect(() => {
    if (open || visible) return;
    const previous = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    if (previous && previous.isConnected) previous.focus();
  }, [open, visible]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialogId)) return;

      if (event.key === 'Escape') {
        if (closeDisabled || event.defaultPrevented) return;
        event.preventDefault();
        onRequestClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === container) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, containerRef, dialogId, getFocusableElements, onRequestClose, open]);
}
