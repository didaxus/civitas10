import type { ReactNode } from "react";
import { useId } from "react";
import { Link, useNavigate } from "react-router";
import { StatusPill, type StatusPillStatus } from "./StatusPill";

export type SectionNavigationItem = {
  id: string;
  label: string;
  href: string;
  status?: string;
  statusTone?: StatusPillStatus;
  description?: ReactNode;
};

export const SectionNavigation = ({ label, items, activeId }: { label: string; items: SectionNavigationItem[]; activeId: string }) => {
  const selectId = useId();
  const navigate = useNavigate();
  return (
    <aside className="civitas-card civitas-pad-tight" data-civitas-section-navigation="true">
      <div className="md:hidden">
        <label className="civitas-label" htmlFor={selectId}>{label}</label>
        <select id={selectId} className="civitas-input" value={activeId} onChange={(event) => { const item = items.find((candidate) => candidate.id === event.target.value); if (item) navigate(item.href); }}>
          {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      <nav className="hidden md:block" aria-label={label}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
        <div className="civitas-section-navigation-list">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <Link key={item.id} to={item.href} aria-current={active ? "page" : undefined} className={active ? "civitas-nav-link civitas-nav-link-active" : "civitas-nav-link"}>
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.status ? <StatusPill status={item.statusTone || "neutral"} noDot>{item.status}</StatusPill> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};
