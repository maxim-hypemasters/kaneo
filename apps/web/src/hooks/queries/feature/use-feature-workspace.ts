import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getFeatureActivity,
  getFeatureDocument,
  getFeatureDocuments,
  getFeatureUpdate,
  getLatestFeatureUpdate,
} from "@/fetchers/feature/feature-workspace";

export const featureWorkspaceKey = (projectId: string, featureId: string) =>
  ["feature-workspace", projectId, featureId] as const;

export function useLatestFeatureUpdate(projectId: string, featureId: string) {
  return useQuery({
    queryKey: [...featureWorkspaceKey(projectId, featureId), "latest-update"],
    queryFn: () => getLatestFeatureUpdate(featureId),
    enabled: Boolean(projectId && featureId),
    staleTime: 30_000,
  });
}

export function useFeatureUpdate(
  projectId: string,
  featureId: string,
  updateId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...featureWorkspaceKey(projectId, featureId),
      "update",
      updateId,
    ],
    queryFn: () => getFeatureUpdate(featureId, updateId ?? ""),
    enabled: enabled && Boolean(projectId && featureId && updateId),
    staleTime: 30_000,
  });
}

export function useFeatureActivity(
  projectId: string,
  featureId: string,
  page: number,
) {
  return useQuery({
    queryKey: [...featureWorkspaceKey(projectId, featureId), "activity", page],
    queryFn: () => getFeatureActivity(featureId, page),
    enabled: Boolean(projectId && featureId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useFeatureDocuments(
  projectId: string,
  featureId: string,
  search: string,
  page: number,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      ...featureWorkspaceKey(projectId, featureId),
      "documents",
      search,
      page,
    ],
    queryFn: () => getFeatureDocuments(featureId, search, page),
    enabled: enabled && Boolean(projectId && featureId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useFeatureDocument(
  projectId: string,
  featureId: string,
  documentId?: string,
) {
  return useQuery({
    queryKey: [
      ...featureWorkspaceKey(projectId, featureId),
      "document",
      documentId,
    ],
    queryFn: () => getFeatureDocument(featureId, documentId ?? ""),
    enabled: Boolean(projectId && featureId && documentId),
    staleTime: 30_000,
  });
}
