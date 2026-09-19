import React from 'react';

interface AppErrorBoundaryProps {
  resetKey?: string | number;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: string | null;
}

export class AppErrorBoundary extends React.Component<
  React.PropsWithChildren<AppErrorBoundaryProps>,
  AppErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<AppErrorBoundaryProps>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidUpdate(prevProps: Readonly<React.PropsWithChildren<AppErrorBoundaryProps>>): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      error: error?.message || 'Unknown renderer error',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[UI] Unhandled React error boundary:', error, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="panel-recovery">
        <div className="panel-recovery-title">This screen failed to render</div>
        <div className="panel-recovery-body">
          The rest of AGI PRIME is still running. Switch modules in the sidebar or retry this one.
        </div>
        <div className="panel-recovery-error">{this.state.error || 'Unknown error'}</div>
        <button type="button" className="hardening-btn primary" onClick={this.retry}>
          RETRY PANEL
        </button>
      </div>
    );
  }
}
