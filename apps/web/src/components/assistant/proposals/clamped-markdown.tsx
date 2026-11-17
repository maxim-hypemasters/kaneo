import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { AssistantMarkdown } from "../conversation/assistant-markdown";
import { isLongText } from "./is-long-text";
import { ShowAllButton } from "./show-all-button";

type ClampedMarkdownProps = {
  content: string;
  workspaceSlug: string | undefined;
};

// Markdown a change would write, folded to a few lines when it is long.
export function ClampedMarkdown({
  content,
  workspaceSlug,
}: ClampedMarkdownProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const long = isLongText(content);
  const folded = long && !expanded;

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div
        id={id}
        className={cn(
          "w-full min-w-0",
          folded && "max-h-40 overflow-hidden mask-b-from-60%",
        )}
      >
        <AssistantMarkdown content={content} workspaceSlug={workspaceSlug} />
      </div>
      {long ? (
        <ShowAllButton
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          controls={id}
        />
      ) : null}
    </div>
  );
}
