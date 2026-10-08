import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from './TopBar';
import { headerIcons } from './headerIcons';
import { useDialogBehavior } from '@/components/ui/useDialogBehavior';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getCredentialHealth } from '@/features/authFiles/health';
import { PageTransition } from '@/components/common/PageTransition';
import { MainRoutes } from '@/router/MainRoutes';
import { authFilesApi, pluginsApi } from '@/services/api';
import {
  IconSidebarAuthFiles,
  IconSidebarConfig,
  IconSidebarDashboard,
  IconSidebarLogs,
  IconSidebarOauth,
  IconSidebarPlugins,
  IconSidebarProviders,
  IconSidebarQuickStart,
  IconSidebarQuota,
  IconSidebarStore,
  IconSidebarSystem,
  IconChevronDown,
} from '@/components/ui/icons';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import { AUTH_FILES_CHANGED_EVENT } from '@/features/authFiles/authFilesEvents';
import {
  collectPluginResourceEntries,
  PLUGIN_RESOURCES_REFRESH_EVENT,
  resolvePluginAssetURL,
  type PluginResourceEntry,
} from '@/features/plugins/pluginResources';
import { APIKEY_FUN_DISPLAY_NAME, hasApiKeyFunConfig } from '@/features/providers/sponsor';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { getSidebarShortcutLabel, isSidebarToggleShortcut } from '@/utils/sidebarShortcut';

const sidebarIcons: Record<string, ReactNode> = {
  dashboard: <IconSidebarDashboard size={18} />,
  quickStart: <IconSidebarQuickStart size={18} />,
  aiProviders: <IconSidebarProviders size={18} />,
  authFiles: <IconSidebarAuthFiles size={18} />,
  oauth: <IconSidebarOauth size={18} />,
  quota: <IconSidebarQuota size={18} />,
  plugins: <IconSidebarPlugins size={18} />,
  pluginStore: <IconSidebarStore size={18} />,
  config: <IconSidebarConfig size={18} />,
  logs: <IconSidebarLogs size={18} />,
  system: <IconSidebarSystem size={18} />,
};

interface SidebarNavLinkItem {
  kind?: 'link';
  path: string;
  labelKey?: string;
  metaKey?: string;
  label?: string;
  meta?: string;
  badge?: number;
  badgeLabel?: string;
  badgeTone?: 'alert';
  icon: ReactNode;
}

interface SidebarNavDrawerItem {
  kind: 'drawer';
  id: string;
  label: string;
  meta?: string;
  icon: ReactNode;
  children: SidebarNavLinkItem[];
}

type SidebarNavItem = SidebarNavLinkItem | SidebarNavDrawerItem;

const NAV_TOOLTIP_ID = 'sidebar-nav-tooltip';
const NAV_TOOLTIP_VIEWPORT_MARGIN = 8;

interface SidebarNavGroup {
  id: string;
  labelKey: string;
  items: SidebarNavItem[];
}

const flattenNavItems = (items: SidebarNavItem[]): SidebarNavLinkItem[] =>
  items.flatMap((item) => (item.kind === 'drawer' ? item.children : [item]));

function PluginSidebarIcon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return showImage ? (
    <img src={src} alt="" onError={() => setFailed(true)} />
  ) : (
    <IconSidebarPlugins size={18} />
  );
}

export function MainLayout() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const location = useLocation();

  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const supportsPlugin = useAuthStore((state) => state.supportsPlugin);

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const config = useConfigStore((state) => state.config);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
    'cli-proxy-sidebar-collapsed',
    false
  );
  const [refreshing, setRefreshing] = useState(false);
  const [authFilesCount, setAuthFilesCount] = useState<number | null>(null);
  const [authFilesAttention, setAuthFilesAttention] = useState(0);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [railTooltip, setRailTooltip] = useState<{
    targetID: string;
    label: string;
    meta?: string;
    anchorTop: number;
    top: number;
  } | null>(null);
  const [pluginResources, setPluginResources] = useState<PluginResourceEntry[]>([]);
  const [expandedPluginResourceIDs, setExpandedPluginResourceIDs] = useState<Set<string>>(
    () => new Set()
  );
  const contentRef = useRef<HTMLDivElement | null>(null);
  const authFilesCountRequestRef = useRef(0);
  const railTooltipRef = useRef<HTMLDivElement | null>(null);
  const focusedRailItemRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const refreshingRef = useRef(false);

  const fullBrandName = 'CLI Proxy API Management Center';
  const abbrBrandName = t('title.abbr');
  const isLogsPage = location.pathname.startsWith('/logs');
  const isPluginResourcePage = location.pathname.startsWith('/plugin-pages');
  const showSidebarLabels = !sidebarCollapsed || sidebarOpen;

  // Keep floating header height available to sticky mobile elements and overlays.
  useLayoutEffect(() => {
    const updateHeaderHeight = () => {
      const height = headerRef.current?.offsetHeight;
      if (height) {
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    };

    updateHeaderHeight();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && headerRef.current
        ? new ResizeObserver(updateHeaderHeight)
        : null;
    if (resizeObserver && headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  useLayoutEffect(() => {
    if (!railTooltip) return;

    const updateRailTooltipPosition = () => {
      const tooltip = railTooltipRef.current;
      if (!tooltip) return;

      const halfHeight = tooltip.offsetHeight / 2;
      const minTop = NAV_TOOLTIP_VIEWPORT_MARGIN + halfHeight;
      const maxTop = Math.max(
        minTop,
        window.innerHeight - NAV_TOOLTIP_VIEWPORT_MARGIN - halfHeight
      );
      const top = Math.min(maxTop, Math.max(minTop, railTooltip.anchorTop));

      setRailTooltip((current) => {
        if (!current || current.targetID !== railTooltip.targetID || current.top === top) {
          return current;
        }
        return { ...current, top };
      });
    };

    updateRailTooltipPosition();
    window.addEventListener('resize', updateRailTooltipPosition);
    return () => window.removeEventListener('resize', updateRailTooltipPosition);
  }, [railTooltip]);

  // Keep the content center available to bottom overlays that align with the main area.
  useLayoutEffect(() => {
    const updateContentCenter = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      document.documentElement.style.setProperty('--content-center-x', `${centerX}px`);
    };

    updateContentCenter();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && contentRef.current
        ? new ResizeObserver(updateContentCenter)
        : null;

    if (resizeObserver && contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    window.addEventListener('resize', updateContentCenter);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateContentCenter);
      document.documentElement.style.removeProperty('--content-center-x');
    };
  }, []);

  useEffect(() => {
    fetchConfig().catch(() => {
      // Ignore the initial failure; the login flow shows the user-facing prompt.
    });
  }, [fetchConfig]);

  const loadPluginResources = useCallback(async () => {
    if (connectionStatus !== 'connected' || !supportsPlugin) {
      setPluginResources([]);
      return;
    }

    try {
      const plugins = await pluginsApi.list();
      setPluginResources(collectPluginResourceEntries(plugins.plugins));
    } catch {
      setPluginResources([]);
    }
  }, [connectionStatus, supportsPlugin]);

  const loadAuthFilesCount = useCallback(async () => {
    const requestID = ++authFilesCountRequestRef.current;
    if (connectionStatus !== 'connected') {
      setAuthFilesCount(null);
      setAuthFilesAttention(0);
      return;
    }

    try {
      const response = await authFilesApi.list();
      if (requestID !== authFilesCountRequestRef.current) return;
      const files = Array.isArray(response?.files) ? response.files : null;
      setAuthFilesCount(files ? files.length : null);
      setAuthFilesAttention(
        files ? files.filter((file) => getCredentialHealth(file).state === 'problem').length : 0
      );
    } catch {
      if (requestID !== authFilesCountRequestRef.current) return;
      setAuthFilesCount(null);
      setAuthFilesAttention(0);
    }
  }, [connectionStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPluginResources();
      void loadAuthFilesCount();
    }, 0);

    window.addEventListener(PLUGIN_RESOURCES_REFRESH_EVENT, loadPluginResources);
    window.addEventListener(AUTH_FILES_CHANGED_EVENT, loadAuthFilesCount);

    return () => {
      authFilesCountRequestRef.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener(PLUGIN_RESOURCES_REFRESH_EVENT, loadPluginResources);
      window.removeEventListener(AUTH_FILES_CHANGED_EVENT, loadAuthFilesCount);
    };
  }, [apiBase, loadPluginResources, loadAuthFilesCount]);

  const pluginResourceGroups = pluginResources.reduce<
    Array<{ pluginID: string; pluginTitle: string; entries: PluginResourceEntry[] }>
  >((groups, resource) => {
    const group = groups.find((item) => item.pluginID === resource.pluginID);
    if (group) {
      group.entries.push(resource);
      return groups;
    }

    groups.push({
      pluginID: resource.pluginID,
      pluginTitle: resource.pluginTitle,
      entries: [resource],
    });
    return groups;
  }, []);

  const pluginPageNavItems: SidebarNavItem[] = supportsPlugin
    ? pluginResourceGroups.flatMap((group): SidebarNavItem[] => {
        if (group.entries.length === 1) {
          const resource = group.entries[0];
          const pluginLogo = resolvePluginAssetURL(resource.pluginLogo, apiBase);
          return [
            {
              path: resource.route,
              label: resource.label,
              meta: resource.description,
              icon: <PluginSidebarIcon src={pluginLogo} />,
            },
          ];
        }

        const pluginLogo = resolvePluginAssetURL(group.entries[0]?.pluginLogo ?? '', apiBase);
        return [
          {
            kind: 'drawer',
            id: `plugin-pages-${group.pluginID}`,
            label: group.pluginTitle,
            meta: t('plugin_resource.page_count', { count: group.entries.length }),
            icon: <PluginSidebarIcon src={pluginLogo} />,
            children: group.entries.map((resource) => ({
              path: resource.route,
              label: resource.label,
              meta: resource.description,
              icon: <span className="nav-sub-dot" aria-hidden="true" />,
            })),
          },
        ];
      })
    : [];

  const isApiKeyFunConfigured = hasApiKeyFunConfig(config);
  const quickStartNavItem: SidebarNavLinkItem = {
    path: '/quick-start',
    label: isApiKeyFunConfigured ? APIKEY_FUN_DISPLAY_NAME : undefined,
    labelKey: isApiKeyFunConfigured ? undefined : 'nav.quick_start',
    metaKey: 'nav_meta.quick_start',
    icon: sidebarIcons.quickStart,
  };

  const navGroups: SidebarNavGroup[] = [
    {
      id: 'operate',
      labelKey: 'nav_groups.operate',
      items: [
        {
          path: '/',
          labelKey: 'nav.dashboard',
          metaKey: 'nav_meta.dashboard',
          icon: sidebarIcons.dashboard,
        },
        ...(!isApiKeyFunConfigured ? [quickStartNavItem] : []),
      ],
    },
    {
      id: 'gateway',
      labelKey: 'nav_groups.gateway',
      items: [
        {
          path: '/ai-providers',
          labelKey: 'nav.ai_providers',
          metaKey: 'nav_meta.ai_providers',
          icon: sidebarIcons.aiProviders,
        },
        {
          path: '/auth-files',
          labelKey: 'nav.auth_files',
          metaKey: 'nav_meta.auth_files',
          badge: authFilesAttention > 0 ? authFilesAttention : (authFilesCount ?? undefined),
          badgeTone: authFilesAttention > 0 ? 'alert' : undefined,
          badgeLabel:
            authFilesAttention > 0
              ? t('sidebar.attention_count', { count: authFilesAttention })
              : typeof authFilesCount === 'number'
                ? t('sidebar.auth_files_count', { count: authFilesCount })
                : undefined,
          icon: sidebarIcons.authFiles,
        },
        {
          path: '/oauth',
          labelKey: 'nav.oauth',
          metaKey: 'nav_meta.oauth',
          icon: sidebarIcons.oauth,
        },
        ...(isApiKeyFunConfigured ? [quickStartNavItem] : []),
      ],
    },
    {
      id: 'observe',
      labelKey: 'nav_groups.observe',
      items: [
        {
          path: '/quota',
          labelKey: 'nav.quota_management',
          metaKey: 'nav_meta.quota_management',
          icon: sidebarIcons.quota,
        },
        {
          path: '/logs',
          labelKey: 'nav.logs',
          metaKey: 'nav_meta.logs',
          icon: sidebarIcons.logs,
        },
      ],
    },
    {
      id: 'control',
      labelKey: 'nav_groups.control',
      items: [
        {
          path: '/config',
          labelKey: 'nav.config_management',
          metaKey: 'nav_meta.config_management',
          icon: sidebarIcons.config,
        },
        ...(supportsPlugin
          ? [
              {
                path: '/plugins',
                labelKey: 'nav.plugins',
                metaKey: 'nav_meta.plugins',
                icon: sidebarIcons.plugins,
              },
              {
                path: '/plugin-store',
                labelKey: 'nav.plugin_store',
                metaKey: 'nav_meta.plugin_store',
                icon: sidebarIcons.pluginStore,
              },
            ]
          : []),
        {
          path: '/system',
          labelKey: 'nav.system_info',
          metaKey: 'nav_meta.system_info',
          icon: sidebarIcons.system,
        },
      ],
    },
    ...(pluginPageNavItems.length > 0
      ? [
          {
            id: 'plugin-pages',
            labelKey: 'nav_groups.plugin_pages',
            items: pluginPageNavItems,
          },
        ]
      : []),
  ];
  const navItems = navGroups.flatMap((group) => flattenNavItems(group.items));
  const navOrder = navItems.map((item) => item.path);
  const getRouteOrder = (pathname: string) => {
    const trimmedPath =
      pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const normalizedPath = trimmedPath === '/dashboard' ? '/' : trimmedPath;

    const authFilesIndex = navOrder.indexOf('/auth-files');
    if (authFilesIndex !== -1) {
      if (normalizedPath === '/auth-files') return authFilesIndex;
      if (normalizedPath.startsWith('/auth-files/')) {
        if (normalizedPath.startsWith('/auth-files/oauth-excluded')) return authFilesIndex + 0.1;
        if (normalizedPath.startsWith('/auth-files/oauth-model-alias')) return authFilesIndex + 0.2;
        return authFilesIndex + 0.05;
      }
    }

    const exactIndex = navOrder.indexOf(normalizedPath);
    if (exactIndex !== -1) return exactIndex;
    const nestedIndex = navOrder.findIndex(
      (path) => path !== '/' && normalizedPath.startsWith(`${path}/`)
    );
    return nestedIndex === -1 ? null : nestedIndex;
  };

  const getTransitionVariant = useCallback((fromPathname: string, toPathname: string) => {
    const normalize = (pathname: string) => {
      const trimmed =
        pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      return trimmed === '/dashboard' ? '/' : trimmed;
    };

    const from = normalize(fromPathname);
    const to = normalize(toPathname);
    const isAuthFiles = (pathname: string) =>
      pathname === '/auth-files' || pathname.startsWith('/auth-files/');
    if (isAuthFiles(from) && isAuthFiles(to)) return 'ios';
    return 'vertical';
  }, []);

  const handleRefreshAll = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await refreshEverything();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };

  const refreshEverything = async () => {
    clearCache();
    const results = await Promise.allSettled([
      fetchConfig(true),
      loadPluginResources(),
      loadAuthFilesCount(),
      triggerHeaderRefresh(),
    ]);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected && rejected.status === 'rejected') {
      const reason = rejected.reason;
      const message =
        typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '';
      showNotification(
        `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
      return;
    }
    showNotification(t('notification.data_refreshed'), 'success');
  };

  const togglePluginResourceDrawer = useCallback((drawerID: string) => {
    setExpandedPluginResourceIDs((current) => {
      const next = new Set(current);
      if (next.has(drawerID)) {
        next.delete(drawerID);
      } else {
        next.add(drawerID);
      }
      return next;
    });
  }, []);

  const showRailTooltip = useCallback(
    (event: SyntheticEvent<HTMLElement>, targetID: string, label: string, meta?: string) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const anchorTop = rect.top + rect.height / 2;
      setRailTooltip({ targetID, label, meta, anchorTop, top: anchorTop });
    },
    []
  );
  const hideRailTooltip = useCallback(() => setRailTooltip(null), []);
  const handleRailTooltipMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLElement>, targetID: string, label: string, meta?: string) => {
      const focusedItem = focusedRailItemRef.current;
      if (focusedItem && focusedItem !== event.currentTarget) return;
      showRailTooltip(event, targetID, label, meta);
    },
    [showRailTooltip]
  );
  const handleRailTooltipMouseLeave = useCallback(() => {
    if (!focusedRailItemRef.current) hideRailTooltip();
  }, [hideRailTooltip]);
  const handleRailTooltipFocus = useCallback(
    (event: SyntheticEvent<HTMLElement>, targetID: string, label: string, meta?: string) => {
      focusedRailItemRef.current = event.currentTarget;
      showRailTooltip(event, targetID, label, meta);
    },
    [showRailTooltip]
  );
  const handleRailTooltipBlur = useCallback(
    (event: SyntheticEvent<HTMLElement>, targetID: string, label: string, meta?: string) => {
      if (focusedRailItemRef.current === event.currentTarget) {
        focusedRailItemRef.current = null;
      }
      if (event.currentTarget.matches(':hover')) {
        showRailTooltip(event, targetID, label, meta);
      } else {
        hideRailTooltip();
      }
    },
    [hideRailTooltip, showRailTooltip]
  );

  const isMac = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const platform =
      (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      '';
    return /(Mac|iPhone|iPod|iPad)/i.test(platform);
  }, []);

  const shortcutText = getSidebarShortcutLabel(isMac);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSidebarToggleShortcut(event)) {
        event.preventDefault();
        hideRailTooltip();
        setSidebarCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hideRailTooltip]);

  const renderNavBadge = (badge?: number, badgeLabel?: string, tone?: 'alert') =>
    typeof badge === 'number' ? (
      <>
        {badge > 0 ? (
          <span
            className={`nav-badge${tone === 'alert' ? ' nav-badge-alert' : ''}`}
            aria-hidden="true"
          >
            {badge}
          </span>
        ) : null}
        {badgeLabel ? <span className="nav-badge-sr-only">{badgeLabel}</span> : null}
      </>
    ) : null;

  const renderNavLink = (item: SidebarNavLinkItem, className = 'nav-item') => {
    const itemLabel = item.label ?? (item.labelKey ? t(item.labelKey) : '');
    const itemMeta = item.meta ?? (item.metaKey ? t(item.metaKey) : '');
    const accessibleLabel = item.badgeLabel ? `${itemLabel}, ${item.badgeLabel}` : itemLabel;

    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) => `${className} ${isActive ? 'active' : ''}`}
        onClick={() => {
          focusedRailItemRef.current = null;
          setSidebarOpen(false);
          hideRailTooltip();
        }}
        aria-label={showSidebarLabels ? undefined : accessibleLabel}
        aria-describedby={
          !showSidebarLabels && itemMeta && railTooltip?.targetID === item.path
            ? NAV_TOOLTIP_ID
            : undefined
        }
        onMouseEnter={
          showSidebarLabels
            ? undefined
            : (event) => handleRailTooltipMouseEnter(event, item.path, itemLabel, itemMeta)
        }
        onMouseLeave={showSidebarLabels ? undefined : handleRailTooltipMouseLeave}
        onFocus={
          showSidebarLabels
            ? undefined
            : (event) => handleRailTooltipFocus(event, item.path, itemLabel, itemMeta)
        }
        onBlur={
          showSidebarLabels
            ? undefined
            : (event) => handleRailTooltipBlur(event, item.path, itemLabel, itemMeta)
        }
      >
        <span className="nav-icon">{item.icon}</span>
        {showSidebarLabels ? (
          <>
            <span className="nav-text">
              <span className="nav-label">{itemLabel}</span>
            </span>
            {renderNavBadge(item.badge, item.badgeLabel, item.badgeTone)}
          </>
        ) : (
          renderNavBadge(item.badge, undefined, item.badgeTone)
        )}
      </NavLink>
    );
  };

  const renderNavItem = (item: SidebarNavItem) => {
    if (item.kind !== 'drawer') {
      return renderNavLink(item);
    }

    const isActive = item.children.some((child) => child.path === location.pathname);
    const isOpen = isActive || expandedPluginResourceIDs.has(item.id);

    return (
      <div className={`nav-drawer ${isOpen ? 'open' : ''}`} key={item.id}>
        <button
          type="button"
          className={`nav-item nav-drawer-toggle ${isActive ? 'active' : ''} ${
            isOpen ? 'open' : ''
          }`}
          onClick={() => togglePluginResourceDrawer(item.id)}
          aria-label={showSidebarLabels ? undefined : item.label}
          aria-describedby={
            !showSidebarLabels && item.meta && railTooltip?.targetID === item.id
              ? NAV_TOOLTIP_ID
              : undefined
          }
          aria-expanded={isOpen}
          onMouseEnter={
            showSidebarLabels
              ? undefined
              : (event) => handleRailTooltipMouseEnter(event, item.id, item.label, item.meta)
          }
          onMouseLeave={showSidebarLabels ? undefined : handleRailTooltipMouseLeave}
          onFocus={
            showSidebarLabels
              ? undefined
              : (event) => handleRailTooltipFocus(event, item.id, item.label, item.meta)
          }
          onBlur={
            showSidebarLabels
              ? undefined
              : (event) => handleRailTooltipBlur(event, item.id, item.label, item.meta)
          }
        >
          <span className="nav-icon">{item.icon}</span>
          {showSidebarLabels && (
            <>
              <span className="nav-text">
                <span className="nav-label">{item.label}</span>
              </span>
              <span className="nav-drawer-caret" aria-hidden="true">
                <IconChevronDown size={14} />
              </span>
            </>
          )}
        </button>
        {isOpen ? (
          <div className="nav-sub-list">
            {item.children.map((child) => renderNavLink(child, 'nav-item nav-sub-item'))}
          </div>
        ) : null}
      </div>
    );
  };

  const sidebarToggleLabel = sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse');
  const drawerActive = isMobile && sidebarOpen;

  // 移动端抽屉：与对话框共用焦点陷阱 / Escape / 焦点还原
  useDialogBehavior({
    open: drawerActive,
    visible: drawerActive,
    containerRef: sidebarRef,
    closeButtonRef: menuButtonRef,
    onRequestClose: () => setSidebarOpen(false),
  });

  // 视口变宽后抽屉不再有意义，复位避免遗留打开态
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  // 每个路由使用独立的标题，便于浏览器标签页与历史记录区分
  useEffect(() => {
    const current = [...navItems]
      .filter((item) =>
        item.path === '/'
          ? location.pathname === '/' || location.pathname === '/dashboard'
          : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
      )
      .sort((a, b) => b.path.length - a.path.length)[0];
    const label = current ? (current.label ?? (current.labelKey ? t(current.labelKey) : '')) : '';
    document.title = label ? `${label} · ${fullBrandName}` : fullBrandName;
  }, [location.pathname, navItems, t]);

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${
        isPluginResourcePage ? 'plugin-resource-shell' : ''
      }`}
    >
      <button type="button" className="skip-link" onClick={() => mainRef.current?.focus()}>
        {t('common.skip_to_content')}
      </button>

      <div className="main-body">
        <button
          type="button"
          className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-label={t('common.close')}
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside
          ref={sidebarRef}
          className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
          inert={isMobile && !sidebarOpen}
        >
          <div className="sidebar-header">
            <div className="sidebar-brand" title={fullBrandName}>
              <img src={INLINE_LOGO_JPEG} alt="CPAMC logo" className="sidebar-brand-logo" />
              {showSidebarLabels && (
                <span className="sidebar-brand-text">
                  <span className="sidebar-brand-title">{abbrBrandName}</span>
                  <span className="sidebar-brand-subtitle">{t('sidebar.subtitle')}</span>
                </span>
              )}
            </div>
          </div>

          <nav className="nav-section" aria-label={t('sidebar.nav_label')}>
            {navGroups.map((group, idx) => (
              <div className="nav-group" key={group.id}>
                {showSidebarLabels ? (
                  <div className="nav-group-label">{t(group.labelKey)}</div>
                ) : (
                  idx > 0 && <div className="nav-group-divider" aria-hidden="true" />
                )}
                {group.items.map((item) => renderNavItem(item))}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button
              type="button"
              className="nav-item sidebar-collapse-btn"
              onClick={() => {
                hideRailTooltip();
                setSidebarCollapsed((prev) => !prev);
              }}
              onMouseEnter={(event) =>
                showSidebarLabels
                  ? undefined
                  : handleRailTooltipMouseEnter(
                      event,
                      'sidebar-toggle',
                      sidebarToggleLabel,
                      shortcutText
                    )
              }
              onMouseLeave={showSidebarLabels ? undefined : handleRailTooltipMouseLeave}
              onFocus={(event) =>
                showSidebarLabels
                  ? undefined
                  : handleRailTooltipFocus(
                      event,
                      'sidebar-toggle',
                      sidebarToggleLabel,
                      shortcutText
                    )
              }
              onBlur={(event) =>
                showSidebarLabels
                  ? undefined
                  : handleRailTooltipBlur(event, 'sidebar-toggle', sidebarToggleLabel, shortcutText)
              }
              aria-label={`${sidebarToggleLabel} (${shortcutText})`}
              aria-expanded={!sidebarCollapsed}
              title={showSidebarLabels ? shortcutText : undefined}
            >
              <span className="nav-icon">
                {sidebarCollapsed ? headerIcons.chevronRight : headerIcons.chevronLeft}
              </span>
              {showSidebarLabels ? (
                <span className="nav-text">
                  <span className="nav-label">{sidebarToggleLabel}</span>
                </span>
              ) : null}
            </button>
          </div>
        </aside>

        {railTooltip && (
          <div
            ref={railTooltipRef}
            id={NAV_TOOLTIP_ID}
            className="nav-tooltip"
            role="tooltip"
            style={{ top: railTooltip.top }}
          >
            <span className="nav-tooltip-label" aria-hidden="true">
              {railTooltip.label}
            </span>
            {railTooltip.meta ? <span className="nav-tooltip-meta">{railTooltip.meta}</span> : null}
          </div>
        )}

        <div
          className={`content${isLogsPage ? ' content-logs' : ''}${
            isPluginResourcePage ? ' content-plugin-resource' : ''
          }`}
          ref={contentRef}
        >
          <TopBar
            headerRef={headerRef}
            sidebarOpen={sidebarOpen}
            menuButtonRef={menuButtonRef}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onRefresh={handleRefreshAll}
            refreshing={refreshing}
          />
          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            className={`main-content${isLogsPage ? ' main-content-logs' : ''}${
              isPluginResourcePage ? ' main-content-plugin-resource' : ''
            }`}
          >
            <PageTransition
              render={(location) => <MainRoutes location={location} />}
              getRouteOrder={getRouteOrder}
              getTransitionVariant={getTransitionVariant}
              scrollContainerRef={contentRef}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
