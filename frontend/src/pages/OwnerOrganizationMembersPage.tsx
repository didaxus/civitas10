import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { SectionCard } from "../shared/ui";
import { useGovernanceApi } from "../features/governance/api";
import { MembersRoleAssignmentsModule } from "../features/governance/modules/members/MembersRoleAssignmentsModule";
import type { GovernanceMemberSummary } from "../features/governance/contracts";

export default function OwnerOrganizationMembersPage() {
  const { organizationId = "" } = useParams();
  const api = useGovernanceApi();
  const [members, setMembers] = useState<GovernanceMemberSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api.getOwnerGovernance(organizationId).then((model) => { if (active) setMembers(model.members || []); }).catch(() => { if (active) setError("Member assignments could not be loaded."); });
    return () => { active = false; };
  }, [api, organizationId]);
  return error ? <SectionCard title="Unable to load members" description={error}><p>Please try again.</p></SectionCard> : <MembersRoleAssignmentsModule members={members} />;
}
