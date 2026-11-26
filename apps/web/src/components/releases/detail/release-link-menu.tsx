import { ChevronDown, Diamond, Link } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import type { ReleaseLinkKind } from "@/fetchers/release/get-release-link-candidates";

const OPTIONS = [
  {
    kind: "milestone",
    icon: Diamond,
    label: "tasks:releases.link.milestoneAction",
  },
  { kind: "task", icon: Link, label: "tasks:releases.link.taskAction" },
] as const;

// Adds existing work to a release; new work gets its release where it's made.
export function ReleaseLinkMenu({
  onLink,
  size = "sm",
}: {
  onLink: (kind: ReleaseLinkKind) => void;
  size?: ButtonProps["size"];
}) {
  const { t } = useTranslation();
  const selected = useRef(false);

  return (
    <Menu
      onOpenChange={(open) => {
        if (open) selected.current = false;
      }}
    >
      <MenuTrigger render={<Button size={size} variant="outline" />}>
        <Link aria-hidden="true" />
        {t("tasks:releases.link.menu")}
        <ChevronDown className="size-3" aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        className="w-64"
        // Selection opens a dialog that owns focus; Escape returns it.
        finalFocus={() => !selected.current}
      >
        {OPTIONS.map(({ kind, icon: Icon, label }) => (
          <MenuItem
            key={kind}
            onClick={() => {
              selected.current = true;
              onLink(kind);
            }}
          >
            <Icon aria-hidden="true" />
            {t(label)}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
