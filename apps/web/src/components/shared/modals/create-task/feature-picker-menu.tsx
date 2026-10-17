import { CircleSlash2, Layers, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import { useGetProjectFeatures } from "@/hooks/queries/task/use-get-project-features";
import {
  choiceOf,
  type FeatureChoice,
  type FeaturePickerOption,
  featurePickerOptions,
} from "./feature-picker-options";

type FeaturePickerMenuProps = {
  projectId: string;
  projectSlug: string | undefined;
  value: FeatureChoice | null;
  onSelect: (choice: FeatureChoice | null) => void;
};

export function FeaturePickerMenu({
  projectId,
  projectSlug,
  value,
  onSelect,
}: FeaturePickerMenuProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { data: features, isPending } = useGetProjectFeatures(projectId);
  const options = featurePickerOptions({
    features: features ?? [],
    query,
    choice: value,
    slug: projectSlug,
  });

  const menuItem = (option: FeaturePickerOption): OptionMenuItem => {
    // featurePickerOptions already searched titles and IDs, so pinned keeps
    // OptionMenu from filtering the options again by their labels only.
    const shared = {
      value: option.value,
      selected: option.selected,
      pinned: true,
    };
    if (option.kind === "none") {
      return {
        ...shared,
        label: t("common:modals.createTask.noFeature"),
        icon: <CircleSlash2 className="text-muted-foreground" />,
      };
    }
    if (option.kind === "feature") {
      return {
        ...shared,
        label: option.feature.title,
        hint: option.displayId ?? undefined,
        icon: <Layers className="text-muted-foreground" />,
      };
    }
    return {
      ...shared,
      label: option.selected
        ? t("common:modals.createTask.newFeatureSuffix", { name: option.title })
        : t("common:modals.createTask.createFeature", { name: option.title }),
      icon: <Plus className="text-muted-foreground" />,
    };
  };

  // Without features (they failed to load), a new one can still be named.
  const notice = isPending
    ? null
    : features === undefined
      ? t("common:modals.createTask.loadFeaturesError")
      : options.some((option) => option.kind === "feature")
        ? null
        : t("common:modals.createTask.noFeaturesFound");

  return (
    <>
      <OptionMenu
        label={t("common:modals.createTask.feature")}
        placeholder={t("common:modals.createTask.searchFeatures")}
        options={options.map(menuItem)}
        onQueryChange={setQuery}
        numberShortcuts={false}
        onSelect={(selected) => {
          const option = options.find((item) => item.value === selected);
          if (option) onSelect(choiceOf(option));
        }}
        status={
          isPending ? t("common:modals.createTask.loadingFeatures") : undefined
        }
      />
      <p
        role="status"
        className="px-3 pb-3 text-muted-foreground text-xs empty:hidden"
      >
        {notice}
      </p>
    </>
  );
}
