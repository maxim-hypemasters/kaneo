import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { ExistingWorkPicker } from "./existing-work-picker";
import type { FeatureExistingTaskDraft } from "./types";

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(),
  retry: vi.fn(),
  pending: false,
  error: false,
  empty: false,
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: { count?: number; page?: number }) =>
      args?.count !== undefined
        ? `${key} ${args.count}`
        : args?.page !== undefined
          ? `${key} ${args.page}`
          : key,
  }),
}));
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));
vi.mock("@/hooks/queries/task/use-feature-link-candidates", () => ({
  useFeatureLinkCandidates: (...args: unknown[]) => mocks.candidates(...args),
}));

const searchLabel = "tasks:featureComposer.searchTasks";
const taskTitle = "Existing Task";
const bugTitle = "Existing Bug";
const candidate = (page: number) => ({
  id: String(page),
  title: page === 1 ? taskTitle : bugTitle,
  type: page === 1 ? "task" : "bug",
  number: page,
  projectSlug: "WEB",
  releaseId: null,
  releaseName: null,
});

function Harness({
  disabled = false,
  onEscape,
}: {
  disabled?: boolean;
  onEscape?: () => void;
}) {
  const [value, setValue] = useState<FeatureExistingTaskDraft[]>([]);
  return (
    <div
      role="dialog"
      aria-label="Parent dialog"
      onKeyDown={(event) => {
        if (event.key === "Escape") onEscape?.();
      }}
    >
      <ExistingWorkPicker
        projectId="p"
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
      <button type="button">Outside picker</button>
      <output data-testid="selection">{JSON.stringify(value)}</output>
    </div>
  );
}

const search = () => screen.getByRole("searchbox", { name: searchLabel });
const focus = (element: HTMLElement) => act(() => element.focus());
const enabled = () => mocks.candidates.mock.lastCall?.[3];
const selected = () =>
  JSON.parse(screen.getByTestId("selection").textContent ?? "[]");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending = false;
  mocks.error = false;
  mocks.empty = false;
  mocks.candidates.mockImplementation((_project, _query, page) => ({
    // Return cached results even when disabled: the UI must hide them itself.
    data: {
      data: mocks.empty ? [] : [candidate(page)],
      pagination: { totalPages: 2 },
    },
    isPending: mocks.pending,
    isError: mocks.error,
    isFetching: false,
    refetch: mocks.retry,
  }));
});
afterEach(cleanup);

describe("existing Feature work picker activation", () => {
  it("starts with only its heading, selected count and search, hiding cached results", () => {
    render(<Harness />);
    expect(
      screen.getByRole("heading", { name: "tasks:featureComposer.linkTasks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("tasks:milestones.selectedCount 0"),
    ).toBeInTheDocument();
    expect(search()).toBeInTheDocument();
    expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(enabled()).toBe(false);
  });

  it.each(["pending", "error", "empty"] as const)(
    "hides %s feedback until activation and hides it again after dismissal",
    (state) => {
      mocks[state] = true;
      render(<Harness />);
      const text =
        state === "pending"
          ? "tasks:featureComposer.loadingTasks"
          : state === "error"
            ? "tasks:featureComposer.loadTasksError"
            : "tasks:featureComposer.noEligibleTasks";
      expect(screen.queryByText(text)).not.toBeInTheDocument();
      focus(search());
      expect(enabled()).toBe(true);
      expect(screen.getByText(text)).toBeInTheDocument();
      fireEvent.pointerDown(
        screen.getByRole("button", { name: "Outside picker" }),
      );
      expect(screen.queryByText(text)).not.toBeInTheDocument();
      expect(enabled()).toBe(false);
    },
  );

  it("opens through search focus and preserves checkbox selection on close and reopen", () => {
    render(<Harness />);
    focus(search());
    expect(enabled()).toBe(true);
    expect(screen.getByText(taskTitle)).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox");
    focus(checkbox);
    fireEvent.click(checkbox);
    expect(screen.getByText(taskTitle)).toBeInTheDocument();
    expect(checkbox).toBeChecked();
    expect(selected()).toMatchObject([{ id: "1", milestoneKey: null }]);
    focus(screen.getByRole("button", { name: "Outside picker" }));
    expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    expect(
      screen.getByText("tasks:milestones.selectedCount 1"),
    ).toBeInTheDocument();
    expect(enabled()).toBe(false);
    focus(search());
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("keeps pagination inside the open picker and preserves its page when collapsed", () => {
    render(<Harness />);
    fireEvent.click(search());
    const next = screen.getByRole("button", {
      name: "common:pagination.nextPage",
    });
    focus(next);
    fireEvent.click(next);
    expect(screen.getByText(bugTitle)).toBeInTheDocument();
    expect(mocks.candidates.mock.lastCall).toEqual(["p", "", 2, true]);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Outside picker" }),
    );
    expect(screen.queryByText(bugTitle)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    fireEvent.click(search());
    expect(screen.getByText(bugTitle)).toBeInTheDocument();
    expect(mocks.candidates.mock.lastCall).toEqual(["p", "", 2, true]);
  });

  it("preserves search while closed, reopening with the same query", () => {
    render(<Harness />);
    focus(search());
    fireEvent.change(search(), { target: { value: "  baseline  " } });
    expect(mocks.candidates.mock.lastCall).toEqual(["p", "baseline", 1, true]);
    focus(screen.getByRole("button", { name: "Outside picker" }));
    expect(search()).toHaveValue("  baseline  ");
    expect(mocks.candidates.mock.lastCall).toEqual(["p", "baseline", 1, false]);
    focus(search());
    expect(mocks.candidates.mock.lastCall).toEqual(["p", "baseline", 1, true]);
  });

  it("retains the panel while using Retry or interacting with its results", () => {
    mocks.error = true;
    render(<Harness />);
    focus(search());
    const retry = screen.getByRole("button", { name: "common:error.tryAgain" });
    focus(retry);
    fireEvent.pointerDown(retry);
    fireEvent.click(retry);
    expect(mocks.retry).toHaveBeenCalledOnce();
    expect(retry).toBeInTheDocument();
    expect(enabled()).toBe(true);
  });

  it("Escape closes results and restores search focus without reopening or reaching the modal", () => {
    const onEscape = vi.fn();
    render(<Harness onEscape={onEscape} />);
    focus(search());
    const checkbox = screen.getByRole("checkbox");
    focus(checkbox);
    fireEvent.keyDown(checkbox, { key: "Escape" });
    expect(search()).toHaveFocus();
    expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    expect(enabled()).toBe(false);
    expect(onEscape).not.toHaveBeenCalled();
    // Search is already focused; an explicit second activation must reopen it.
    fireEvent.click(search());
    expect(screen.getByText(taskTitle)).toBeInTheDocument();
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    focus(screen.getByRole("button", { name: "Outside picker" }));
    focus(search());
    expect(screen.getByText(taskTitle)).toBeInTheDocument();
  });

  it("does not activate or read candidates while submission disables the picker", () => {
    render(<Harness disabled />);
    expect(search()).toBeDisabled();
    fireEvent.click(search());
    fireEvent.focus(search());
    expect(screen.queryByText(taskTitle)).not.toBeInTheDocument();
    expect(enabled()).toBe(false);
  });
});
