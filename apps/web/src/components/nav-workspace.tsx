import { ChevronRight, TreePalm, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type NavItem, NavItemButton } from "@/components/nav-item-button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function NavWorkspace() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { canReadTimeOff, canRequestTimeOff, canApproveTimeOff } =
    useWorkspacePermission();

  if (!workspace) return null;

  const homeUrl = `/dashboard/workspace/${workspace.id}`;
  const navItems: NavItem[] = [
    {
      title: t("navigation:sidebar.members"),
      icon: Users,
      url: `${homeUrl}/members`,
    },
  ];

  // No count: a pending-request query would run on every page.
  if (canReadTimeOff() || canRequestTimeOff() || canApproveTimeOff()) {
    navItems.push({
      title: t("navigation:sidebar.timeOff"),
      icon: TreePalm,
      url: `${homeUrl}/time-off`,
    });
  }

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup className="group-data-[collapsible=icon]:hidden gap-1 p-2 pt-1">
        <CollapsibleTrigger
          className="data-panel-open:[&_svg]:rotate-90"
          render={
            <SidebarGroupLabel className="h-7 cursor-pointer justify-start gap-1 px-0 text-sidebar-accent-foreground" />
          }
        >
          <span>{t("navigation:sidebar.workspace")}</span>
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <NavItemButton key={item.url} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  );
}
