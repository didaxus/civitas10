import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router";
import { OwnerShell, PageHeader } from "../../components/owner/OwnerUI";
import { AlertStrip, StateRegion } from "../../shared/ui";
import { appRoutes } from "../../navigation/routes";
import { toAppErrorPresentation, type AppErrorPresentation } from "../../errors/appErrorPresentation";

type Props = { children: ReactNode; organizationId?: string };
type State = { error: AppErrorPresentation | null };

export class OwnerOrganizationRouteBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: toAppErrorPresentation(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Owner organization route failed", { error: toAppErrorPresentation(error), componentStack: info.componentStack });
  }

  componentDidUpdate(previous: Props) {
    if (previous.organizationId !== this.props.organizationId && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const error = this.state.error;
    return (
      <OwnerShell organizationId={this.props.organizationId}>
        <PageHeader eyebrow="Organization detail" title="Organization route error" description="The owner shell is still available while this route recovers." />
        <StateRegion>
          <AlertStrip variant="danger" title={`Organization route error · ${error.code}`}>
            <p>{error.humanMessage}</p>
            <div className="flex flex-wrap gap-2">
              {error.retryable ? <button type="button" className="civitas-secondary-button" onClick={() => this.setState({ error: null })}>Try again</button> : null}
              <Link className="civitas-secondary-button" to={appRoutes.ownerOrganizations.path}>Return to Directory</Link>
            </div>
          </AlertStrip>
        </StateRegion>
      </OwnerShell>
    );
  }
}
