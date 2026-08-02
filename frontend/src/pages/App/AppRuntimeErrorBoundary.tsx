import React, { type ReactNode } from "react";

type State = { failed: boolean; errorId: string | null };

export class AppRuntimeErrorBoundary extends React.Component<{ children: ReactNode }, State> {
  state: State = { failed: false, errorId: null };
  static getDerivedStateFromError(): State {
    return { failed: true, errorId: `ui-${Date.now().toString(36)}` };
  }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("Civitas UI runtime failure", { errorId: this.state.errorId, error: error instanceof Error ? error.message : String(error), componentStack: info.componentStack });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="civitas-page-shell" aria-labelledby="app-runtime-error-title"><section className="civitas-state-region" role="alert"><h1 id="app-runtime-error-title">Civitas could not display this page</h1><p>An unexpected interface error occurred. Your data was not changed.</p><p>Error reference: <code>{this.state.errorId}</code></p><div className="civitas-cluster"><button className="civitas-button" type="button" onClick={() => window.location.reload()}>Reload</button><a className="civitas-button civitas-button-secondary" href="/">Go to home</a></div></section></main>;
  }
}
