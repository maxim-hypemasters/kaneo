import { useMemo } from "react";
import type { CustomFieldDefinition } from "@/components/project/custom-fields/types";
import useGetCustomFieldFilterValues from "@/hooks/queries/custom-field/use-get-custom-field-filter-values";
import useGetCustomFieldsByProject from "@/hooks/queries/custom-field/use-get-custom-fields-by-project";
import useGetLabelsByWorkspace from "@/hooks/queries/label/use-get-labels-by-workspace";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { releaseSummaries } from "@/lib/releases/release-summaries";
import type { ReleaseSummary } from "@/types/release";

export type TaskFilterOptions = ReturnType<typeof useTaskFilterOptions>;

const NO_RELEASES: ReleaseSummary[] = [];

export function useTaskFilterOptions(projectId: string, workspaceId: string) {
  const { data: users } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: labels = [] } = useGetLabelsByWorkspace(workspaceId);
  const { data: rawCustomFields = [] } = useGetCustomFieldsByProject(projectId);
  const { data: filterValues = [] } = useGetCustomFieldFilterValues(projectId);
  // Without progress, which changes with every completion and no task view
  // shows.
  const { data: releases = NO_RELEASES, isPending: releasesLoading } =
    useGetReleases(projectId, { select: releaseSummaries });

  const customFields = useMemo<CustomFieldDefinition[]>(
    () =>
      rawCustomFields.map((field, index) => ({
        ...field,
        type: field.type as CustomFieldDefinition["type"],
        options: Array.isArray(field.options)
          ? (field.options as string[])
          : null,
        position: index,
      })),
    [rawCustomFields],
  );

  const usedCustomFieldValues = useMemo<Record<string, string[]>>(
    () => Object.fromEntries(filterValues.map((f) => [f.fieldId, f.values])),
    [filterValues],
  );

  return {
    members: users?.members ?? [],
    labels,
    customFields,
    usedCustomFieldValues,
    releases,
    releasesLoading,
  };
}
