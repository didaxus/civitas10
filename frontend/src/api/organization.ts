import { useApi } from './base';
import { useMemo } from 'react';
import { useLogto } from '@logto/react';
import { Document, DocumentOperation } from '../pages/OrganizationPage/types';

export const useOrganizationApi = () => {
  const { organizationApiFetch } = useApi();
  const { getOrganizationToken, getOrganizationTokenClaims } = useLogto();

  return useMemo(() => ({
    getDocuments: async (organizationId: string): Promise<Document[]> => {
      return await organizationApiFetch(organizationId, '/documents', {
        method: 'GET',
      });
    },

    createDocument: async (organizationId: string, data: {
      templateId: string; planVersion: string; profileVersion: string; templateVersion: string;
    }): Promise<DocumentOperation> => {
      return await organizationApiFetch(organizationId, '/document-operations', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(data),
      });
    },
    getDocumentOperation: async (organizationId: string, operationId: string): Promise<DocumentOperation> =>
      organizationApiFetch(organizationId, `/document-operations/${operationId}`, { method: 'GET' }),
    cancelDocumentOperation: async (organizationId: string, operationId: string): Promise<DocumentOperation> =>
      organizationApiFetch(organizationId, `/document-operations/${operationId}/cancel`, { method: 'POST' }),
    authorizeDocumentDownload: async (organizationId: string, documentId: string): Promise<{url:string;expiresAt:string}> =>
      organizationApiFetch(organizationId, `/documents/${documentId}/download`, { method: 'POST' }),

    getUserOrganizationScopes: async (organizationId: string): Promise<string[]> => {
      const organizationToken = await getOrganizationToken(organizationId);
      if (!organizationToken) {
        throw new Error("User is not a member of the organization");
      }

      const tokenClaims = await getOrganizationTokenClaims(organizationId);
      return tokenClaims?.scope?.split(" ") || [];
    },
  }), [organizationApiFetch, getOrganizationToken, getOrganizationTokenClaims]);
};
