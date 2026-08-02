import type { DocumentOperation } from '../types';
export const DocumentOperationStatus = ({ operation, onCancel, onDownload }: { operation: DocumentOperation; onCancel:()=>void; onDownload:()=>void }) => {
  const busy = operation.state === 'pending' || operation.state === 'running';
  return <section aria-live="polite" aria-busy={busy} className="rounded-lg border border-border bg-surface p-4">
    <div className="flex items-center justify-between"><div><h2 className="font-semibold">Document generation</h2><p className="text-sm text-muted-strong">{operation.state === 'pending' ? 'Waiting for a worker…' : operation.state === 'running' ? `Generating… attempt ${operation.attempts} of ${operation.maxAttempts}` : operation.state === 'succeeded' ? 'Your document is ready.' : operation.state === 'cancelled' ? 'Generation cancelled.' : `Generation failed: ${operation.problem?.code || 'unknown error'}`}</p></div>
    {busy && <button className="civitas-secondary-button" onClick={onCancel}>Cancel</button>}
    {operation.state === 'succeeded' && operation.documentId && <button className="civitas-primary-button" onClick={onDownload}>Download</button>}</div>
    {busy && <div className="mt-3 h-2 overflow-hidden rounded bg-border" role="progressbar"><div className="h-full w-2/3 animate-pulse bg-primary" /></div>}
  </section>;
};
