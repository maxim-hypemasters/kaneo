import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useProjectAutosave } from "@/components/settings/project-general/use-project-autosave";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type { Project } from "@/types/project";
import { ProjectDescriptionField } from "./project-description-field";
import { ProjectNameField } from "./project-name-field";

// Saves as people type, like the project's general settings.
export function ProjectOverview({
  project,
  workspaceId,
}: {
  project: Project;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const { canUpdateProjects } = useWorkspacePermission();
  const canEdit = canUpdateProjects();
  const { form } = useProjectAutosave({ project, workspaceId, canEdit });
  const name = useWatch({ control: form.control, name: "name" });
  const description = useWatch({ control: form.control, name: "description" });
  const nameError = form.formState.errors.name?.message;

  return (
    <div className="mx-auto flex w-full max-w-225 flex-col gap-6 px-4 pt-8 pb-16 sm:px-12 sm:pt-14">
      <ProjectNameField
        value={canEdit ? (name ?? "") : project.name}
        readOnly={!canEdit}
        error={
          nameError ? t("tasks:projectHome.overview.nameRequired") : undefined
        }
        onChange={(value) =>
          form.setValue("name", value, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      />
      <section aria-labelledby="project-description-heading">
        <h2
          id="project-description-heading"
          className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide"
        >
          {t("tasks:projectHome.overview.description")}
        </h2>
        <ProjectDescriptionField
          value={canEdit ? (description ?? "") : (project.description ?? "")}
          readOnly={!canEdit}
          onChange={(value) =>
            form.setValue("description", value, { shouldDirty: true })
          }
        />
      </section>
    </div>
  );
}
