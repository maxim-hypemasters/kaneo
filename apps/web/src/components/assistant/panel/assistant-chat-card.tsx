import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAssistantTurn } from "@/hooks/use-assistant-turn";
import { useComposerDraft } from "../conversation/use-composer-draft";
import { AssistantBar } from "./assistant-bar";
import { AssistantChatWindow } from "./assistant-chat-window";
import { readMinimized, writeMinimized } from "./minimized-assistant";
import type { SelectChatOptions } from "./select-chat-options";

type AssistantChatCardProps = {
  workspaceId: string;
  workspaceSlug: string | undefined;
  chatId: string | null;
  model: string | null;
  warning: "key_rejected" | "out_of_credits" | null;
  canManage: boolean;
  onSelectChat: (chatId: string | null, options?: SelectChatOptions) => void;
};

/**
 * The assistant on Home: a bar that opens into the chat, and minimizes back
 * to it. It starts open on a link to a chat, unless it was minimized in this
 * tab. It owns the streaming turn and the composer's text, above everything
 * keyed by chat id and above the open chat, so neither a new chat getting its
 * id (and the URL following) nor minimizing interrupts an answer or loses
 * what is being typed.
 */
export function AssistantChatCard({
  workspaceId,
  workspaceSlug,
  chatId,
  model,
  warning,
  canManage,
  onSelectChat,
}: AssistantChatCardProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const windowId = useId();
  const [expanded, setExpanded] = useState(
    () => chatId !== null && !readMinimized(workspaceId),
  );
  // The open chat, for callbacks that land later. Undefined once Home is
  // gone, so a chat created or deleted meanwhile doesn't navigate back to it.
  const chatIdRef = useRef<string | null | undefined>(chatId);
  useLayoutEffect(() => {
    chatIdRef.current = chatId;
    return () => {
      chatIdRef.current = undefined;
    };
  }, [chatId]);
  const barRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const focusAfterToggle = useRef<"bar" | "composer" | null>(null);

  // Runs once the bar or the chat has replaced the other, so it can take
  // focus before the next key press: typing on the bar carries on in the
  // composer.
  useLayoutEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === "bar") barRef.current?.focus();
    else if (target === "composer") {
      const composer = composerRef.current;
      if (!composer) return;
      composer.focus();
      // Typing goes on after the text already there.
      composer.setSelectionRange(composer.value.length, composer.value.length);
    }
  }, [expanded]);

  const turn = useAssistantTurn({
    workspaceId,
    // Follow the new chat only while it is still the one on screen.
    onChatCreated: (id) => {
      if (chatIdRef.current === null) onSelectChat(id, { replace: true });
    },
  });
  const [text, setText] = useComposerDraft(chatId, turn.chatId);

  const expand = () => {
    writeMinimized(workspaceId, false);
    focusAfterToggle.current = "composer";
    setExpanded(true);
  };
  const minimize = () => {
    writeMinimized(workspaceId, true);
    focusAfterToggle.current = "bar";
    setExpanded(false);
  };
  // Also once the chat was minimized while its deletion was on its way.
  const leaveDeletedChat = (id: string) => {
    if (id === chatIdRef.current) onSelectChat(null, { replace: true });
  };

  // One section in either state, so the assistant stays a landmark with a
  // heading while minimized.
  if (!expanded) {
    return (
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="sr-only">
          {t("workspace:assistant.title")}
        </h2>
        <AssistantBar
          ref={barRef}
          workspaceId={workspaceId}
          chatId={chatId}
          controlsId={windowId}
          answering={turn.isActive}
          onOpen={expand}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <AssistantChatWindow
        id={windowId}
        headingId={headingId}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        chatId={chatId}
        model={model}
        warning={warning}
        canManage={canManage}
        turn={turn}
        text={text}
        onTextChange={setText}
        composerRef={composerRef}
        onSelectChat={onSelectChat}
        onChatDeleted={leaveDeletedChat}
        onMinimize={minimize}
      />
    </section>
  );
}
