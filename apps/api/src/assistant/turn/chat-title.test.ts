import { describe, expect, it } from "vite-plus/test";
import { CHAT_TITLE_MAX_CHARS, chatTitleFromMessage } from "./chat-title";

describe("chatTitleFromMessage", () => {
  it("keeps a short message as it is", () => {
    expect(chatTitleFromMessage("What is due this week?")).toBe(
      "What is due this week?",
    );
  });

  it("joins lines and collapses spacing into one line", () => {
    expect(
      chatTitleFromMessage(
        "  Summarize\r\n\r\nthe   Onboarding\tfeature\u0007 ",
      ),
    ).toBe("Summarize the Onboarding feature");
  });

  it("keeps a message of exactly the limit", () => {
    const content = "a".repeat(CHAT_TITLE_MAX_CHARS);
    expect(chatTitleFromMessage(content)).toBe(content);
  });

  it("cuts a long message to the limit with an ellipsis", () => {
    const title = chatTitleFromMessage(`${"word ".repeat(40)}end`);
    expect(title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX_CHARS);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/\s…$/);
  });

  it("never splits a character made of two code units", () => {
    const title = chatTitleFromMessage("😀".repeat(60));
    expect(title.length).toBeLessThanOrEqual(CHAT_TITLE_MAX_CHARS);
    expect(title).toBe(`${"😀".repeat(39)}…`);
  });

  it("returns an empty title for blank content", () => {
    expect(chatTitleFromMessage(" \n\t ")).toBe("");
  });
});
