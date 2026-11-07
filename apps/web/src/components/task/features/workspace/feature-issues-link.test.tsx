import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { FeatureIssuesLink } from "./feature-issues-link";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  milestone: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  guard: { dirty: false, saving: false },
  result: { data: undefined as unknown, isError: false, isFetching: false },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/i18n", () => ({ i18n: { t: (key: string) => key } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/hooks/mutations/task/use-update-task-feature", () => ({
  useUpdateTaskFeature: () => ({ mutateAsync: mocks.assign }),
}));
vi.mock("@/hooks/queries/task/use-feature-link-candidates", () => ({
  useFeatureLinkCandidates: () => ({ ...mocks.result, refetch: mocks.refetch }),
}));
vi.mock("@/fetchers/milestone/milestones", () => ({
  setTaskMilestone: (...args: unknown[]) => mocks.milestone(...args),
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftGuard: (guard: typeof mocks.guard) => {
    mocks.guard = guard;
  },
}));

const candidate = {
  id: "task",
  title: "Existing bug",
  type: "bug",
  number: 12,
  projectSlug: "APP",
  releaseId: null,
  releaseName: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.result = {
    data: { data: [candidate], pagination: { page: 1, totalPages: 1 } },
    isError: false,
    isFetching: false,
  };
  mocks.assign.mockResolvedValue({});
  mocks.milestone.mockResolvedValue({});
});
afterEach(cleanup);

it("retains a partially linked candidate for retry without repeating its successful Feature change", async () => {
  const close = vi.fn();
  mocks.milestone.mockRejectedValueOnce(new Error("Retry"));
  render(
    <FeatureIssuesLink
      projectId="project"
      featureId="feature"
      milestoneId="milestone"
      onClose={close}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /APP-12/ }));
  await screen.findByRole("alert");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "common:error.tryAgain" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(mocks.assign).toHaveBeenCalledExactlyOnceWith({
    task: { id: "task", projectId: "project", featureId: null },
    featureId: "feature",
  });
  expect(mocks.milestone).toHaveBeenCalledTimes(2);
  expect(mocks.milestone).toHaveBeenLastCalledWith("task", "milestone");
});

it("blocks navigation and editing while linking, and preserves pending work on Escape", async () => {
  let resolve!: () => void;
  mocks.assign.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    }),
  );
  const close = vi.fn();
  render(
    <FeatureIssuesLink
      projectId="project"
      featureId="feature"
      onClose={close}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /APP-12/ }));
  expect(mocks.guard.saving).toBe(true);
  expect(screen.getByRole("textbox")).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).not.toHaveBeenCalled();
  resolve();
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

it("shows retry feedback when the bounded candidate read fails", () => {
  mocks.result = { data: undefined, isError: true, isFetching: false };
  render(
    <FeatureIssuesLink
      projectId="project"
      featureId="feature"
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "common:error.tryAgain" }),
  );
  expect(mocks.refetch).toHaveBeenCalledOnce();
});
