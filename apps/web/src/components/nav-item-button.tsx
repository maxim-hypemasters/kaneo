import { useLocation, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/cn";

export type NavItem = {
  title: string;
  icon: LucideIcon;
  url: string;
  count?: number;
  emphasizeCount?: boolean;
};

export function NavItemButton({ item }: { item: NavItem }) {
  const navigate = useNavigate();
  const isActive = useLocation({
    select: (location) => location.pathname.replace(/\/+$/, "") === item.url,
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        isActive={isActive}
        size="default"
        className="h-8 text-sm"
        onClick={() => navigate({ to: item.url })}
      >
        <item.icon aria-hidden="true" />
        <span>{item.title}</span>
        {item.count ? (
          <span
            className={cn(
              "ml-auto flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] tabular-nums",
              item.emphasizeCount
                ? "bg-foreground font-semibold text-background"
                : "font-medium text-muted-foreground",
            )}
          >
            {item.count > 99 ? "99+" : item.count}
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
