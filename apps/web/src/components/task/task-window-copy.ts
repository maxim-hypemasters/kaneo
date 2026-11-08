import type { TFunction } from "i18next";

// The task window's words for what it shows: a Task/Bug or a Feature.
export function taskWindowCopy(t: TFunction, isFeature: boolean) {
  if (isFeature) {
    return {
      copyLink: t("tasks:features.window.copyLink"),
      linkCopied: t("tasks:features.window.linkCopied"),
      copyId: t("tasks:features.window.copyId"),
      idCopied: t("tasks:features.window.idCopied"),
      copyTitle: t("tasks:features.window.copyTitle"),
      titleCopied: t("tasks:features.window.titleCopied"),
      delete: t("tasks:features.window.delete"),
      deleteTitle: t("tasks:features.window.deleteTitle"),
      deleteDescription: t("tasks:features.window.deleteDescription"),
      deleted: t("tasks:features.window.deleted"),
      deleteError: t("tasks:features.window.deleteError"),
      move: t("tasks:features.window.move"),
      moved: t("tasks:features.window.moved"),
      loading: t("tasks:features.window.loading"),
    };
  }
  return {
    copyLink: t("tasks:properties.copyTaskLink"),
    linkCopied: t("tasks:properties.taskLinkCopied"),
    copyId: t("navigation:shortcuts.items.copyTaskId"),
    idCopied: t("tasks:shortcuts.idCopied"),
    copyTitle: t("navigation:shortcuts.items.copyTaskTitle"),
    titleCopied: t("tasks:shortcuts.titleCopied"),
    delete: t("tasks:delete.action"),
    deleteTitle: t("tasks:delete.title"),
    deleteDescription: t("tasks:delete.description"),
    deleted: t("tasks:delete.success"),
    deleteError: t("tasks:delete.error"),
    move: t("tasks:move.title"),
    moved: t("tasks:move.success"),
    loading: t("tasks:common.loadingTask"),
  };
}

export type TaskWindowCopy = ReturnType<typeof taskWindowCopy>;
