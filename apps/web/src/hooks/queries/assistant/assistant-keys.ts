// One key factory for every assistant query, so mutations and streams can
// invalidate exactly what they changed.
export const assistantKeys = {
  all: ["assistant"] as const,
  status: (workspaceId: string) =>
    ["assistant", "status", workspaceId] as const,
  settings: (workspaceId: string) =>
    ["assistant", "settings", workspaceId] as const,
  usage: (workspaceId: string) => ["assistant", "usage", workspaceId] as const,
  models: (workspaceId: string) =>
    ["assistant", "models", workspaceId] as const,
  chats: (workspaceId: string) => ["assistant", "chats", workspaceId] as const,
  chat: (workspaceId: string, chatId: string) =>
    ["assistant", "chat", workspaceId, chatId] as const,
};
