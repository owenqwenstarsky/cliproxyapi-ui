export const AUTH_FILES_SORT_MODES = ['default', 'az', 'priority'] as const;
export const AUTH_FILES_STATUS_FILTER_MODES = ['all', 'enabled', 'disabled', 'problem'] as const;

export type AuthFilesSortMode = (typeof AUTH_FILES_SORT_MODES)[number];
export type AuthFilesStatusFilterMode = (typeof AUTH_FILES_STATUS_FILTER_MODES)[number];

export type AuthFilesUiState = {
  filter?: string;
  problemOnly?: boolean;
  disabledOnly?: boolean;
  statusFilterMode?: AuthFilesStatusFilterMode;
  compactMode?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  regularPageSize?: number;
  compactPageSize?: number;
  sortMode?: AuthFilesSortMode;
};

const AUTH_FILES_UI_STATE_KEY = 'authFilesPage.uiState';
const AUTH_FILES_COMPACT_MODE_KEY = 'authFilesPage.compactMode';
const AUTH_FILES_SORT_MODE_SET = new Set<AuthFilesSortMode>(AUTH_FILES_SORT_MODES);
const AUTH_FILES_STATUS_FILTER_MODE_SET = new Set<AuthFilesStatusFilterMode>(
  AUTH_FILES_STATUS_FILTER_MODES
);

export const isAuthFilesSortMode = (value: unknown): value is AuthFilesSortMode =>
  typeof value === 'string' && AUTH_FILES_SORT_MODE_SET.has(value as AuthFilesSortMode);

export const isAuthFilesStatusFilterMode = (value: unknown): value is AuthFilesStatusFilterMode =>
  typeof value === 'string' &&
  AUTH_FILES_STATUS_FILTER_MODE_SET.has(value as AuthFilesStatusFilterMode);

const readAuthFilesUiStateFromStorage = (
  storage: Pick<Storage, 'getItem'> | null | undefined
): AuthFilesUiState | null => {
  if (!storage) return null;
  const raw = storage.getItem(AUTH_FILES_UI_STATE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as AuthFilesUiState;
  return parsed && typeof parsed === 'object' ? parsed : null;
};

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    return (
      readAuthFilesUiStateFromStorage(window.localStorage) ??
      readAuthFilesUiStateFromStorage(window.sessionStorage)
    );
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  try {
    window.sessionStorage.removeItem(AUTH_FILES_UI_STATE_KEY);
  } catch {
    // ignore
  }
};

export const readPersistedAuthFilesCompactMode = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_FILES_COMPACT_MODE_KEY);
    if (raw === null) return null;
    return JSON.parse(raw) === true;
  } catch {
    return null;
  }
};

export const writePersistedAuthFilesCompactMode = (compactMode: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_FILES_COMPACT_MODE_KEY, JSON.stringify(compactMode));
  } catch {
    // ignore
  }
};

export interface InitialAuthFilesUiState {
  filter: string;
  statusFilterMode: AuthFilesStatusFilterMode;
  compactMode: boolean;
  pageSizeByMode: { regular: number; compact: number };
  sortMode: AuthFilesSortMode;
}

interface ResolveInitialAuthFilesUiStateInput {
  persisted: AuthFilesUiState | null;
  persistedCompactMode: boolean | null;
  /** 来自 URL（?filter=problem）的状态筛选，优先于已保存的值 */
  urlStatusFilter?: string | null;
  defaults: { regularPageSize: number; compactPageSize: number };
  normalizeFilter: (value: string) => string;
  clampPageSize: (value: number) => number;
}

const normalizePersistedStatusFilterMode = (value: unknown): AuthFilesStatusFilterMode | null => {
  // 旧版本把“停用 + 问题”合并保存为 disabledProblem
  if (value === 'disabledProblem') return 'problem';
  return isAuthFilesStatusFilterMode(value) ? value : null;
};

/**
 * 计算页面的初始 UI 状态。以纯函数 + 惰性初始值的方式使用，首帧就是正确的视图，
 * 不再先渲染默认值、再在 effect 里套用已保存的筛选（会闪一下）。
 *
 * 搜索词与页码刻意不恢复：过几天回来发现列表被一条陈旧的搜索词过滤、停在第 4 页，
 * 比什么都没保存更糟。
 */
export const resolveInitialAuthFilesUiState = ({
  persisted,
  persistedCompactMode,
  urlStatusFilter,
  defaults,
  normalizeFilter,
  clampPageSize,
}: ResolveInitialAuthFilesUiStateInput): InitialAuthFilesUiState => {
  let filter = 'all';
  let statusFilterMode: AuthFilesStatusFilterMode = 'all';
  let compactMode = persistedCompactMode ?? false;
  let sortMode: AuthFilesSortMode = 'default';
  let regular = defaults.regularPageSize;
  let compact = defaults.compactPageSize;

  if (persisted) {
    if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
      filter = normalizeFilter(persisted.filter);
    }

    const persistedMode = normalizePersistedStatusFilterMode(persisted.statusFilterMode);
    if (persistedMode) {
      statusFilterMode = persistedMode;
    } else if (persisted.problemOnly === true) {
      statusFilterMode = 'problem';
    } else if (persisted.disabledOnly === true) {
      statusFilterMode = 'disabled';
    }

    if (persistedCompactMode === null && typeof persisted.compactMode === 'boolean') {
      compactMode = persisted.compactMode;
    }

    const finite = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value);
    const legacy = finite(persisted.pageSize) ? clampPageSize(persisted.pageSize) : null;
    regular = finite(persisted.regularPageSize)
      ? clampPageSize(persisted.regularPageSize)
      : (legacy ?? regular);
    compact = finite(persisted.compactPageSize)
      ? clampPageSize(persisted.compactPageSize)
      : (legacy ?? compact);

    if (isAuthFilesSortMode(persisted.sortMode)) sortMode = persisted.sortMode;
  }

  const fromUrl = normalizePersistedStatusFilterMode(urlStatusFilter);
  if (fromUrl) {
    statusFilterMode = fromUrl;
    // 从仪表盘点进来是为了看“所有问题凭证”，不应再被上次选的供应商标签藏掉一部分
    filter = 'all';
  }

  return {
    filter,
    statusFilterMode,
    compactMode,
    pageSizeByMode: { regular, compact },
    sortMode,
  };
};
