import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { useComposerDraft } from "./use-composer-draft";

function renderDraft(chatId: string | null, turnChatId: string | null) {
  return renderHook(
    ({ chatId, turnChatId }) => useComposerDraft(chatId, turnChatId),
    { initialProps: { chatId, turnChatId } },
  );
}

describe("useComposerDraft", () => {
  it("keeps the text while a new chat gets its id", () => {
    const view = renderDraft(null, null);
    act(() => view.result.current[1]("And next week?"));

    view.rerender({ chatId: "c1", turnChatId: "c1" });
    expect(view.result.current[0]).toBe("And next week?");
  });

  it("starts empty in another chat", () => {
    const view = renderDraft("c1", null);
    act(() => view.result.current[1]("Half a thought"));

    view.rerender({ chatId: "c2", turnChatId: null });
    expect(view.result.current[0]).toBe("");

    act(() => view.result.current[1]("Another"));
    view.rerender({ chatId: null, turnChatId: null });
    expect(view.result.current[0]).toBe("");
  });
});
