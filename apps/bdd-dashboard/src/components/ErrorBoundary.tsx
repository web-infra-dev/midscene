import { Component, type ReactNode } from 'react';
import { DASHBOARD_CLI_COMMAND, errorMessage } from '../model/copy';

/**
 * Root error boundary: a malformed injected ExploreModel payload makes
 * readExploreModel() throw during App's first render, which would otherwise
 * leave a blank page. Class component on purpose — React 18 has no hook
 * equivalent for componentDidCatch/getDerivedStateFromError.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state = { message: null };

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: errorMessage(error) };
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="boot-error" role="alert">
        <div className="boot-error-card">
          <h1>Dashboard failed to load</h1>
          <p className="boot-error-message">{this.state.message}</p>
          <p className="boot-error-hint">
            If the embedded model data is stale or corrupted, regenerating this
            page with <code>{DASHBOARD_CLI_COMMAND}</code> usually fixes it.
          </p>
        </div>
      </div>
    );
  }
}
