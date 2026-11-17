import { TreePalm } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsPage } from "@/components/settings/settings-page";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// For members without time_off:approve who open the page directly; the nav
// hides it from them.
export function TimeOffSettingsNotAllowed() {
  const { t } = useTranslation();

  return (
    <SettingsPage title={t("settings:workspaceTimeOff.title")}>
      <Empty className="rounded-xl border border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TreePalm aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-base">
            {t("settings:workspaceTimeOff.notAllowed.title")}
          </EmptyTitle>
          <EmptyDescription>
            {t("settings:workspaceTimeOff.notAllowed.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </SettingsPage>
  );
}
