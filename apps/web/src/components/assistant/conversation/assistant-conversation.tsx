import {
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAssistantChat } from "@/hooks/queries/assistant/use-assistant-chat";
import type { AssistantTurn } from "@/hooks/use-assistant-turn";
import { HttpError } from "@/lib/http-error";
import { ApprovalBatchBar } from "../proposals/approval-batch-bar";
import { useFocusAfterDecision } from "../proposals/use-focus-after-decision";
import { useProposalDecisions } from "../proposals/use-proposal-decisions";
import { buildConversationItems } from "./build-conversation-items";
import { Composer } from "./composer";
import { ContinuePrompt } from "./continue-prompt";
import { ConversationScroller } from "./conversation-scroller";
import { EmptyChat } from "./empty-chat";
import { MessageList } from "./message-list";
import { StreamingStatus, type StreamingStatusValue } from "./streaming-status";
import { TurnError } from "./turn-error";
import { useRefetchWhileBusy } from "./use-refetch-while-busy";

type AssistantConversationProps = {
  workspaceId: string;
  workspaceSlug: string | undefined;
  /** The open chat, or null for a new one. */
  chatId: string | null;
  model: string | null;
  turn: AssistantTurn;
  onNewChat: () => void;
  /** The composer's textarea, for a parent that moves focus to it. */
  composerRef?: RefObject<HTMLTextAreaElement | null>;
};

export function AssistantConversation({
  workspaceId,
  workspaceSlug,
  chatId,
  model,
  turn,
  onNewChat,
  composerRef,
}: AssistantConversationProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [pinKey, setPinKey] = useState(0);
  const ownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = composerRef ?? ownTextareaRef;
  const rootRef = useRef<HTMLDivElement | null>(null);

  // A new chat that just got its id keeps what is being typed; switching to
  // another chat starts with an empty composer.
  const [shownChatId, setShownChatId] = useState(chatId);
  if (shownChatId !== chatId) {
    setShownChatId(chatId);
    if (!(shownChatId === null && chatId === turn.chatId)) setText("");
  }

  const streamingHere =
    turn.isActive &&
    (turn.chatId === chatId || (chatId === null && turn.kind === "start"));
  const decisions = useProposalDecisions(workspaceId, chatId, {
    // Nothing waits any more: the answer goes on with what was decided.
    onResumable: (id) => {
      if (id === chatId) setPinKey((key) => key + 1);
      void turn.continueTurn(id);
    },
  });
  const decidingHere = decisions.decidingHere;
  // A refetch while deciding would see the chat held by the decision.
  const chatQuery = useAssistantChat(workspaceId, chatId, {
    paused: streamingHere || decidingHere,
  });
  const detail = chatId ? chatQuery.data : undefined;
  const messages = detail?.messages;
  const items = useMemo(
    () => buildConversationItems(messages ?? [], { running: streamingHere }),
    [messages, streamingHere],
  );

  const hasRunningStep = items.some(
    (item) =>
      item.kind === "steps" &&
      item.steps.some((step) => step.status === "running"),
  );
  const pendingUserText =
    chatId === null && streamingHere ? turn.pendingUserText : null;
  const errorHere =
    !turn.isActive && turn.error?.chatId === chatId ? turn.error : null;
  // Another tab or device is answering here; its rows arrive on refetch.
  // `=== true` also covers a response without the flag.
  const busyElsewhere =
    !streamingHere && !decidingHere && detail?.busy === true;
  useRefetchWhileBusy(busyElsewhere, chatQuery.refetch);
  useFocusAfterDecision(decidingHere, rootRef, textareaRef);

  const pendingIds = items.flatMap((item) =>
    item.kind === "proposal" && item.message.approval === "pending"
      ? [item.id]
      : [],
  );
  // One decision at a time; a chat answering here or elsewhere refuses
  // decisions until it ends.
  const decisionsDisabled =
    decisions.anyDeciding || streamingHere || busyElsewhere;
  const decide = (approve: boolean, messageIds: readonly string[]) => {
    if (!decisionsDisabled) decisions.decide(approve, messageIds);
  };
  const lastMessage = messages?.at(-1);
  const canResume =
    !turn.isActive &&
    !errorHere &&
    !busyElsewhere &&
    detail !== undefined &&
    detail.pendingCount === 0 &&
    (detail.resumable ||
      (lastMessage?.role === "assistant" &&
        lastMessage.status === "interrupted"));

  let status: StreamingStatusValue | null = null;
  if (streamingHere) status = "answering";
  else if (turn.kind !== null && turn.chatId === chatId) {
    status =
      turn.stoppedChatId === chatId ? "stopped" : errorHere ? "failed" : "done";
  }

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    const typed = text;
    setText("");
    setPinKey((key) => key + 1);
    const accepted = chatId
      ? await turn.send(chatId, message)
      : await turn.start(message);
    // Refused before anything streamed: the message was not saved.
    if (!accepted) setText((current) => current || typed);
  };
  const resume = () => {
    if (!chatId) return;
    setPinKey((key) => key + 1);
    void turn.continueTurn(chatId);
  };
  const insertSuggestion = (suggestion: string) => {
    setText(suggestion);
    textareaRef.current?.focus();
  };

  let body: ReactNode;
  if (chatId && !detail) {
    const notFound =
      chatQuery.error instanceof HttpError && chatQuery.error.status === 404;
    body = chatQuery.isError ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p role="alert" className="text-muted-foreground text-sm">
          {notFound
            ? t("workspace:assistant.conversation.notFound")
            : t("workspace:assistant.conversation.loadError")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={notFound ? onNewChat : () => void chatQuery.refetch()}
        >
          {notFound
            ? t("workspace:assistant.newChat")
            : t("workspace:assistant.conversation.tryAgain")}
        </Button>
      </div>
    ) : (
      <p
        role="status"
        className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
      >
        {t("workspace:assistant.conversation.loading")}
      </p>
    );
  } else if (!chatId && !streamingHere) {
    body = <EmptyChat model={model} onSuggestion={insertSuggestion} />;
  } else {
    body = (
      <ConversationScroller key={chatId ?? "new"} pinKey={pinKey}>
        <MessageList
          items={items}
          live={streamingHere}
          draft={streamingHere ? turn.draft : ""}
          pendingUserText={pendingUserText}
          showThinking={streamingHere && !turn.draft && !hasRunningStep}
          hasOlder={detail?.hasOlder ?? false}
          workspaceSlug={workspaceSlug}
          decisionsDisabled={decisionsDisabled}
          deciding={decisions.deciding}
          justDecided={decisions.justDecided}
          onDecide={(messageId, approve) => decide(approve, [messageId])}
        />
        {!turn.isActive && turn.truncatedChatId === chatId && chatId ? (
          <p className="text-muted-foreground text-xs">
            {t("workspace:assistant.conversation.truncated")}
          </p>
        ) : null}
      </ConversationScroller>
    );
  }

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      {body}
      <StreamingStatus status={status} />
      {pendingIds.length > 1 ? (
        <div className="shrink-0 px-4 pb-2">
          <ApprovalBatchBar
            count={pendingIds.length}
            disabled={decisionsDisabled}
            deciding={decisions.batchDecision}
            onDecideAll={(approve) => decide(approve, pendingIds)}
          />
        </div>
      ) : null}
      {errorHere || busyElsewhere || canResume ? (
        <div className="shrink-0 px-4 pb-2">
          {errorHere ? (
            <TurnError
              error={errorHere}
              onRetry={errorHere.canContinue && chatId ? resume : undefined}
              onDismiss={turn.dismissError}
            />
          ) : busyElsewhere ? (
            <p className="text-muted-foreground text-xs">
              {t("workspace:assistant.conversation.busyElsewhere")}
            </p>
          ) : (
            <ContinuePrompt
              stopped={turn.stoppedChatId === chatId}
              onContinue={resume}
            />
          )}
        </div>
      ) : null}
      <Composer
        value={text}
        onChange={setText}
        onSend={() => void send()}
        onStop={turn.stop}
        streaming={streamingHere}
        // An open chat must load first: the turn's rows can only be added
        // to a transcript the browser already has. A chat answering
        // elsewhere refuses new messages until it ends.
        canSend={
          !turn.isActive &&
          (chatId === null || detail !== undefined) &&
          !busyElsewhere &&
          !decidingHere
        }
        pendingCount={streamingHere ? 0 : (detail?.pendingCount ?? 0)}
        textareaRef={textareaRef}
      />
    </div>
  );
}
