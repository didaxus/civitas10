import type { ReactNode } from "react";
import { useId } from "react";
import { useNavigate } from "react-router";
import type { Icon } from "@tabler/icons-react";
import { NavCollapse, type NavCollapseItem } from "./NavCollapse";
import type { StatusPillStatus } from "./StatusPill";

export type WorkspaceNavigationItem = {
  id: string;
  label: string;
  href: string;
  status?: string;
  statusTone?: StatusPillStatus;
  description?: ReactNode;
  icon?: Icon;
};

export type WorkspaceNavigationGroup = {
  id: string;
  label: string;
  items: WorkspaceNavigationItem[];
};

export const WorkspaceShell = ({
  label,
  groups,
  activeId,
  children,
}: {
  label: string;
  groups: WorkspaceNavigationGroup[];
  activeId: string;
  children: ReactNode;
}) => {
  const selectId = useId();
  const navigate = useNavigate();
  const flatItems = groups.flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })));
  const navigationItems: NavCollapseItem[] = groups.map((group) => ({
    label: group.label,
    children: group.items.map((item) => ({
      label: item.label,
      path: item.href,
      icon: item.icon,
      match: () => item.id === activeId,
      status: item.status,
      statusTone: item.statusTone,
    })),
  }));

  return (
    <div className="civitas-workspace-shell" data-civitas-workspace-shell="true">
      <aside className="civitas-card civitas-pad-tight" aria-label={label}>
        <div className="md:hidden">
          <label className="civitas-label" htmlFor={selectId}>{label}</label>
          <select id={selectId} className="civitas-input" value={activeId} onChange={(event) => {
            const item = flatItems.find((candidate) => candidate.id === event.target.value);
            if (item) navigate(item.href);
          }}>
            {flatItems.map((item) => <option key={item.id} value={item.id}>{item.groupLabel} — {item.label}</option>)}
          </select>
        </div>
        <div className="hidden md:block">
          <p className="civitas-workspace-nav-title">{label}</p>
          <NavCollapse items={navigationItems} label={label} />
        </div>
      </aside>
      <section className="min-w-0" aria-labelledby="workspace-section-title">
        {children}
      </section>
    </div>
  );
};
