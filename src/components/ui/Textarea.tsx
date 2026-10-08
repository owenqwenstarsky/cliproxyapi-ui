import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
  error?: string;
}

export function Textarea({ label, hint, error, className = '', id, ...rest }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const describedBy =
    [rest['aria-describedby'], errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-group">
      {label && <label htmlFor={textareaId}>{label}</label>}
      <textarea
        id={textareaId}
        className={`input ${className}`.trim()}
        aria-invalid={Boolean(error) || rest['aria-invalid']}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && (
        <div id={hintId} className="hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="error-box" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
