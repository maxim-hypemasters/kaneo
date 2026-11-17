import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { BulkOptionPopover } from "./bulk-option-popover";
import { useBulkRequestStore } from "./bulk-request-store";
import type { BulkActions } from "./use-bulk-actions";
import { useBulkOptions } from "./use-bulk-options";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  useBulkRequestStore.setState({ request: null, temporaryTaskId: null });
});

function renderPopover(onDismiss = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <BulkOptionPopover
      icon={null}
      label="Status"
      placeholder="Change status"
      options={[{ value: "done", label: "Done" }]}
      onSelect={vi.fn()}
      picker="status"
      onDismiss={onDismiss}
      onOpenChange={onOpenChange}
    />,
  );
  return onDismiss;
}

describe("BulkOptionPopover", () => {
  it("opens when a keyboard request names its picker", async () => {
    renderPopover();

    act(() => useBulkRequestStore.getState().send("priority", null));
    expect(screen.queryByPlaceholderText("Change status")).toBeNull();

    act(() => useBulkRequestStore.getState().send("status", "task-1"));

    expect(await screen.findByPlaceholderText("Change status")).toBeTruthy();
    expect(useBulkRequestStore.getState().request).toBeNull();
  });

  it("reports a dismissal so a temporary selection can be dropped", async () => {
    const onDismiss = renderPopover();
    act(() => useBulkRequestStore.getState().send("status", "task-1"));
    const input = await screen.findByPlaceholderText("Change status");

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it("tells its owner when it opens or closes, also by shortcut", async () => {
    const onOpenChange = vi.fn();
    renderPopover(vi.fn(), onOpenChange);

    act(() => useBulkRequestStore.getState().send("status", "task-1"));
    await screen.findByPlaceholderText("Change status");
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("option", { name: /Done/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
  });

  it("names an away assignee as away, once", async () => {
    const actions = {
      columns: [],
      labels: [],
      members: [{ id: "user-1", name: "Ada", image: null }],
    } as unknown as BulkActions;
    const { result } = renderHook(() =>
      useBulkOptions(actions, new Map([["user-1", "Away until Nov 20"]])),
    );
    render(
      <BulkOptionPopover
        icon={null}
        label="Assignee"
        placeholder="Assign to"
        options={result.current.memberOptions}
        onSelect={vi.fn()}
        picker="assignee"
      />,
    );

    act(() => useBulkRequestStore.getState().send("assignee", "task-1"));

    const option = await screen.findByRole("option", {
      name: (name) =>
        name.includes("Ada") && name.split("Away until Nov 20").length === 2,
    });
    expect(option).toBeTruthy();
  });
});
