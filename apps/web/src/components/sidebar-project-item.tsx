import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProjectProgress } from "@/components/project-progress";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import icons from "@/constants/project-icons";
import { EASE_OUT_CSS } from "@/lib/motion";

export function SidebarProjectItem({
  project,
  canReorder,
  current,
  expanded,
  onExpandedChange,
  onOpen,
  actions,
  children,
}: {
  project: {
    id: string;
    name: string;
    icon: string | null;
    statistics: { completionPercentage: number };
  };
  canReorder: boolean;
  current: boolean;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onOpen: () => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: project.id,
    disabled: !canReorder,
    animateLayoutChanges: () => false,
    transition: { duration: 200, easing: EASE_OUT_CSS },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const ProjectIcon = icons[project.icon as keyof typeof icons] || icons.Layout;

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      data-kaneo-sortable=""
      className={isDragging ? "opacity-0" : undefined}
    >
      <Collapsible open={expanded} onOpenChange={onExpandedChange}>
        <div className="group/project-header relative flex min-w-0 items-center">
          <CollapsibleTrigger
            aria-label={t(
              expanded
                ? "navigation:projectList.collapseProject"
                : "navigation:projectList.expandProject",
              { name: project.name },
            )}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-panel-open:[&_svg]:rotate-90"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 transition-transform duration-200 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          <SidebarMenuButton
            ref={setActivatorNodeRef}
            isActive={current}
            size="default"
            className="h-8 min-w-0 flex-1 pr-7 text-sm"
            onClick={onOpen}
            // Only the project name/icon initiates a reorder, never the
            // chevron, overflow actions, or submenu links.
            {...(canReorder ? listeners : {})}
          >
            <ProjectIcon aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={project.name}>
              {project.name}
            </span>
            <ProjectProgress
              percentage={project.statistics.completionPercentage}
              className="text-muted-foreground max-md:hidden group-focus-within/project-header:opacity-0 group-hover/project-header:opacity-0 group-has-data-popup-open/project-header:opacity-0"
            />
          </SidebarMenuButton>
          {actions}
        </div>
        <CollapsiblePanel className="motion-reduce:transition-none">
          {children}
        </CollapsiblePanel>
      </Collapsible>
    </SidebarMenuItem>
  );
}
