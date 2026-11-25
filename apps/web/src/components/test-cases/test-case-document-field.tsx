import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import { DocumentEditor } from "@/components/editor/document-editor";
import { Button } from "@/components/ui/button";

// A test case text, shown like a task description: read until clicked, then
// edited in the same editor and saved or cancelled together.
export function TestCaseDocumentField({
  documentKey,
  label,
  placeholder,
  value,
  canEdit,
  onSave,
}: {
  documentKey: string;
  label: string;
  placeholder: string;
  value: string | null;
  canEdit: boolean;
  onSave: (value: string | null) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const saved = value ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped to reload the editor with the saved text.
  const [session, setSession] = useState(0);
  const dirty = editing && draft !== saved;

  const cancel = () => {
    setEditing(false);
    setFailed(false);
    setDraft(saved);
    setSession((current) => current + 1);
  };
  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      if (dirty) await onSave(draft.trim() ? draft : null);
      setEditing(false);
      setSession((current) => current + 1);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  useDocumentDraftGuard({ dirty, saving, onDiscard: cancel });

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-medium text-sm">{label}</h3>
      <DocumentEditor
        documentKey={`${documentKey}:${session}`}
        value={editing ? draft : saved}
        onChange={setDraft}
        onRequestEdit={
          !editing && canEdit
            ? () => {
                setDraft(saved);
                setEditing(true);
              }
            : undefined
        }
        ariaLabel={label}
        placeholder={placeholder}
        readOnly={!editing || !canEdit}
        disabled={saving}
        footer={
          editing ? (
            <div className="space-y-3">
              {failed && (
                <p role="alert" className="text-sm text-destructive">
                  {t("common:documentEditor.saveFailed")}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={cancel}
                >
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canEdit || saving}
                  onClick={() => void save()}
                >
                  {t(
                    saving
                      ? "common:documentEditor.saving"
                      : "common:documentEditor.save",
                  )}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />
    </section>
  );
}
