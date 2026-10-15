import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_PROJECT_VIEW_OPTIONS,
  type DefaultProjectView,
  isDefaultProjectView,
  useUserPreferencesStore,
} from "@/store/user-preferences";

export function DefaultViewRow() {
  const { t } = useTranslation();
  const defaultProjectView = useUserPreferencesStore(
    (state) => state.defaultProjectView,
  );
  const setDefaultProjectView = useUserPreferencesStore(
    (state) => state.setDefaultProjectView,
  );
  const setViewMode = useUserPreferencesStore((state) => state.setViewMode);
  const labels: Record<DefaultProjectView, string> = {
    gantt: t("settings:preferencesPage.gantt"),
    board: t("settings:preferencesPage.board"),
    list: t("settings:preferencesPage.list"),
  };

  return (
    <SettingsRow
      stack
      title={t("settings:preferencesPage.defaultView")}
      description={t("settings:preferencesPage.defaultViewDescription")}
    >
      {/* Equal columns that grow to fit the longest label, which runs long
          in some locales (e.g. "Wykres Gantta"). */}
      <ToggleGroup
        value={[defaultProjectView]}
        onValueChange={(values) => {
          const next = values[0];
          if (!isDefaultProjectView(next)) return;
          setDefaultProjectView(next);
          // The board route shows board or list by viewMode.
          if (next !== "gantt") setViewMode(next);
        }}
        size="sm"
        aria-label={t("settings:preferencesPage.defaultView")}
        className="grid w-full grid-cols-[repeat(3,1fr)] rounded-lg border border-input bg-background p-0.5 sm:w-auto sm:min-w-56 dark:bg-input/32"
      >
        {DEFAULT_PROJECT_VIEW_OPTIONS.map((view) => (
          <ToggleGroupItem
            key={view}
            value={view}
            className="h-7 min-w-max sm:h-6"
          >
            {labels[view]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </SettingsRow>
  );
}
