import { useId } from "react";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { listedShipBlockers } from "./ship-blocker-key";
import { ShipBlockers } from "./ship-blockers";
import { ShipSplitButton } from "./ship-split-button";
import type { StartActionsMode } from "./start-actions-mode";
import { StartTaskButton } from "./start-task-button";

type StartActionsProps = {
  mode: Exclude<StartActionsMode, null>;
  ship: Pick<TaskAgent["ship"], "canShip" | "blockers">;
  starting: boolean;
  onShip: (button: HTMLElement) => void;
  onStart: () => void;
  onCopyPrompt: () => void;
  onMenuOpenChange: (open: boolean) => void;
};

// What Ship still needs shows under both modes: before a task is ready it
// says what readiness is missing.
export function StartActions({
  mode,
  ship,
  starting,
  onShip,
  onStart,
  onCopyPrompt,
  onMenuOpenChange,
}: StartActionsProps) {
  const blockersId = useId();
  // The list leaves out what the card says elsewhere, such as a missing
  // runner, and may then not render at all.
  const blockersListed = listedShipBlockers(ship.blockers).length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 px-2">
        {mode === "ship" ? (
          <ShipSplitButton
            canShip={ship.canShip}
            blockersId={blockersListed ? blockersId : undefined}
            starting={starting}
            onShip={onShip}
            onStart={onStart}
            onCopyPrompt={onCopyPrompt}
            onMenuOpenChange={onMenuOpenChange}
          />
        ) : (
          <StartTaskButton pending={starting} onStart={onStart} />
        )}
      </div>
      {ship.canShip ? null : (
        <ShipBlockers id={blockersId} blockers={ship.blockers} />
      )}
    </div>
  );
}
