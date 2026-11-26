import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AgentRunEvent } from "@/fetchers/agent/get-task-agent";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

const KIND_CLASSES: Record<AgentRunEvent["kind"], string> = {
  step: "text-foreground",
  tool: "font-mono text-muted-foreground",
  log: "text-muted-foreground",
};

type AgentRunLogProps = {
  events: AgentRunEvent[];
};

// Newest at the bottom, kept in view as progress arrives. Not a live region:
// tool calls and log lines would interrupt whatever people are doing, so
// AgentRunStatus announces only the run's state and steps.
export function AgentRunLog({ events }: AgentRunLogProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLOListElement>(null);
  const lastId = events.at(-1)?.id;

  useEffect(() => {
    const list = listRef.current;
    if (list && lastId !== undefined) list.scrollTop = list.scrollHeight;
  }, [lastId]);

  if (events.length === 0) return null;

  return (
    <ol
      ref={listRef}
      aria-label={t("tasks:aiAgent.run.logLabel")}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable region must be focusable for keyboard scrolling in every browser.
      tabIndex={0}
      className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {events.map((event) => (
        <li
          key={event.id}
          title={formatDateTime(event.createdAt)}
          className={cn("break-words", KIND_CLASSES[event.kind])}
        >
          {event.message}
        </li>
      ))}
    </ol>
  );
}
