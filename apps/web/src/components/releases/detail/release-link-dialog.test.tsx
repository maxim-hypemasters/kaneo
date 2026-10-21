import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { ReleaseLinkCandidate } from "@/fetchers/release/get-release-link-candidates";
import { ReleaseLinkDialog } from "./release-link-dialog";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  save: vi.fn(),
  refetch: vi.fn(),
  pending: false,
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("@/hooks/queries/release/use-release-link-candidates", () => ({
  useReleaseLinkCandidates: m.query,
}));
vi.mock("@/hooks/mutations/release/use-link-release-items", () => ({
  useLinkReleaseItems: () => ({ mutateAsync: m.save, isPending: m.pending }),
}));

const first: ReleaseLinkCandidate = {
  id: "a",
  title: "Alpha task",
  type: "task",
  number: 7,
  projectSlug: "ABC",
  featureId: "f",
  featureTitle: "Feature",
  releaseId: "old",
  releaseName: "Old release",
};
const second: ReleaseLinkCandidate = {
  ...first,
  id: "b",
  title: "Beta bug",
  type: "bug",
  number: 8,
  releaseId: null,
  releaseName: null,
};
const response = (items = [first, second], totalPages = 1) => ({
  data: {
    data: items,
    pagination: { total: items.length, page: 1, limit: 50, totalPages },
  },
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: m.refetch,
});
const view = (kind: "task" | "milestone" = "task") => {
  const close = vi.fn();
  const result = render(
    <ReleaseLinkDialog
      projectId="p"
      releaseId="r"
      releaseName="Next release"
      kind={kind}
      onClose={close}
    />,
  );
  return { close, ...result };
};
beforeEach(() => {
  vi.clearAllMocks();
  m.pending = false;
  m.query.mockReturnValue(response());
  m.save.mockResolvedValue({ succeeded: ["a", "b"], failed: [] });
});
afterEach(cleanup);

describe("Release linking dialog", () => {
  it("shows task identifiers, classification and existing release before linking", () => {
    view();
    expect(screen.getByText("ABC-7")).toBeInTheDocument();
    expect(screen.getByText("Old release")).toBeInTheDocument();
    expect(
      screen.getByText("tasks:releases.link.noRelease"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "tasks:releases.link.linkSelected" }),
    ).toBeDisabled();
    expect(m.query).toHaveBeenCalledWith("p", "r", "task", "", 1, true);
  });

  it("shows Feature context for milestones, including empty ones", () => {
    m.query.mockReturnValue(
      response([
        { ...first, type: "milestone", number: null, title: "Foundation" },
      ]),
    );
    view("milestone");
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Foundation/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("ABC-7")).not.toBeInTheDocument();
  });

  it("preserves selections across pages and searches and supports deselecting hidden items", async () => {
    m.query.mockImplementation((_project, _release, _kind, search, page) =>
      response(search || page === 2 ? [second] : [first], 2),
    );
    view();
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha task/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "common:pagination.nextPage" }),
    );
    expect(m.query).toHaveBeenLastCalledWith("p", "r", "task", "", 2, true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Beta bug/ }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Beta" },
    });
    expect(m.query).toHaveBeenLastCalledWith("p", "r", "task", "Beta", 1, true);
    expect(
      screen.getByText("tasks:releases.link.selectedCount 2"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "tasks:releases.link.remove Alpha task",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.link.linkSelected" }),
    );
    await waitFor(() =>
      expect(m.save).toHaveBeenCalledExactlyOnceWith([second]),
    );
  });

  it("removes successful links and retains failures for retry", async () => {
    m.save
      .mockResolvedValueOnce({ succeeded: ["a"], failed: ["b"] })
      .mockResolvedValueOnce({ succeeded: ["b"], failed: [] });
    const { close } = view();
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha task/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Beta bug/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.link.linkSelected" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:releases.link.partialError 1 1",
    );
    expect(close).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", {
        name: "tasks:releases.link.remove Alpha task",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Beta bug/ })).toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.link.linkSelected" }),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(m.save).toHaveBeenLastCalledWith([second]);
  });

  it("preserves selected work after an unexpected save error", async () => {
    m.save.mockRejectedValue(new Error("offline"));
    const { close } = view();
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha task/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "tasks:releases.link.linkSelected" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tasks:releases.link.saveError",
    );
    expect(screen.getByRole("checkbox", { name: /Alpha task/ })).toBeChecked();
    expect(close).not.toHaveBeenCalled();
  });

  it("disables selection, searching and closing while saving", () => {
    m.pending = true;
    const { close } = view();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    ).toBeDisabled();
    for (const checkbox of screen.getAllByRole("checkbox"))
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(
      screen.getByText("tasks:releases.link.selectedCount 0"),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });

  it("offers retry after a candidate read fails", () => {
    m.query.mockReturnValue({ ...response(), data: undefined, isError: true });
    view();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "tasks:releases.link.loadError",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "common:error.tryAgain" }),
    );
    expect(m.refetch).toHaveBeenCalledOnce();
  });

  it.each(["task", "milestone"] as const)(
    "distinguishes empty %s candidates from search results",
    (kind) => {
      m.query.mockReturnValue(response([]));
      view(kind);
      expect(
        screen.getByText(
          kind === "task"
            ? "tasks:releases.link.noTasks"
            : "tasks:releases.link.noMilestones",
        ),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "missing" },
      });
      expect(
        screen.getByText("tasks:releases.link.noMatches"),
      ).toBeInTheDocument();
    },
  );

  it("shows candidate loading feedback without an empty state", () => {
    m.query.mockReturnValue({
      ...response(),
      data: undefined,
      isPending: true,
    });
    view();
    expect(screen.getByText("tasks:releases.link.loading")).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      screen.queryByText("tasks:releases.link.noTasks"),
    ).not.toBeInTheDocument();
  });

  it("cancels without changing work", () => {
    const { close } = view();
    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(m.save).not.toHaveBeenCalled();
  });
});
