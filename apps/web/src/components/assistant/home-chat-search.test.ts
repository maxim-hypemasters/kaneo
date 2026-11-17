import { expect, it } from "vite-plus/test";
import { validateHomeChatSearch } from "./home-chat-search";

it("keeps a chat id", () => {
  expect(validateHomeChatSearch({ chat: "q1w2e3_r4-t5" })).toEqual({
    chat: "q1w2e3_r4-t5",
  });
  expect(validateHomeChatSearch({ chat: "a".repeat(64) })).toEqual({
    chat: "a".repeat(64),
  });
});

it("drops a missing or malformed chat id", () => {
  for (const chat of [
    undefined,
    "",
    "a".repeat(65),
    "../settings",
    "id with space",
    "x?y=1",
    42,
    ["id"],
    null,
  ]) {
    expect(validateHomeChatSearch({ chat })).toEqual({});
  }
});

it("ignores other search params", () => {
  expect(validateHomeChatSearch({ chat: "c1", tab: "documents" })).toEqual({
    chat: "c1",
  });
});
