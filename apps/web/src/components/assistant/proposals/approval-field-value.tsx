import { ArrowRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClampedMarkdown } from "./clamped-markdown";
import { formatFieldValue } from "./format-field-value";
import { ProposalDiff } from "./proposal-diff";
import type { ProposalField } from "./visible-fields";
import { withKeys } from "./with-keys";

type ApprovalFieldValueProps = {
  field: ProposalField;
  workspaceSlug: string | undefined;
};

/**
 * What a change sets a field to. On an update the previous value shows
 * first, struck through and announced as such, then the new one; changed
 * Markdown shows as a diff. An empty value reads None.
 */
export function ApprovalFieldValue({
  field,
  workspaceSlug,
}: ApprovalFieldValueProps) {
  const { t, i18n } = useTranslation();
  const none = (
    <span className="text-muted-foreground italic">
      {t("workspace:assistant.proposal.none")}
    </span>
  );

  if (field.kind === "markdown") {
    if (field.from !== undefined) {
      return <ProposalDiff before={field.from ?? ""} after={field.value} />;
    }
    return field.value ? (
      <ClampedMarkdown content={field.value} workspaceSlug={workspaceSlug} />
    ) : (
      none
    );
  }

  if (field.kind === "list") {
    const items = field.value.split("\n").filter((item) => item.trim());
    if (items.length === 0) return none;
    return (
      <ul className="list-disc ps-4">
        {withKeys(items, (item) => item).map(({ key, item }) => (
          <li key={key}>{item}</li>
        ))}
      </ul>
    );
  }

  const shown = (value: string | null) =>
    value ? formatFieldValue(field.kind, value, i18n.language) : null;
  const to = shown(field.value);
  if (field.from === undefined || field.from === field.value) {
    return to ?? none;
  }
  const from = shown(field.from);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <del className="text-muted-foreground line-through">
        <span className="sr-only">
          {t("workspace:assistant.proposal.previously")}:{" "}
        </span>
        {from ?? t("workspace:assistant.proposal.none")}
      </del>
      <ArrowRightIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <ins className="no-underline">
        <span className="sr-only">
          {t("workspace:assistant.proposal.now")}:{" "}
        </span>
        {to ?? none}
      </ins>
    </span>
  );
}
