import { CircleStopIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AssistantMarkdown } from "./assistant-markdown";

type AnswerMessageProps = {
  content: string;
  workspaceSlug: string | undefined;
  // Stopped by the user, or cut off by an error.
  interrupted?: boolean;
  // Still streaming: assistive tech waits for the finished text.
  streaming?: boolean;
};

export function AnswerMessage({
  content,
  workspaceSlug,
  interrupted = false,
  streaming = false,
}: AnswerMessageProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1" aria-busy={streaming || undefined}>
      <span className="sr-only">
        {t("workspace:assistant.conversation.assistant")}:
      </span>
      <AssistantMarkdown content={content} workspaceSlug={workspaceSlug} />
      {interrupted ? (
        <p className="flex items-center gap-1 text-muted-foreground text-xs">
          <CircleStopIcon aria-hidden="true" className="size-3" />
          {t("workspace:assistant.conversation.stopped")}
        </p>
      ) : null}
    </div>
  );
}
