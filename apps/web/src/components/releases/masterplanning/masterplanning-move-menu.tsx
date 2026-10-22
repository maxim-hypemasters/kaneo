import { ArrowRightLeft } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import type { Release } from "@/types/release";

export function MasterplanningMoveMenu({
  releases,
  releaseId,
  pending,
  onMove,
}: {
  releases: readonly Release[];
  releaseId: string | null;
  pending: boolean;
  onMove: (releaseId: string | null) => void;
}) {
  const { t } = useTranslation();
  const moving = useRef(false);
  const selectRelease = (target: string | null) => {
    moving.current = true;
    onMove(target);
  };
  return (
    <Menu
      onOpenChange={(open) => {
        if (open) moving.current = false;
      }}
    >
      <MenuTrigger
        disabled={pending}
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("tasks:releases.masterplanning.moveToRelease")}
          />
        }
      >
        <ArrowRightLeft aria-hidden="true" className="size-3.5" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        className="max-h-72 max-w-80 overflow-y-auto"
        finalFocus={() => !moving.current}
      >
        {releases.map((release) => (
          <MenuItem
            key={release.id}
            disabled={release.id === releaseId}
            onClick={() => selectRelease(release.id)}
            title={release.name}
            className="min-w-0"
          >
            <span className="truncate">{release.name}</span>
          </MenuItem>
        ))}
        <MenuItem
          disabled={releaseId === null}
          onClick={() => selectRelease(null)}
        >
          {t("tasks:releases.none")}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
