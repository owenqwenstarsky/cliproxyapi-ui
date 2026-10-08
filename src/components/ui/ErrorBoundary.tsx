import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { Button } from './Button';

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
  /** 值变化时（例如路由切换）自动清除错误状态 */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    const { t, children } = this.props;
    if (!error) return children;

    return (
      <div className="card stack" role="alert" style={{ maxWidth: 640 }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 700 }}>
            {t('common.error_boundary_title')}
          </h1>
          <p className="hint" style={{ marginTop: 4 }}>
            {t('common.error_boundary_description')}
          </p>
        </div>
        <pre className="error-box" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {error.message || String(error)}
        </pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            {t('common.try_again')}
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            {t('common.reload_page')}
          </Button>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
