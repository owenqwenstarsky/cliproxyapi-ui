import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores';
import { getErrorMessage } from '@/utils/helpers';

export function ConfirmationModal() {
  const { t } = useTranslation();
  const confirmation = useNotificationStore((state) => state.confirmation);
  const hideConfirmation = useNotificationStore((state) => state.hideConfirmation);
  const setConfirmationLoading = useNotificationStore((state) => state.setConfirmationLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { isOpen, isLoading, options } = confirmation;

  if (!isOpen || !options) {
    return null;
  }

  const {
    title,
    message,
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
    variant = 'primary',
  } = options;

  const handleConfirm = async () => {
    setErrorMessage(null);
    try {
      setConfirmationLoading(true);
      await onConfirm();
      hideConfirmation();
    } catch (error) {
      // 失败时保持对话框打开并显示原因，避免用户误以为操作已成功
      setErrorMessage(getErrorMessage(error, t('common.unknown_error')));
    } finally {
      setConfirmationLoading(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) {
      return;
    }
    setErrorMessage(null);
    if (onCancel) {
      onCancel();
    }
    hideConfirmation();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleCancel}
      title={title}
      closeDisabled={isLoading}
      footer={
        <>
          <Button variant="ghost" onClick={handleCancel} disabled={isLoading} data-autofocus>
            {cancelText || t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleConfirm} loading={isLoading}>
            {confirmText || t('common.confirm')}
          </Button>
        </>
      }
    >
      {typeof message === 'string' ? <p>{message}</p> : <div>{message}</div>}
      {errorMessage ? (
        <div className="error-box" role="alert" style={{ marginTop: 12 }}>
          {errorMessage}
        </div>
      ) : null}
    </Modal>
  );
}
