import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildDiffRows, hasChanges } from "./build-diff-rows";
import { DiffLine } from "./diff-line";
import { ShowAllButton } from "./show-all-button";

// Rows shown before Show all.
export const DIFF_CLAMP_ROWS = 40;

type ProposalDiffProps = { before: string; after: string };

// What an edit does to a text, line by line.
export function ProposalDiff({ before, after }: ProposalDiffProps) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => buildDiffRows(before, after), [before, after]);

  if (!hasChanges(rows)) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("workspace:assistant.proposal.diff.noChanges")}
      </p>
    );
  }

  const clamped = rows.length > DIFF_CLAMP_ROWS;
  const shown = clamped && !expanded ? rows.slice(0, DIFF_CLAMP_ROWS) : rows;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <section
        id={id}
        aria-label={t("workspace:assistant.proposal.diff.label")}
        className="w-full min-w-0 overflow-hidden rounded-md border border-border/70 py-1 font-mono text-xs leading-5"
      >
        {shown.map((row) => (
          <DiffLine key={row.key} row={row} />
        ))}
      </section>
      {clamped ? (
        <ShowAllButton
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          controls={id}
        />
      ) : null}
    </div>
  );
}
