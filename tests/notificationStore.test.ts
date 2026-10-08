import { beforeEach, describe, expect, test } from 'bun:test';
import { useNotificationStore } from '@/stores/useNotificationStore';
import {
  NOTIFICATION_DURATION_MS,
  NOTIFICATION_ERROR_DURATION_MS,
  NOTIFICATION_MAX_VISIBLE,
} from '@/utils/constants';

const reset = () => useNotificationStore.setState({ notifications: [] });

describe('notification store', () => {
  beforeEach(reset);

  test('errors stay visible longer than other toasts', () => {
    const { showNotification } = useNotificationStore.getState();
    showNotification('saved', 'success');
    showNotification('save failed: 500', 'error');
    const [ok, failed] = useNotificationStore.getState().notifications;
    expect(ok.duration).toBe(NOTIFICATION_DURATION_MS);
    expect(failed.duration).toBe(NOTIFICATION_ERROR_DURATION_MS);
    expect(NOTIFICATION_ERROR_DURATION_MS).toBeGreaterThan(NOTIFICATION_DURATION_MS);
  });

  test('an explicit duration wins over the type default', () => {
    useNotificationStore.getState().showNotification('x', 'error', 1234);
    expect(useNotificationStore.getState().notifications[0].duration).toBe(1234);
  });

  test('repeating the same message replaces it instead of stacking', () => {
    const { showNotification } = useNotificationStore.getState();
    showNotification('refresh failed', 'error');
    showNotification('refresh failed', 'error');
    showNotification('refresh failed', 'error');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  test('same text with a different type is kept as a separate toast', () => {
    const { showNotification } = useNotificationStore.getState();
    showNotification('done', 'success');
    showNotification('done', 'error');
    expect(useNotificationStore.getState().notifications).toHaveLength(2);
  });

  test('the visible list is capped and drops the oldest', () => {
    const { showNotification } = useNotificationStore.getState();
    for (let i = 0; i < NOTIFICATION_MAX_VISIBLE + 3; i += 1) showNotification(`m${i}`, 'info');
    const messages = useNotificationStore.getState().notifications.map((n) => n.message);
    expect(messages).toHaveLength(NOTIFICATION_MAX_VISIBLE);
    expect(messages[messages.length - 1]).toBe(`m${NOTIFICATION_MAX_VISIBLE + 2}`);
    expect(messages).not.toContain('m0');
  });
});
