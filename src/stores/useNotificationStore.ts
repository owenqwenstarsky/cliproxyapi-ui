/**
 * 通知状态管理
 * 替代原项目中的 showNotification 方法
 */

import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { Notification, NotificationType } from '@/types';
import { generateId } from '@/utils/helpers';
import {
  NOTIFICATION_DURATION_MS,
  NOTIFICATION_ERROR_DURATION_MS,
  NOTIFICATION_MAX_VISIBLE,
} from '@/utils/constants';

interface ConfirmationOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'secondary';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

interface NotificationState {
  notifications: Notification[];
  confirmation: {
    isOpen: boolean;
    isLoading: boolean;
    options: ConfirmationOptions | null;
  };
  showNotification: (message: string, type?: NotificationType, duration?: number) => void;
  removeNotification: (id: string) => void;
  showConfirmation: (options: ConfirmationOptions) => void;
  hideConfirmation: () => void;
  setConfirmationLoading: (loading: boolean) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  confirmation: {
    isOpen: false,
    isLoading: false,
    options: null,
  },

  showNotification: (message, type = 'info', duration) => {
    const id = generateId();
    const notification: Notification = {
      id,
      message,
      type,
      duration:
        duration ?? (type === 'error' ? NOTIFICATION_ERROR_DURATION_MS : NOTIFICATION_DURATION_MS),
    };

    set((state) => {
      // 相同内容的提示只保留最新一条，避免重复操作时刷屏；总数封顶，丢弃最旧的
      const rest = state.notifications.filter((n) => !(n.message === message && n.type === type));
      return { notifications: [...rest, notification].slice(-NOTIFICATION_MAX_VISIBLE) };
    });

    // NotificationContainer owns readable-time expiry and cleans up timers on unmount.
    // Keeping timers out of the store allows hover/focus/hidden-tab pauses.
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  showConfirmation: (options) => {
    set({
      confirmation: {
        isOpen: true,
        isLoading: false,
        options,
      },
    });
  },

  hideConfirmation: () => {
    set((state) => ({
      confirmation: {
        ...state.confirmation,
        isOpen: false,
        options: null, // Cleanup
      },
    }));
  },

  setConfirmationLoading: (loading) => {
    set((state) => ({
      confirmation: {
        ...state.confirmation,
        isLoading: loading,
      },
    }));
  },
}));
