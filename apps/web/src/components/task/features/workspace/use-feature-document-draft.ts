import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFeatureDocument,
  updateFeatureDocument,
} from "@/fetchers/feature/feature-workspace";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { useFeatureWorkspaceMutation } from "@/hooks/mutations/feature/use-feature-workspace-mutation";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";
import { HttpError } from "@/lib/http-error";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";

type DocumentInput = { title: string; body: string };

export function useFeatureDocumentDraft({
  featureId,
  projectId,
  document,
  canEdit,
  refresh,
  onSaved,
}: {
  featureId: string;
  projectId: string;
  document?: FeatureDocument;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
  onSaved: (document: FeatureDocument) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DocumentInput | null>(
    document ? null : { title: "", body: "" },
  );
  const [baseline, setBaseline] = useState({
    title: document?.title ?? "",
    body: document?.body ?? "",
    revision: document?.revision ?? 0,
  });
  const [session, setSession] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [serverConflict, setServerConflict] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(true);
  const [saved, setSaved] = useState<FeatureDocument | null>(null);
  const assets = useRef<string[]>([]);
  const writeInFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const mutation = useFeatureWorkspaceMutation(
    projectId,
    featureId,
    (input: DocumentInput & { draftAssetIds: string[] }) =>
      document
        ? updateFeatureDocument(featureId, document.id, {
            ...input,
            expectedRevision: baseline.revision,
          })
        : createFeatureDocument(featureId, input),
  );
  const editing = draft !== null;
  const dirty =
    editing && (draft.title !== baseline.title || draft.body !== baseline.body);
  const conflict =
    editing &&
    (serverConflict ||
      Boolean(document && document.revision !== baseline.revision));
  useEffect(() => {
    if (saved) {
      setSaved(null);
      onSaved(saved);
    }
  }, [saved, onSaved]);

  function edit() {
    if (!canEdit || writeInFlight.current || !document) return;
    setBaseline({
      title: document.title,
      body: document.body,
      revision: document.revision,
    });
    setDraft({ title: document.title, body: document.body });
    setSession((value) => value + 1);
    setServerConflict(false);
    setReviewAvailable(true);
    mutation.reset();
    assets.current = [];
  }
  function cancel() {
    if (writeInFlight.current || uploading) return;
    setDraft(null);
    setServerConflict(false);
    mutation.reset();
    assets.current = [];
  }
  async function refreshLatest() {
    setRefreshing(true);
    setReviewAvailable(false);
    try {
      await refresh();
      if (active.current) setReviewAvailable(true);
    } finally {
      if (active.current) setRefreshing(false);
    }
  }
  async function save() {
    if (
      !canEdit ||
      !draft?.title.trim() ||
      conflict ||
      uploading ||
      writeInFlight.current
    )
      return;
    writeInFlight.current = true;
    try {
      const value = await mutation.mutateAsync({
        ...draft,
        title: draft.title.trim(),
        draftAssetIds: assets.current.filter((id) =>
          draft.body.includes(`/asset/${id}`),
        ),
      });
      if (active.current) {
        queryClient.setQueryData<FeatureDocument>(
          [...featureWorkspaceKey(projectId, featureId), "document", value.id],
          (current) =>
            current && current.revision > value.revision ? current : value,
        );
        setDraft(null);
        assets.current = [];
        if (!document) setSaved(value);
      }
    } catch (failure) {
      if (
        active.current &&
        failure instanceof HttpError &&
        failure.code === "DOCUMENT_CONFLICT"
      ) {
        setServerConflict(true);
        await refreshLatest().catch(() => {});
      }
    } finally {
      writeInFlight.current = false;
    }
  }
  async function upload(file: File) {
    if (!canEdit || !editing || writeInFlight.current)
      throw new Error("Document is not editable");
    const asset = await uploadDraftAsset(projectId, file, featureId);
    if (!active.current) throw new Error("Document has been closed");
    assets.current.push(asset.id);
    return asset;
  }
  return {
    value: draft ?? {
      title: document?.title ?? "",
      body: document?.body ?? "",
    },
    editing,
    dirty,
    conflict,
    uploading,
    session,
    refreshing,
    reviewAvailable,
    saving: mutation.isPending,
    error: mutation.error,
    edit,
    cancel,
    save,
    upload,
    refreshLatest,
    setUploading,
    change(value: Partial<DocumentInput>) {
      if (canEdit && draft && !writeInFlight.current)
        setDraft({ ...draft, ...value });
    },
    keepDraft() {
      if (!document || refreshing || !reviewAvailable) return;
      setBaseline({
        title: document.title,
        body: document.body,
        revision: document.revision,
      });
      setServerConflict(false);
      mutation.reset();
    },
  };
}
