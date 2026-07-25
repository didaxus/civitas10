import { useParams } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { useLogto } from "@logto/react";
import { useOrganizationApi } from "../../api/organization";
import { OrganizationLayout } from "../../components/layout/AppShell";
import { type Document } from './types';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { ActionBar } from './components/ActionBar';
import { DocumentList } from './components/DocumentList';

const OrganizationPage = () => {
  const { orgId: organizationId } = useParams();
  const { isAuthenticated } = useLogto();
  const { getDocuments, getUserOrganizationScopes } = useOrganizationApi();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userScopes, setUserScopes] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    if (!organizationId || !isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const [scopes, docsData] = await Promise.all([
        getUserOrganizationScopes(organizationId),
        getDocuments(organizationId),
      ]);

      setUserScopes(scopes);
      setDocuments(docsData);
    } catch (error) {
      setError(error instanceof Error ? error : new Error("Failed to fetch data"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, isAuthenticated, getUserOrganizationScopes, getDocuments]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  return (
    <OrganizationLayout organizationId={organizationId} isAdmin={userScopes.includes("create:documents")}>
      <section className="space-y-6" data-organization-workspace="true">
        <ActionBar canCreateDocuments={userScopes.includes("create:documents")} />
        <DocumentList documents={documents} />
      </section>
    </OrganizationLayout>
  );
};

export default OrganizationPage;
