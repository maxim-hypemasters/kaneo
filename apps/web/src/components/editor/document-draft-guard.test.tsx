import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  DocumentDraftGuardProvider,
  requestDocumentDraftLeave,
  useDocumentDraftGuard,
  useDocumentDraftNavigation,
} from "./document-draft-guard";

const mocks = vi.hoisted(() => ({
  blocker: null as null | {
    shouldBlockFn: () => Promise<boolean>;
    enableBeforeUnload: boolean;
  },
  discard: vi.fn(),
  leave: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: typeof mocks.blocker) => {
    mocks.blocker = options;
  },
}));
vi.mock("./document-draft-discard-dialog", () => ({
  DocumentDraftDiscardDialog: ({
    open,
    onKeepEditing,
    onDiscard,
  }: {
    open: boolean;
    onKeepEditing: () => void;
    onDiscard: () => void;
  }) =>
    open ? (
      <div role="alertdialog">
        <button type="button" onClick={onKeepEditing}>
          Keep editing
        </button>
        <button type="button" onClick={onDiscard}>
          Discard
        </button>
      </div>
    ) : null,
}));

function Draft({ dirty = false, saving = false }) {
  useDocumentDraftGuard({ dirty, saving, onDiscard: mocks.discard });
  const requestLeave = useDocumentDraftNavigation();
  return (
    <button type="button" onClick={() => void requestLeave(mocks.leave)}>
      Close view
    </button>
  );
}

beforeEach(() => {
  mocks.blocker = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("document draft navigation", () => {
  it("allows navigation and local closing without a changed draft", async () => {
    render(
      <DocumentDraftGuardProvider>
        <Draft />
      </DocumentDraftGuardProvider>,
    );
    expect(mocks.blocker?.enableBeforeUnload).toBe(false);
    expect(await mocks.blocker?.shouldBlockFn()).toBe(false);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Close view" })),
    );
    expect(mocks.leave).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("retains drafts when local dismissal is cancelled and discards only after confirmation", async () => {
    render(
      <DocumentDraftGuardProvider>
        <Draft dirty />
      </DocumentDraftGuardProvider>,
    );
    expect(mocks.blocker?.enableBeforeUnload).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close view" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.leave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close view" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Discard" })),
    );
    expect(mocks.discard).toHaveBeenCalledOnce();
    expect(mocks.leave).toHaveBeenCalledOnce();
    expect(mocks.blocker?.enableBeforeUnload).toBe(false);
  });

  it("waits for confirmation before a route change and does not prompt twice after accepting", async () => {
    render(
      <DocumentDraftGuardProvider>
        <Draft dirty />
      </DocumentDraftGuardProvider>,
    );
    let navigation: Promise<boolean> | undefined;
    act(() => {
      navigation = mocks.blocker?.shouldBlockFn();
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Discard" })),
    );
    expect(await navigation).toBe(false);
    expect(await mocks.blocker?.shouldBlockFn()).toBe(false);
    expect(mocks.discard).toHaveBeenCalledOnce();
  });

  it("blocks closing and routing during writes without discarding the draft", async () => {
    render(
      <DocumentDraftGuardProvider>
        <Draft dirty saving />
      </DocumentDraftGuardProvider>,
    );
    expect(mocks.blocker?.enableBeforeUnload).toBe(true);
    expect(await mocks.blocker?.shouldBlockFn()).toBe(true);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Close view" })),
    );
    expect(mocks.leave).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("guards sign out outside the document tree and unregisters after unmounting", async () => {
    const { unmount } = render(
      <DocumentDraftGuardProvider>
        <Draft dirty />
      </DocumentDraftGuardProvider>,
    );
    let signOut: Promise<boolean> | undefined;
    act(() => {
      signOut = requestDocumentDraftLeave();
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Keep editing" })),
    );
    expect(await signOut).toBe(false);
    unmount();
    expect(await requestDocumentDraftLeave()).toBe(true);
  });

  it("cancels unresolved navigation when the containing view is removed", async () => {
    const { unmount } = render(
      <DocumentDraftGuardProvider>
        <Draft dirty />
      </DocumentDraftGuardProvider>,
    );
    let navigation: Promise<boolean> | undefined;
    act(() => {
      navigation = mocks.blocker?.shouldBlockFn();
    });
    unmount();
    expect(await navigation).toBe(true);
    expect(mocks.discard).not.toHaveBeenCalled();
  });
});
