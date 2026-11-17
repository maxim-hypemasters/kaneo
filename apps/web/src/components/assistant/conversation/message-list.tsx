import { useTranslation } from "react-i18next";
import { ApprovalCard } from "../proposals/approval-card";
import { AnswerMessage } from "./answer-message";
import type { ConversationItem } from "./build-conversation-items";
import { ThinkingIndicator } from "./thinking-indicator";
import { ToolSteps } from "./tool-steps";
import { UserMessage } from "./user-message";

type MessageListProps = {
  items: ConversationItem[];
  /** A turn is streaming into this chat. */
  live: boolean;
  /** Answer text streamed since the last saved message. */
  draft: string;
  /** A new chat's first message, before the chat exists. */
  pendingUserText: string | null;
  showThinking: boolean;
  hasOlder: boolean;
  workspaceSlug: string | undefined;
  /** Whether proposed changes can be decided now. */
  decisionsDisabled: boolean;
  /** Decisions on their way, by message id: true approves, false rejects. */
  deciding: ReadonlyMap<string, boolean>;
  /** Proposals decided in this session, whose failures are announced. */
  justDecided: ReadonlySet<string>;
  onDecide: (messageId: string, approve: boolean) => void;
};

export function MessageList({
  items,
  live,
  draft,
  pendingUserText,
  showThinking,
  hasOlder,
  workspaceSlug,
  decisionsDisabled,
  deciding,
  justDecided,
  onDecide,
}: MessageListProps) {
  const { t } = useTranslation();
  // Steps after the latest question belong to the answer being written.
  let turnStart = -1;
  items.forEach((item, index) => {
    if (item.kind === "user") turnStart = index;
  });

  return (
    <>
      {hasOlder ? (
        <p className="text-center text-muted-foreground text-xs">
          {t("workspace:assistant.conversation.hasOlder")}
        </p>
      ) : null}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t("workspace:assistant.conversation.label")}
        className="flex flex-col gap-4"
      >
        {items.map((item, index) => {
          switch (item.kind) {
            case "user":
              return (
                <UserMessage key={item.id} content={item.message.content} />
              );
            case "answer":
              return (
                <AnswerMessage
                  key={item.id}
                  content={item.message.content}
                  interrupted={item.message.status === "interrupted"}
                  workspaceSlug={workspaceSlug}
                />
              );
            case "steps":
              return (
                <ToolSteps
                  key={item.id}
                  steps={item.steps}
                  live={live && index > turnStart}
                />
              );
            case "proposal":
              return (
                <ApprovalCard
                  key={item.id}
                  message={item.message}
                  workspaceSlug={workspaceSlug}
                  disabled={decisionsDisabled}
                  deciding={deciding.get(item.id) ?? null}
                  justDecided={justDecided.has(item.id)}
                  onDecide={onDecide}
                />
              );
          }
        })}
        {pendingUserText ? <UserMessage content={pendingUserText} /> : null}
        {draft ? (
          <AnswerMessage
            content={draft}
            workspaceSlug={workspaceSlug}
            streaming
          />
        ) : null}
        {showThinking ? <ThinkingIndicator /> : null}
      </div>
    </>
  );
}
