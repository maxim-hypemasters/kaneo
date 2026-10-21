import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TaskTypeGlyph } from "@/components/task-chips/task-type-glyph";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ReleaseLinkCandidate } from "@/fetchers/release/get-release-link-candidates";

export function ReleaseLinkCandidateRow({
  candidate,
  checked,
  disabled,
  onCheckedChange,
}: {
  candidate: ReleaseLinkCandidate;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm font-normal hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      {candidate.type === "milestone" ? (
        <Diamond
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      ) : (
        <TaskTypeGlyph
          type={candidate.type}
          decorative
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      )}
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-xs text-muted-foreground"
          title={candidate.featureTitle ?? undefined}
        >
          {candidate.type === "milestone"
            ? candidate.featureTitle
            : candidate.number === null
              ? candidate.id
              : `${candidate.projectSlug}-${candidate.number}`}
        </span>
        <span className="block truncate" title={candidate.title}>
          {candidate.title}
        </span>
        <span
          className="block truncate text-xs text-muted-foreground"
          title={candidate.releaseName ?? undefined}
        >
          {candidate.releaseName ?? t("tasks:releases.link.noRelease")}
        </span>
      </span>
    </Label>
  );
}
