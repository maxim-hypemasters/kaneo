import { useState } from "react";

/**
 * The composer's unsent text. It lives above the conversation, so it stays
 * while the chat is minimized. A new chat that just got its id keeps what is
 * being typed; switching to another chat starts with an empty composer.
 */
export function useComposerDraft(
  chatId: string | null,
  turnChatId: string | null,
) {
  const [text, setText] = useState("");
  const [shownChatId, setShownChatId] = useState(chatId);
  if (shownChatId !== chatId) {
    setShownChatId(chatId);
    if (!(shownChatId === null && chatId === turnChatId)) setText("");
  }
  return [text, setText] as const;
}
