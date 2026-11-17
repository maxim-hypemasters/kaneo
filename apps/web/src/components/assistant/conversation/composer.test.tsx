import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Composer, MAX_MESSAGE_CHARS } from "./composer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && "used" in options ? `${options.used}/${options.max}` : key,
    i18n: { language: "en-US" },
  }),
}));

afterEach(cleanup);

function renderComposer(props: Partial<ComponentProps<typeof Composer>> = {}) {
  const handlers = {
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
  };
  const textareaRef = createRef<HTMLTextAreaElement>();
  const element = (next: Partial<ComponentProps<typeof Composer>>) => (
    <Composer
      value="What is due?"
      streaming={false}
      canSend
      textareaRef={textareaRef}
      {...handlers}
      {...props}
      {...next}
    />
  );
  const { rerender } = render(element({}));
  return {
    ...handlers,
    rerender: (next: Partial<ComponentProps<typeof Composer>>) =>
      rerender(element(next)),
    textarea: screen.getByRole("textbox", {
      name: "workspace:assistant.composer.label",
    }),
  };
}

describe("Composer", () => {
  it("sends on Enter and on the Send button", () => {
    const { onSend, textarea } = renderComposer();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "workspace:assistant.composer.send" }),
    );
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("keeps Shift+Enter and IME composition for the text", () => {
    const { onSend, textarea } = renderComposer();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });
    fireEvent.keyDown(textarea, { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends nothing blank, too long, or while another answer runs", () => {
    for (const props of [
      { value: "   \n" },
      { value: "x".repeat(MAX_MESSAGE_CHARS + 1) },
      { canSend: false },
    ]) {
      const { onSend, textarea } = renderComposer(props);
      fireEvent.keyDown(textarea, { key: "Enter" });
      const button = screen.getByRole("button", {
        name: "workspace:assistant.composer.send",
      });
      // Unusable, yet still focusable.
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(onSend).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("turns Send into Stop while streaming, and Escape stops", () => {
    const { onStop, onSend, textarea } = renderComposer({ streaming: true });
    expect(
      screen.queryByRole("button", {
        name: "workspace:assistant.composer.send",
      }),
    ).toBeNull();

    fireEvent.keyDown(textarea, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", { name: "workspace:assistant.composer.stop" }),
    );
    expect(onStop).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps focus on the button as it turns into Stop and back", () => {
    const { onStop, rerender } = renderComposer();
    const send = screen.getByRole("button", {
      name: "workspace:assistant.composer.send",
    });
    send.focus();

    rerender({ streaming: true });
    const stop = screen.getByRole("button", {
      name: "workspace:assistant.composer.stop",
    });
    expect(stop).toBe(send);
    expect(stop).toHaveFocus();
    fireEvent.keyDown(stop, { key: "Escape" });
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender({ streaming: false, value: "" });
    expect(send).toHaveFocus();
    expect(send).toHaveAccessibleName("workspace:assistant.composer.send");
  });

  it("shows a counter near the limit and marks text over it", () => {
    const { textarea } = renderComposer({ value: "x".repeat(6999) });
    expect(screen.queryByText(/\/8,000/)).toBeNull();
    cleanup();

    renderComposer({ value: "x".repeat(7500) });
    expect(screen.getByText("7,500/8,000")).toBeInTheDocument();
    cleanup();

    const over = renderComposer({ value: "x".repeat(8001) });
    expect(over.textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).not.toBeInTheDocument();
  });

  it("reports typing", () => {
    const { onChange, textarea } = renderComposer({ value: "" });
    fireEvent.change(textarea, { target: { value: "Hi" } });
    expect(onChange).toHaveBeenCalledWith("Hi");
  });
});
