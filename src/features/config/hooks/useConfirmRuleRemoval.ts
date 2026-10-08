import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';

/**
 * 删除一整条规则会同时丢掉它下面所有模型 / 参数，先确认。
 * 空规则（刚点“添加”还没填）直接删，不打扰。
 */
export function useConfirmRuleRemoval() {
  const { t } = useTranslation();
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  return useCallback(
    (hasContent: boolean, remove: () => void) => {
      if (!hasContent) {
        remove();
        return;
      }
      showConfirmation({
        title: t('config_management.visual.common.remove_rule_title'),
        message: t('config_management.visual.common.remove_rule_message'),
        variant: 'danger',
        confirmText: t('config_management.visual.common.delete'),
        onConfirm: remove,
      });
    },
    [showConfirmation, t]
  );
}
