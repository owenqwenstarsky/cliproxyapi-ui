import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { IconSearch, IconX } from './icons';
import styles from './SearchInput.module.scss';

interface SearchInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: string;
  onChange: (value: string) => void;
  /** 无障碍名称；placeholder 不能充当标签 */
  label: string;
  wrapClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, label, wrapClassName, className, onKeyDown, ...rest },
  ref
) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  return (
    <div className={[styles.wrap, wrapClassName].filter(Boolean).join(' ')}>
      <span className={styles.icon} aria-hidden="true">
        <IconSearch size={16} />
      </span>
      <input
        {...rest}
        ref={inputRef}
        type="search"
        className={[styles.input, className].filter(Boolean).join(' ')}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          onClick={() => {
            onChange('');
            // 清除后焦点留在输入框里，可以立刻重新输入
            inputRef.current?.focus();
          }}
          aria-label={t('common.clear_search')}
          title={t('common.clear_search')}
        >
          <IconX size={14} />
        </button>
      ) : null}
    </div>
  );
});
