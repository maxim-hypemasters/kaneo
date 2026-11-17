import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { ApprovalFieldValue } from "./approval-field-value";
import { fieldLabelKey } from "./proposal-copy";
import type { ProposalField } from "./visible-fields";

type ApprovalFieldsProps = {
  fields: ProposalField[];
  workspaceSlug: string | undefined;
};

// What a change sets, one labelled value per argument.
export function ApprovalFields({ fields, workspaceSlug }: ApprovalFieldsProps) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;

  return (
    <dl className="flex flex-col gap-2 text-sm">
      {fields.map((field) => {
        // Text blocks and lists take the card's whole width.
        const block = field.kind === "markdown" || field.kind === "list";
        return (
          <div
            key={field.key}
            className={cn(
              "flex min-w-0 flex-col gap-x-3 gap-y-0.5",
              !block && "sm:flex-row sm:items-baseline",
            )}
          >
            <dt className="shrink-0 text-muted-foreground text-xs sm:w-28">
              {t(fieldLabelKey(field.key))}
            </dt>
            <dd className="min-w-0 flex-1 break-words text-foreground">
              <ApprovalFieldValue field={field} workspaceSlug={workspaceSlug} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
