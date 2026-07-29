import { useState } from "react";
import { DataTable, EmptyState, FormField, SectionCard, StatusPill, type DataTableColumn } from "../../../../shared/ui";
import type { GovernanceAccessPreview, GovernanceAccessPreviewRequest, GovernanceSurface } from "../../contracts";

const columns: DataTableColumn<GovernanceAccessPreview>[] = [
  { key: "subject", header: "Subject", render: (preview) => <span className="font-medium text-text">{preview.subjectId}</span> },
  { key: "target", header: "Permission", render: (preview) => preview.permission },
  { key: "decision", header: "Decision", render: (preview) => <StatusPill status={preview.summary.allowed ? "success" : "danger"}>{preview.summary.allowed ? "Allowed" : "Denied"}</StatusPill> },
  { key: "reason", header: "First decisive reason", render: (preview) => preview.summary.firstDecisiveReason },
];

export const AccessPreviewUnavailable = () => (
  <SectionCard title="Access preview" description="Preview what a user or role can do in this organization once the service is active.">
    <EmptyState message="Access preview is not available yet"><p className="text-sm text-muted-strong">The preview service is not active for this organization.</p></EmptyState>
  </SectionCard>
);

export const AccessPreviewModule = ({ organizationId, surface, previews, onPreview }: { organizationId: string; surface: GovernanceSurface; previews: readonly GovernanceAccessPreview[]; onPreview: (request: GovernanceAccessPreviewRequest) => Promise<GovernanceAccessPreview> }) => {
  const [subjectId, setSubjectId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [previewResult, setPreviewResult] = useState<GovernanceAccessPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulatePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const request: GovernanceAccessPreviewRequest = { organizationId, surface, subjectId, permission: targetId };
      const result = await onPreview(request);
      setPreviewResult(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access preview failed.");
    } finally {
      setLoading(false);
    }
  };

  const visiblePreviews = previewResult ? [previewResult, ...previews] : previews;

  return (
    <SectionCard title="Access preview" description="Simulate an authorization decision for this selected organization." actions={<StatusPill status="success">Read-only</StatusPill>}>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" data-access-preview-flow="actor-action-simulate-explanation">
        <FormField id="governance-preview-subject" label="Actor or role"><input id="governance-preview-subject" className="civitas-input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} placeholder="user or role id" /></FormField>
        <FormField id="governance-preview-target" label="Permission"><input id="governance-preview-target" className="civitas-input" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="canonical permission id" /></FormField>
        <button type="button" className="civitas-primary-button self-end" disabled={!subjectId || !targetId || loading} onClick={() => void simulatePreview()}>{loading ? "Previewing..." : "Preview access"}</button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger-strong">{error}</p> : null}
      <DataTable columns={columns} data={[...visiblePreviews]} getKey={(preview, index) => `${preview.decisionId}-${index}`} emptyState={<EmptyState message="No access previews"><p className="text-sm text-muted-strong">Run a preview when the service is available, or review returned preview rows here.</p></EmptyState>} />
      {previewResult?.selectedDependencyGraph ? <div className="mt-4" aria-label="Selected authorization dependency list"><h3 className="font-medium">Selected dependency path</h3><ol className="mt-2 list-decimal pl-5 text-sm">{previewResult.selectedDependencyGraph.nodes.map((node) => <li key={node.id}>{node.layer}: {node.passed ? "passed" : `denied (${node.reasonCode || "reason unavailable"})`}</li>)}</ol></div> : null}
    </SectionCard>
  );
};
