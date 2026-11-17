export type HomeChatSearch = {
  // The open assistant chat; without it Home shows a new, empty chat.
  chat?: string;
};

const CHAT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function validateHomeChatSearch(
  search: Record<string, unknown>,
): HomeChatSearch {
  const chat = search.chat;
  return typeof chat === "string" && CHAT_ID.test(chat) ? { chat } : {};
}
