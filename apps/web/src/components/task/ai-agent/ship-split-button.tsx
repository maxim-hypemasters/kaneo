import {
  ChevronDownIcon,
  ClipboardCopyIcon,
  PlayIcon,
  RocketIcon,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";

type ShipSplitButtonProps = {
  canShip: boolean;
  /** Explains why Ship is unavailable; only read while it is. */
  blockersId?: string;
  /** Start or Copy prompt is under way. */
  starting: boolean;
  onShip: (button: HTMLElement) => void;
  onStart: () => void;
  onCopyPrompt: () => void;
  /** Also told `false` when the button goes; keep it stable. */
  onMenuOpenChange: (open: boolean) => void;
};

// The menu keeps Start task and Copy prompt within reach of a ready task,
// even when Ship itself is blocked, for example without a runner.
export function ShipSplitButton({
  canShip,
  blockersId,
  starting,
  onShip,
  onStart,
  onCopyPrompt,
  onMenuOpenChange,
}: ShipSplitButtonProps) {
  const { t } = useTranslation();
  // The menu reports no close when it goes with the button, for example as
  // the task stops being ready, and an open menu keeps the prompt loaded.
  useEffect(() => () => onMenuOpenChange(false), [onMenuOpenChange]);

  return (
    <Group>
      {/* aria-disabled rather than disabled keeps it focusable, so the
          blockers it points to can be read. */}
      <Button
        type="button"
        size="xs"
        aria-disabled={canShip ? undefined : true}
        aria-describedby={canShip ? undefined : blockersId}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-64"
        onClick={canShip ? (event) => onShip(event.currentTarget) : undefined}
      >
        <RocketIcon aria-hidden="true" />
        {t("tasks:aiAgent.ship")}
      </Button>
      <GroupSeparator />
      <Menu onOpenChange={(open) => onMenuOpenChange(open)}>
        <MenuTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              aria-label={t("tasks:aiAgent.shipMenuLabel")}
            />
          }
        >
          <ChevronDownIcon aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem disabled={starting} onClick={onStart}>
            <PlayIcon aria-hidden="true" />
            {t("tasks:aiAgent.startTask")}
          </MenuItem>
          <MenuItem disabled={starting} onClick={onCopyPrompt}>
            <ClipboardCopyIcon aria-hidden="true" />
            {t("tasks:aiAgent.copyPrompt")}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </Group>
  );
}
