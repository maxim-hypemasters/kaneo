import { Link } from "@tanstack/react-router";
import { Trans } from "react-i18next";
import { SettingsNote } from "@/components/settings/settings-note";

type MemberAllowancesNoteProps = {
  workspaceId: string;
};

// Member overrides stay next to their balances on the Time off page.
export function MemberAllowancesNote({
  workspaceId,
}: MemberAllowancesNoteProps) {
  return (
    <SettingsNote>
      <Trans
        i18nKey="settings:workspaceTimeOff.overridesNote"
        components={{
          link: (
            <Link
              to="/dashboard/workspace/$workspaceId/time-off"
              params={{ workspaceId }}
              search={{ view: "balances" }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            />
          ),
        }}
      />
    </SettingsNote>
  );
}
