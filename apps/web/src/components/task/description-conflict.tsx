import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentEditor } from "@/components/editor/document-editor";
import { Button } from "@/components/ui/button";

export function DescriptionConflict({
  latest,
  pending,
  available,
  onRefresh,
  onKeepDraft,
  onUseLatest,
}: {
  latest: string;
  pending: boolean;
  available: boolean;
  onRefresh: () => void;
  onKeepDraft: () => void;
  onUseLatest: () => void;
}) {
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
      <p role="alert">{t("common:documentEditor.conflict")}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || !available}
        aria-expanded={reviewing}
        onClick={() => setReviewing(!reviewing)}
      >
        {t("common:documentEditor.reviewLatest")}
      </Button>
      {!pending && !available && (
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          {t("common:error.tryAgain")}
        </Button>
      )}
      {reviewing && available && (
        <div className="space-y-3">
          <DocumentEditor
            value={latest}
            ariaLabel={t("common:documentEditor.latestVersion")}
            readOnly
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUseLatest}
            >
              {t("common:documentEditor.useLatest")}
            </Button>
            <Button type="button" size="sm" onClick={onKeepDraft}>
              {t("common:documentEditor.keepDraft")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
