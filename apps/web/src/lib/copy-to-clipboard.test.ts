import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { copyToClipboard } from "./copy-to-clipboard";

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: originalClipboard,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document, "execCommand", {
    value: originalExecCommand,
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
});

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("copyToClipboard", () => {
  it("uses the async clipboard API when it is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the clipboard API is missing", async () => {
    // Plain-HTTP self-hosted instances land here: not a secure context.
    setClipboard(undefined);
    const textareaState: {
      value?: string;
      selectionStart?: number;
      selectionEnd?: number;
    } = {};
    const execCommand = vi.fn(function (this: Document, _cmd: string) {
      // Capture textarea state at the moment execCommand is called (before removal)
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textareaState.value = textarea.value;
        textareaState.selectionStart = textarea.selectionStart;
        textareaState.selectionEnd = textarea.selectionEnd;
      }
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
      writable: true,
    });

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // Verify the textarea had the correct text and was selected at copy time
    expect(textareaState.value).toBe("hello");
    expect(textareaState.selectionStart).toBe(0);
    expect(textareaState.selectionEnd).toBe("hello".length);
  });

  it("falls back to execCommand when the clipboard API rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const textareaState: {
      value?: string;
      selectionStart?: number;
      selectionEnd?: number;
    } = {};
    const execCommand = vi.fn(function (this: Document, _cmd: string) {
      // Capture textarea state at the moment execCommand is called
      const textarea = document.querySelector("textarea");
      if (textarea) {
        textareaState.value = textarea.value;
        textareaState.selectionStart = textarea.selectionStart;
        textareaState.selectionEnd = textarea.selectionEnd;
      }
      return true;
    });
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
      writable: true,
    });

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    // Verify the textarea had the correct text and was selected at copy time
    expect(textareaState.value).toBe("hello");
    expect(textareaState.selectionStart).toBe(0);
    expect(textareaState.selectionEnd).toBe("hello".length);
  });

  it("reports failure when neither path works", async () => {
    setClipboard(undefined);
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
      writable: true,
    });

    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });

  it("leaves no scratch node behind", async () => {
    setClipboard(undefined);
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
      writable: true,
    });

    await copyToClipboard("hello");
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  describe("with text that is still loading", () => {
    const originalClipboardItem = globalThis.ClipboardItem;

    class FakeClipboardItem {
      constructor(readonly items: Record<string, Promise<Blob>>) {}
    }

    afterEach(() => {
      Object.defineProperty(globalThis, "ClipboardItem", {
        value: originalClipboardItem,
        configurable: true,
        writable: true,
      });
    });

    function setClipboardItem(value: unknown) {
      Object.defineProperty(globalThis, "ClipboardItem", {
        value,
        configurable: true,
        writable: true,
      });
    }

    it("writes a pending clipboard item during the click", async () => {
      setClipboardItem(FakeClipboardItem);
      const write = vi.fn().mockResolvedValue(undefined);
      setClipboard({ write, writeText: vi.fn() });
      let resolve: (text: string) => void = () => {};
      const text = new Promise<string>((done) => {
        resolve = done;
      });

      const copied = copyToClipboard(text);
      // Called before the text arrives, while the click still counts.
      expect(write).toHaveBeenCalledTimes(1);
      const [[item]] = write.mock.calls[0] as [[FakeClipboardItem]];
      resolve("hello");
      const blob = await item.items["text/plain"];
      expect(blob.type).toBe("text/plain");
      await expect(blob.text()).resolves.toBe("hello");
      await expect(copied).resolves.toBe(true);
    });

    it("copies the loaded text when clipboard items are unsupported", async () => {
      setClipboardItem(undefined);
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });

      await expect(copyToClipboard(Promise.resolve("hello"))).resolves.toBe(
        true,
      );
      expect(writeText).toHaveBeenCalledWith("hello");
    });

    it("falls back to the loaded text when the clipboard refuses the item", async () => {
      setClipboardItem(FakeClipboardItem);
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({
        write: vi.fn().mockRejectedValue(new Error("denied")),
        writeText,
      });

      await expect(copyToClipboard(Promise.resolve("hello"))).resolves.toBe(
        true,
      );
      expect(writeText).toHaveBeenCalledWith("hello");
    });

    it("reports failure when the text fails to load", async () => {
      setClipboardItem(FakeClipboardItem);
      const write = vi.fn(async ([item]: [FakeClipboardItem]) => {
        await item.items["text/plain"];
      });
      const writeText = vi.fn();
      setClipboard({ write, writeText });

      await expect(
        copyToClipboard(Promise.reject(new Error("offline"))),
      ).resolves.toBe(false);
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  it("cleans up the scratch node when execCommand throws", async () => {
    setClipboard(undefined);
    Object.defineProperty(document, "execCommand", {
      value: vi.fn(() => {
        throw new Error("copy operation failed");
      }),
      configurable: true,
      writable: true,
    });

    await expect(copyToClipboard("hello")).resolves.toBe(false);
    // Verify the scratch node was removed despite the exception
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });
});
