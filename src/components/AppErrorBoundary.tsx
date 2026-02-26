import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  error: string | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
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
      <div className="boot-screen">
        <div className="boot-text">RECOVERY MODE</div>
        <div className="boot-status">
          A renderer component failed. You can retry without restarting the app.
        </div>
        <div className="boot-status">{this.state.error || 'Unknown error'}</div>
        <button className="hardening-btn primary" onClick={this.retry}>
          RETRY PANEL
        </button>
      </div>
    );
  }
}
