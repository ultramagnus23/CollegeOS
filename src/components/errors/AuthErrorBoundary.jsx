import React from 'react';

export class AuthErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      stack: '',
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Authentication failed unexpectedly.',
    };
  }

  componentDidCatch(error, errorInfo) {
    const stack = errorInfo?.componentStack || '';
    this.setState({ stack });
    console.error('[auth-boundary]', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      componentStack: stack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '', stack: '' });
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry();
      return;
    }
    window.location.assign('/auth');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-md">
          <h1 className="text-xl font-semibold text-foreground">Sign-in temporarily unavailable</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We hit an unexpected authentication error. Please retry sign-in.
          </p>
          {this.state.message ? (
            <p className="mt-3 text-sm text-red-600 break-words">{this.state.message}</p>
          ) : null}
          {import.meta.env.DEV && this.state.stack ? (
            <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {this.state.stack}
            </pre>
          ) : null}
          <button
            type="button"
            className="mt-5 w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            onClick={this.handleRetry}
          >
            Retry sign-in
          </button>
        </div>
      </div>
    );
  }
}

export default AuthErrorBoundary;

