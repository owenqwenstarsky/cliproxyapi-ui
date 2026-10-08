import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';

/**
 * 返回 `confirmDiscard`：仅当 `dirty` 且未在保存中时弹出“放弃未保存修改？”确认，
 * 其余情况直接放行。可直接作为 <Sheet confirmClose> 或取消按钮的守卫使用。
 */
export function useConfirmDiscard(dirty: boolean, busy = false) {
  const { t } = useTranslation();
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  return useCallback((): Promise<boolean> => {
    if (!dirty || busy) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      showConfirmation({
        title: t('providersPage.unsavedChanges.title'),
        message: t('providersPage.unsavedChanges.message'),
        variant: 'danger',
        confirmText: t('providersPage.unsavedChanges.discard'),
        cancelText: t('providersPage.unsavedChanges.keepEditing'),
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [busy, dirty, showConfirmation, t]);
}
