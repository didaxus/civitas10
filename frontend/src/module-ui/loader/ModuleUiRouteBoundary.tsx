import React, { Suspense, type ReactNode } from "react";

type Props = { moduleId: string; children: ReactNode };
type State = { failed: boolean };

export class ModuleUiRouteBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error("Module UI route failed safely", { moduleId: this.props.moduleId, error: error instanceof Error ? error.message : String(error) });
  }
  render() {
    if (this.state.failed) return <ModuleUnavailable moduleId={this.props.moduleId} />;
    return <Suspense fallback={<p role="status">Loading module…</p>}>{this.props.children}</Suspense>;
  }
}

export function ModuleUnavailable({ moduleId }: { moduleId: string }) {
  const name = moduleId === "planning" ? "Planning" : "This module";
  return <section className="civitas-state-region" role="alert" aria-labelledby={`${moduleId}-unavailable-title`}><h1 id={`${moduleId}-unavailable-title`}>{name}</h1><p>{name} is not currently available.</p></section>;
}
