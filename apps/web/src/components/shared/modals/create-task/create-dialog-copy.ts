import type { TFunction } from "i18next";
import type { TaskType } from "@/types/task";

// The create dialog's words for what it creates.
export function createDialogCopy(t: TFunction, type: TaskType) {
  if (type === "feature") {
    return {
      breadcrumb: t("common:modals.createTask.breadcrumbFeature"),
      title: t("common:modals.createTask.titleFeature"),
      description: t("common:modals.createTask.descriptionFeature"),
      titlePlaceholder: t("common:modals.createTask.featureTitlePlaceholder"),
      descriptionPlaceholder: t(
        "common:modals.createTask.featureDescriptionPlaceholder",
      ),
      createButton: t("common:modals.createTask.createButtonFeature"),
      created: t("common:modals.createTask.successCreatedFeature"),
      createError: t("common:modals.createTask.createFeatureError"),
      discardTitle: t("common:modals.createTask.discardTitleFeature"),
      discardDescription: t(
        "common:modals.createTask.discardDescriptionFeature",
      ),
      discardButton: t("common:modals.createTask.discardButtonFeature"),
    };
  }
  return {
    breadcrumb: t("common:modals.createTask.breadcrumbTask"),
    title: t("common:modals.createTask.title"),
    description: t("common:modals.createTask.description"),
    titlePlaceholder: t("common:modals.createTask.taskTitlePlaceholder"),
    descriptionPlaceholder: t(
      "common:modals.createTask.descriptionPlaceholder",
    ),
    createButton: t("common:modals.createTask.createButton"),
    created: t("common:modals.createTask.successCreated"),
    createError: t("common:modals.createTask.createError"),
    discardTitle: t("common:modals.createTask.discardTitle"),
    discardDescription: t("common:modals.createTask.discardDescription"),
    discardButton: t("common:modals.createTask.discardButton"),
  };
}
