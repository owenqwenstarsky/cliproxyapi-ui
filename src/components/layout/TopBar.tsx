import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useAuthStore, useLanguageStore, useNotificationStore, useThemeStore } from '@/stores';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import { isSupportedLanguage } from '@/utils/language';
import type { Theme } from '@/types';
import { headerIcons } from './headerIcons';

const THEME_CARDS: Array<{
  key: Theme;
  labelKey: string;
  colors: { bg: string; card: string; border: string; textMuted: string };
}> = [
  {
    key: 'auto',
    labelKey: 'theme.auto',
    colors: {
      bg: 'linear-gradient(135deg, #ffffff 0 50%, #111111 50% 100%)',
      card: 'linear-gradient(135deg, #ffffff 0 50%, #1a1a1a 50% 100%)',
      border: '#bdbdbd',
      textMuted: 'linear-gradient(135deg, #c9c9c9 0 50%, #5a5a5a 50% 100%)',
    },
  },
  {
    key: 'white',
    labelKey: 'theme.white',
    colors: { bg: '#ffffff', card: '#ffffff', border: '#e5e5e5', textMuted: '#a29c95' },
  },
  {
    key: 'light',
    labelKey: 'theme.light',
    colors: { bg: '#faf9f5', card: '#f0eee8', border: '#e3e1db', textMuted: '#a29c95' },
  },
  {
    key: 'dark',
    labelKey: 'theme.dark',
    colors: { bg: '#151412', card: '#1d1b18', border: '#3a3530', textMuted: '#9c958d' },
  },
];

/** 点击菜单外关闭 */
function useOutsideDismiss(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, containerRef, onClose]);
}

interface HeaderMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  icon: ReactNode;
  popoverClassName: string;
  children: ReactNode;
}

/**
 * 头部弹出菜单：打开后焦点进入菜单（优先选中项），上下键/Home/End 移动，
 * Escape 关闭并把焦点还给触发按钮，Tab 离开时关闭。
 */
function HeaderMenu({
  open,
  onOpenChange,
  label,
  icon,
  popoverClassName,
  children,
}: HeaderMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useOutsideDismiss(open, containerRef, close);

  useEffect(() => {
    if (!open) return;
    const items = containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]');
    if (!items?.length) return;
    const checked = Array.from(items).find((item) => item.getAttribute('aria-checked') === 'true');
    (checked ?? items[0]).focus();
  }, [open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      onOpenChange(false);
      return;
    }
    if (!MENU_NAV_KEYS.includes(event.key)) return;

    const items = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []
    );
    if (!items.length) return;
    event.preventDefault();

    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      next = (index + 1) % items.length;
    } else next = (index - 1 + items.length) % items.length;
    items[next].focus();
  };

  // 选中项后由调用方关闭菜单；这里负责把焦点交还触发按钮
  const handleClick = () => {
    if (open) triggerRef.current?.focus();
  };

  return (
    <div
      className={`header-menu ${open ? 'open' : ''}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    >
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
      </Button>
      {open && (
        <div className={`header-popover ${popoverClassName}`} role="menu" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

const MENU_NAV_KEYS = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];

interface TopBarProps {
  headerRef: RefObject<HTMLElement | null>;
  sidebarOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleSidebar: () => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}

const formatVersion = (version: string | null): string => {
  if (!version) return '';
  return /^\d/.test(version) ? `v${version}` : version;
};

export function TopBar({
  headerRef,
  sidebarOpen,
  menuButtonRef,
  onToggleSidebar,
  onRefresh,
  refreshing,
}: TopBarProps) {
  const { t } = useTranslation();
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const logout = useAuthStore((state) => state.logout);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const serverVersion = useAuthStore((state) => state.serverVersion);

  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  const [openMenu, setOpenMenu] = useState<'language' | 'theme' | null>(null);

  const handleThemeSelect = (nextTheme: Theme) => {
    setTheme(nextTheme);
    setOpenMenu(null);
  };

  const handleLanguageSelect = (nextLanguage: string) => {
    if (!isSupportedLanguage(nextLanguage)) return;
    setLanguage(nextLanguage);
    setOpenMenu(null);
  };

  const handleLogout = () => {
    showConfirmation({
      title: t('header.logout_confirm_title'),
      message: t('header.logout_confirm_message'),
      confirmText: t('header.logout'),
      variant: 'danger',
      onConfirm: () => logout(),
    });
  };

  const statusLabel = t(`connection.state_${connectionStatus}`);
  const version = formatVersion(serverVersion);
  const mobileMenuLabel = sidebarOpen
    ? t('sidebar.toggle_collapse', { defaultValue: 'Close navigation' })
    : t('sidebar.toggle_expand', { defaultValue: 'Open navigation' });

  return (
    <header className="topbar" ref={headerRef}>
      <div className="topbar-start">
        <Button
          ref={menuButtonRef}
          className="mobile-menu-btn"
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          title={mobileMenuLabel}
          aria-label={mobileMenuLabel}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? headerIcons.close : headerIcons.menu}
        </Button>
        <div className="connection-indicator" role="status" aria-live="polite">
          <span className={`connection-dot ${connectionStatus}`} aria-hidden="true" />
          <span className="connection-label">{statusLabel}</span>
          {version ? <span className="connection-version">{version}</span> : null}
        </div>
      </div>

      <div className="topbar-actions">
        <Button
          variant="ghost"
          size="icon"
          className={refreshing ? 'is-refreshing' : undefined}
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing || undefined}
          title={refreshing ? t('header.refreshing') : t('header.refresh_all')}
          aria-label={refreshing ? t('header.refreshing') : t('header.refresh_all')}
        >
          {headerIcons.refresh}
        </Button>

        <HeaderMenu
          open={openMenu === 'language'}
          onOpenChange={(open) => setOpenMenu(open ? 'language' : null)}
          label={t('language.switch')}
          icon={headerIcons.language}
          popoverClassName="language-menu-popover"
        >
          {LANGUAGE_ORDER.map((lang) => (
            <button
              key={lang}
              type="button"
              className={`language-menu-option ${language === lang ? 'active' : ''}`}
              onClick={() => handleLanguageSelect(lang)}
              role="menuitemradio"
              aria-checked={language === lang}
            >
              <span>{t(LANGUAGE_LABEL_KEYS[lang])}</span>
              {language === lang ? (
                <span className="language-menu-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </HeaderMenu>

        <HeaderMenu
          open={openMenu === 'theme'}
          onOpenChange={(open) => setOpenMenu(open ? 'theme' : null)}
          label={t('theme.switch')}
          icon={
            theme === 'auto'
              ? headerIcons.autoTheme
              : theme === 'dark'
                ? headerIcons.moon
                : theme === 'white'
                  ? headerIcons.whiteTheme
                  : headerIcons.sun
          }
          popoverClassName="theme-menu-popover"
        >
          {THEME_CARDS.map((tc) => (
            <button
              key={tc.key}
              type="button"
              className={`theme-card ${theme === tc.key ? 'active' : ''}`}
              onClick={() => handleThemeSelect(tc.key)}
              role="menuitemradio"
              aria-checked={theme === tc.key}
            >
              <div
                className="theme-card-preview"
                style={{ background: tc.colors.bg, border: `1px solid ${tc.colors.border}` }}
              >
                <div
                  className="theme-card-header"
                  style={{
                    background: tc.colors.card,
                    borderBottom: `1px solid ${tc.colors.border}`,
                  }}
                />
                <div className="theme-card-body">
                  <div
                    className="theme-card-sidebar"
                    style={{
                      background: tc.colors.card,
                      borderRight: `1px solid ${tc.colors.border}`,
                    }}
                  />
                  <div className="theme-card-content" style={{ background: tc.colors.bg }}>
                    <div className="theme-card-line" style={{ background: tc.colors.textMuted }} />
                    <div
                      className="theme-card-line short"
                      style={{ background: tc.colors.textMuted }}
                    />
                  </div>
                </div>
              </div>
              <span className="theme-card-label">{t(tc.labelKey)}</span>
            </button>
          ))}
        </HeaderMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title={t('header.logout')}
          aria-label={t('header.logout')}
        >
          {headerIcons.logout}
        </Button>
      </div>
    </header>
  );
}
