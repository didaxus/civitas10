import { EmptyState, SectionCard } from "../../../../shared/ui";

export const PeopleSegmentationPlaceholder = () => (
  <SectionCard title="Segmentation" description="Define and review organization people segments.">
    <EmptyState message="No segmentation configuration is available for this organization." />
  </SectionCard>
);
