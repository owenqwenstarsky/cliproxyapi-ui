import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconSlidersHorizontal } from '@/components/ui/icons';
import { MAX_CARD_PAGE_SIZE, MIN_CARD_PAGE_SIZE } from '@/features/authFiles/constants';
import type { AuthFilesSortMode, AuthFilesStatusFilterMode } from '@/features/authFiles/uiState';
import styles from './AuthFilesToolbar.module.scss';

export type AuthFilesToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilterMode: AuthFilesStatusFilterMode;
  statusFilterOptions: Array<{ value: AuthFilesStatusFilterMode; label: string }>;
  onStatusFilterChange: (mode: AuthFilesStatusFilterMode) => void;
  sortMode: AuthFilesSortMode;
  sortOptions: Array<{ value: string; label: string }>;
  onSortModeChange: (value: string) => void;
  pageSizeInput: string;
  onPageSizeInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPageSizeCommit: (rawValue: string) => void;
  compactMode: boolean;
  onCompactModeChange: (value: boolean) => void;
  /** 当前筛选结果中可选中的条数 */
  selectableCount: number;
  allSelected: boolean;
  selectDisabled: boolean;
  /** 选中全部筛选结果；批量删除等破坏性操作都在随后出现的批量操作条里，带确认 */
  onSelectAll: () => void;
};

/**
 * 工作区工具栏：搜索 · 状态分段 · 排序 · 显示设置 popover。
 * 「全选筛选结果」放在最右端：它只做选择，破坏性操作都在批量操作条里并带确认，
 * 避免一个永远可见的“删除全部”按钮紧挨着搜索框。
 */
export function AuthFilesToolbar(props: AuthFilesToolbarProps) {
  const {
    search,
    onSearchChange,
    statusFilterMode,
    statusFilterOptions,
    onStatusFilterChange,
    sortMode,
    sortOptions,
    onSortModeChange,
    pageSizeInput,
    onPageSizeInputChange,
    onPageSizeCommit,
    compactMode,
    onCompactModeChange,
    selectableCount,
    allSelected,
    selectDisabled,
    onSelectAll,
  } = props;
  const { t } = useTranslation();
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const displaySettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!displaySettingsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!displaySettingsRef.current?.contains(event.target as Node)) {
        setDisplaySettingsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDisplaySettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [displaySettingsOpen]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={t('auth_files.search_placeholder')}
          label={t('auth_files.search_label')}
        />
      </div>

      <div
        className={styles.segmented}
        role="group"
        aria-label={t('auth_files.problem_filter_label')}
      >
        {statusFilterOptions.map((option) => {
          const isActive = statusFilterMode === option.value;
          const isProblem = option.value === 'problem';
          return (
            <button
              key={option.value}
              type="button"
              className={`${styles.segment} ${isActive ? styles.segmentActive : ''} ${
                isProblem ? styles.segmentProblem : ''
              }`}
              aria-pressed={isActive}
              onClick={() => onStatusFilterChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className={styles.sort}>
        <Select
          value={sortMode}
          options={sortOptions}
          onChange={onSortModeChange}
          ariaLabel={t('auth_files.sort_label')}
          size="sm"
        />
      </div>

      <div className={styles.display} ref={displaySettingsRef}>
        <button
          type="button"
          className={`${styles.displayButton} ${displaySettingsOpen ? styles.displayButtonActive : ''}`}
          aria-expanded={displaySettingsOpen}
          aria-controls="auth-files-display-settings"
          title={t('auth_files.display_options_label')}
          onClick={() => setDisplaySettingsOpen((open) => !open)}
        >
          <IconSlidersHorizontal size={15} />
          <span>{t('auth_files.display_options_label')}</span>
        </button>

        {displaySettingsOpen && (
          <div id="auth-files-display-settings" className={styles.popover}>
            <div className={styles.popoverRow}>
              <label htmlFor="auth-files-page-size">{t('auth_files.page_size_label')}</label>
              <input
                id="auth-files-page-size"
                className={styles.pageSizeInput}
                type="number"
                min={MIN_CARD_PAGE_SIZE}
                max={MAX_CARD_PAGE_SIZE}
                step={1}
                value={pageSizeInput}
                onChange={onPageSizeInputChange}
                onBlur={(e) => onPageSizeCommit(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            <div className={styles.popoverRow}>
              <span>{t('auth_files.compact_mode_label')}</span>
              <ToggleSwitch
                checked={compactMode}
                onChange={onCompactModeChange}
                ariaLabel={t('auth_files.compact_mode_label')}
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.selectAction}
        onClick={onSelectAll}
        disabled={selectDisabled || selectableCount === 0 || allSelected}
      >
        {t('auth_files.select_all_matching', { count: selectableCount })}
      </button>
    </div>
  );
}
