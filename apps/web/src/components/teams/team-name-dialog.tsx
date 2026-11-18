import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { Team } from "@/fetchers/team/types";
import { TeamNameForm } from "./team-name-form";

// Creates a team, or renames `team`.
export function TeamNameDialog({
  open,
  onOpenChange,
  team,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
  workspaceId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md">
        <TeamNameForm
          key={team?.id ?? "new"}
          team={team}
          workspaceId={workspaceId}
          onClose={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}
