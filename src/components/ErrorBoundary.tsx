import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors anywhere in the child tree and displays
 * a fallback UI instead of a blank/black screen. Especially important
 * for real-time data apps where a race condition can throw unexpectedly.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to console for debugging — replace with analytics in production.
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app-container text-center" style={{ paddingTop: '3rem' }}>
          <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
            <h1 className="text-danger" style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              ⚠ Something went wrong
            </h1>
            <p className="text-muted mb-lg">
              An unexpected error occurred. This is usually a temporary data sync issue.
            </p>
            {this.state.error && (
              <pre
                className="text-muted mb-lg"
                style={{
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  background: 'var(--color-bg-input)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'auto',
                  maxWidth: '100%',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button onClick={this.handleReload} className="btn btn-primary btn-lg">
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}