import { useCallback, useRef, useState } from "react";
import { useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { DocumentEditorHandle } from "@/components/editor/document-editor-types";
import { useProjectAutosave } from "@/components/settings/project-general/use-project-autosave";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { uploadProjectDescriptionAsset } from "@/lib/upload-draft-asset";
import type { Project } from "@/types/project";
import { descriptionForEditor } from "./description-for-editor";
import { ProjectDescriptionField } from "./project-description-field";
import { ProjectNameField } from "./project-name-field";
import { ProjectPropertiesRail } from "./project-properties-rail";

// Reads like a document: the name as its title and the description as its
// body, with the project's properties beside it. Saves as people type, like
// the project's general settings.
export function ProjectOverview({
  project,
  workspaceId,
}: {
  project: Project;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const { canEditProjectDetails } = useWorkspacePermission();
  const canEdit = canEditProjectDetails();
  // Without storage the / menu offers no uploads that would only fail.
  const { data: config } = useGetConfig();
  const canUpload = config?.hasImageUploads !== false;
  const editor = useRef<DocumentEditorHandle>(null);
  const stagedAssetIds = useRef<string[]>([]);
  const { form } = useProjectAutosave({
    project,
    workspaceId,
    canEdit,
    detailsOnly: true,
    stagedAssetIds,
  });
  const name = useWatch({ control: form.control, name: "name" });
  const description =
    useWatch({ control: form.control, name: "description" }) ?? "";
  const [draft, setDraft] = useState(description);
  const nameError = form.formState.errors.name?.message;
  const descriptionError = form.formState.errors.description?.message;
  const upload = useCallback(
    async (file: File) => {
      const asset = await uploadProjectDescriptionAsset(project.id, file);
      stagedAssetIds.current.push(asset.id);
      return asset;
    },
    [project.id],
  );

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="flex min-w-0 flex-col lg:flex-1">
        <div className="mx-auto flex w-full max-w-225 flex-1 flex-col gap-6 px-4 pt-8 pb-8 sm:px-12 sm:pt-14 lg:pb-16">
          <ProjectNameField
            value={canEdit ? (name ?? "") : project.name}
            readOnly={!canEdit}
            error={
              nameError
                ? t("tasks:projectHome.overview.nameRequired")
                : undefined
            }
            onChange={(value) =>
              form.setValue("name", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            onEnterBody={() => editor.current?.focus("start")}
          />
          <ProjectDescriptionField
            ref={editor}
            projectId={project.id}
            value={
              canEdit
                ? descriptionForEditor(draft, description)
                : (project.description ?? "")
            }
            readOnly={!canEdit}
            error={descriptionError}
            uploadAsset={canUpload ? upload : undefined}
            onChange={(value) => {
              setDraft(value);
              form.setValue("description", value, { shouldDirty: true });
            }}
          />
        </div>
      </div>
      <ProjectPropertiesRail
        projectId={project.id}
        workspaceId={workspaceId}
        className="px-4 pb-16 sm:px-12 lg:w-80 lg:shrink-0 lg:pt-14 lg:pr-6 lg:pl-0"
      />
    </div>
  );
}
