export type Document = {
  id: string;
  title: string;
  updatedAt: string;
  updatedBy: string;
  preview?: string;
};

export type DocumentOperation = {
  operationId: string;
  documentId: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  problem: { code: string } | null;
};
