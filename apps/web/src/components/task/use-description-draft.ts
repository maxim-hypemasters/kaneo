import { useEffect, useRef, useState } from "react";
import { useUpdateTaskDescription } from "@/hooks/mutations/task/use-update-task-description";
import { HttpError } from "@/lib/http-error";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";

export function useDescriptionDraft({
  taskId,
  projectId,
  description,
  canEdit,
  refresh,
}: {
  taskId: string;
  projectId: string;
  description: string;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { mutateAsync } = useUpdateTaskDescription();
  const [draft, setDraft] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [baseline, setBaseline] = useState(description);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [serverConflict, setServerConflict] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(true);
  const assets = useRef<string[]>([]);
  const writeInFlight = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const editing = draft !== null;
  const dirty = editing && draft !== baseline;
  const conflict = editing && (serverConflict || description !== baseline);

  function edit() {
    if (!canEdit || writeInFlight.current) return;
    setBaseline(description);
    setSession((current) => current + 1);
    setDraft(description);
    setError(null);
    setServerConflict(false);
    setReviewAvailable(true);
    assets.current = [];
  }

  function cancel() {
    if (writeInFlight.current || uploading) return;
    setDraft(null);
    setError(null);
    setServerConflict(false);
    assets.current = [];
  }

  async function refreshLatest() {
    setRefreshing(true);
    setReviewAvailable(false);
    try {
      await refresh();
      if (active.current) setReviewAvailable(true);
    } catch (failure) {
      if (active.current) setError(failure);
    } finally {
      if (active.current) setRefreshing(false);
    }
  }

  async function save() {
    if (!canEdit || !editing || conflict || uploading || writeInFlight.current)
      return;
    writeInFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await mutateAsync({
        id: taskId,
        projectId,
        description: draft,
        expectedDescription: baseline,
        draftAssetIds: assets.current.filter((id) =>
          draft.includes(`/asset/${id}`),
        ),
      });
      if (active.current) {
        setDraft(null);
        assets.current = [];
      }
    } catch (failure) {
      if (!active.current) return;
      setError(failure);
      if (
        failure instanceof HttpError &&
        failure.code === "DESCRIPTION_CONFLICT"
      ) {
        setServerConflict(true);
        await refreshLatest();
      }
    } finally {
      writeInFlight.current = false;
      if (active.current) setSaving(false);
    }
  }

  async function upload(file: File) {
    if (!canEdit || !editing || writeInFlight.current)
      throw new Error("Document is not editable");
    const asset = await uploadDraftAsset(projectId, file, taskId);
    if (!active.current) throw new Error("Document has been closed");
    assets.current.push(asset.id);
    return asset;
  }

  function keepDraft() {
    if (refreshing || !reviewAvailable) return;
    setBaseline(description);
    setServerConflict(false);
    setError(null);
  }

  return {
    value: draft ?? description,
    session,
    editing,
    dirty,
    saving,
    uploading,
    refreshing,
    reviewAvailable,
    refreshLatest,
    error,
    conflict,
    edit,
    cancel,
    save,
    upload,
    keepDraft,
    setUploading,
    change(value: string) {
      if (canEdit && editing && !writeInFlight.current) setDraft(value);
    },
  };
}
