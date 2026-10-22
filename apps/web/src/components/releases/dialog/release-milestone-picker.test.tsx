import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReleaseMilestoneCandidate } from "@/fetchers/release/get-release-milestone-candidates";
import { ReleaseMilestonePicker } from "./release-milestone-picker";

const m = vi.hoisted(() => ({
  hook: vi.fn(),
  refetch: vi.fn(),
  pending: false,
  error: false,
  empty: false,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      values?: { count?: number; title?: string; page?: number },
    ) =>
      `${key}${values?.title ? ` ${values.title}` : values?.count !== undefined ? ` ${values.count}` : values?.page ? ` ${values.page}` : ""}`,
  }),
}));
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("@/hooks/queries/release/use-release-milestone-candidates", () => ({
  useReleaseMilestoneCandidates: (...args: unknown[]) => m.hook(...args),
}));

const alpha: ReleaseMilestoneCandidate = {
  id: "a",
  title: "Alpha",
  featureId: "f-a",
  featureTitle: "Feature A",
};
const beta: ReleaseMilestoneCandidate = {
  id: "b",
  title: "Beta",
  featureId: "f-b",
  featureTitle: "Feature B",
};
const gamma: ReleaseMilestoneCandidate = {
  id: "g",
  title: "Gamma",
  featureId: "f-g",
  featureTitle: "Feature C",
};

function Harness({
  initial = [],
  disabled = false,
  conflict = false,
  conflictVersion = 0,
  onOutsideClick,
}: {
  initial?: ReleaseMilestoneCandidate[];
  disabled?: boolean;
  conflict?: boolean;
  conflictVersion?: number;
  onOutsideClick?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ReleaseMilestonePicker
        projectId="p"
        value={value}
        onChange={setValue}
        disabled={disabled}
        conflict={conflict}
        conflictVersion={conflictVersion}
      />
      <button type="button" onClick={onOutsideClick}>
        Outside
      </button>
    </>
  );
}

const search = () =>
  screen.getByRole("searchbox", {
    name: "tasks:releases.milestonePicker.search",
  });
const open = () => fireEvent.focus(search());
const checkbox = (title: string) =>
  screen.getByRole("checkbox", { name: new RegExp(title) });

beforeEach(() => {
  m.pending = false;
  m.error = false;
  m.empty = false;
  m.refetch.mockReset();
  m.hook.mockReset();
  m.hook.mockImplementation(
    (_project: string, query: string, page: number) => ({
      data: {
        data: m.empty ? [] : query ? [gamma] : page === 1 ? [alpha] : [beta],
        pagination: {
          total: m.empty ? 0 : 3,
          page,
          limit: 50,
          totalPages: m.empty ? 0 : 3,
        },
      },
      isPending: m.pending,
      isError: m.error,
      isFetching: false,
      refetch: m.refetch,
    }),
  );
});
afterEach(cleanup);

describe("ReleaseMilestonePicker", () => {
  it("keeps cached candidates and status hidden until search activation", () => {
    m.pending = true;
    m.error = true;
    render(<Harness />);
    expect(m.hook).toHaveBeenLastCalledWith("p", "", 1, false);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    open();
    expect(m.hook).toHaveBeenLastCalledWith("p", "", 1, true);
    expect(
      screen.getByText("tasks:releases.milestonePicker.loading"),
    ).toBeVisible();
  });

  it("preserves selections through searches, pages, collapse and reopening", () => {
    render(<Harness />);
    open();
    fireEvent.click(checkbox("Alpha"));
    fireEvent.click(
      screen.getByRole("button", { name: "common:pagination.nextPage" }),
    );
    expect(checkbox("Beta")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Alpha",
      }),
    ).toBeVisible();
    fireEvent.change(search(), { target: { value: "Gamma" } });
    expect(m.hook).toHaveBeenLastCalledWith("p", "Gamma", 1, true);
    fireEvent.click(checkbox("Gamma"));
    expect(
      screen.getByText("tasks:releases.milestonePicker.selectedCount 2"),
    ).toBeVisible();
    fireEvent.keyDown(search(), { key: "Escape" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(search()).toHaveFocus();
    expect(search()).toHaveValue("Gamma");
    fireEvent.click(search());
    expect(checkbox("Gamma")).toBeChecked();
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Alpha",
      }),
    );
    expect(
      screen.getByText("tasks:releases.milestonePicker.selectedCount 1"),
    ).toBeVisible();
  });

  it("retains the current page when dismissed outside or focus leaves", () => {
    render(<Harness />);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "common:pagination.nextPage" }),
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    fireEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(search());
    expect(m.hook).toHaveBeenLastCalledWith("p", "", 2, true);
    fireEvent.blur(search(), {
      relatedTarget: screen.getByRole("button", { name: "Outside" }),
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps results in place through outside pointer blur until the action click completes", () => {
    const clicked = vi.fn(() => {
      expect(checkbox("Alpha")).toBeVisible();
    });
    render(<Harness onOutsideClick={clicked} />);
    open();
    const outside = screen.getByRole("button", { name: "Outside" });
    fireEvent.pointerDown(outside);
    fireEvent.blur(search(), { relatedTarget: outside });
    expect(checkbox("Alpha")).toBeVisible();
    fireEvent.pointerUp(outside);
    expect(checkbox("Alpha")).toBeVisible();
    fireEvent.click(outside);
    expect(clicked).toHaveBeenCalledOnce();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("releases a cancelled outside-pointer gesture and keeps keyboard blur dismissal", () => {
    render(<Harness />);
    open();
    fireEvent.pointerDown(checkbox("Alpha"));
    fireEvent.pointerCancel(checkbox("Alpha"));
    expect(checkbox("Alpha")).toBeVisible();
    const outside = screen.getByRole("button", { name: "Outside" });
    fireEvent.pointerDown(outside);
    fireEvent.blur(search(), { relatedTarget: outside });
    expect(checkbox("Alpha")).toBeVisible();
    fireEvent.pointerCancel(outside);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.focus(search());
    fireEvent.blur(search(), { relatedTarget: outside });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("supports retry and distinguishes no matches from no candidates", () => {
    m.error = true;
    const view = render(<Harness />);
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.refetch).toHaveBeenCalledOnce();
    m.error = false;
    m.empty = true;
    view.rerender(<Harness />);
    expect(
      screen.getByText("tasks:releases.milestonePicker.empty"),
    ).toBeVisible();
    fireEvent.change(search(), { target: { value: "missing" } });
    expect(
      screen.getByText("tasks:releases.milestonePicker.noMatches"),
    ).toBeVisible();
  });

  it("limits all selected milestones to 100 without a count-over-limit badge", () => {
    const initial = Array.from({ length: 100 }, (_, i) => ({
      ...beta,
      id: `selected-${i}`,
    }));
    render(<Harness initial={initial} />);
    open();
    expect(checkbox("Alpha")).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("tasks:releases.milestonePicker.limit"),
    ).toBeVisible();
    expect(screen.queryByText("100/100")).not.toBeInTheDocument();
  });

  it("keeps selected identities separate when milestone titles match", () => {
    m.hook.mockReturnValue({
      data: {
        data: [alpha, { ...beta, title: "Alpha" }],
        pagination: { totalPages: 1 },
      },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: m.refetch,
    });
    render(<Harness />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Feature A Alpha" }));
    expect(
      screen.getByRole("checkbox", { name: "Feature A Alpha" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Feature B Alpha" }),
    ).not.toBeChecked();
  });

  it("refreshes a conflict on activation and retains failed selections", () => {
    const view = render(<Harness initial={[alpha]} />);
    view.rerender(<Harness initial={[alpha]} conflict conflictVersion={1} />);
    expect(m.refetch).not.toHaveBeenCalled();
    expect(search()).toHaveAccessibleDescription(
      "tasks:releases.milestonePicker.conflict",
    );
    open();
    expect(m.refetch).toHaveBeenCalledOnce();
    expect(checkbox("Alpha")).toBeChecked();
  });

  it("disables search, selected removal and candidate selection while saving", () => {
    const view = render(<Harness initial={[alpha]} />);
    open();
    view.rerender(<Harness initial={[alpha]} disabled />);
    expect(search()).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "tasks:releases.milestonePicker.remove Feature A · Alpha",
      }),
    ).toBeDisabled();
    expect(checkbox("Alpha")).toHaveAttribute("aria-disabled", "true");
    expect(m.hook).toHaveBeenLastCalledWith("p", "", 1, false);
  });
});
