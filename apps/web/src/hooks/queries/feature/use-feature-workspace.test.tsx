import { cleanup, renderHook } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import {
  useFeatureActivity,
  useFeatureDocument,
  useFeatureDocuments,
  useFeatureUpdate,
  useLatestFeatureUpdate,
} from "./use-feature-workspace";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  latest: vi.fn(),
  activity: vi.fn(),
  documents: vi.fn(),
  document: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: (value: unknown) => value,
  useQuery: (options: unknown) => m.query(options),
}));
vi.mock("@/fetchers/feature/feature-workspace", () => ({
  getLatestFeatureUpdate: m.latest,
  getFeatureActivity: m.activity,
  getFeatureDocuments: m.documents,
  getFeatureDocument: m.document,
  getFeatureUpdate: m.update,
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Feature workspace queries", () => {
  it("reads a selected report only when requested and absent from the feed page", () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        useFeatureUpdate("project", "feature", "old-report", enabled),
      { initialProps: { enabled: false } },
    );
    expect(m.query.mock.lastCall?.[0].enabled).toBe(false);
    rerender({ enabled: true });
    const options = m.query.mock.lastCall?.[0];
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual([
      "feature-workspace",
      "project",
      "feature",
      "update",
      "old-report",
    ]);
    options.queryFn();
    expect(m.update).toHaveBeenCalledWith("feature", "old-report");
  });
  it("reads only the latest report for Overview with project-scoped keys", () => {
    renderHook(() => useLatestFeatureUpdate("project", "feature"));
    const options = m.query.mock.calls[0][0];
    expect(options.queryKey).toEqual([
      "feature-workspace",
      "project",
      "feature",
      "latest-update",
    ]);
    options.queryFn();
    expect(m.latest).toHaveBeenCalledWith("feature");
    expect(m.activity).not.toHaveBeenCalled();
    expect(m.documents).not.toHaveBeenCalled();
  });

  it("bounds Activity by page and retains prior content while fetching", () => {
    renderHook(() => useFeatureActivity("project", "feature", 3));
    const options = m.query.mock.calls[0][0];
    expect(options.queryKey).toEqual([
      "feature-workspace",
      "project",
      "feature",
      "activity",
      3,
    ]);
    expect(options.placeholderData).toBeTypeOf("function");
    options.queryFn();
    expect(m.activity).toHaveBeenCalledWith("feature", 3);
  });

  it("does not read a document list while a document editor is open", () => {
    renderHook(() =>
      useFeatureDocuments("project", "feature", "design", 2, false),
    );
    expect(m.query.mock.calls[0][0]).toMatchObject({
      enabled: false,
      queryKey: [
        "feature-workspace",
        "project",
        "feature",
        "documents",
        "design",
        2,
      ],
    });
  });

  it("requires a document selection before loading its body", () => {
    const { rerender } = renderHook(
      ({ id }) => useFeatureDocument("project", "feature", id),
      { initialProps: { id: undefined as string | undefined } },
    );
    expect(m.query.mock.calls[0][0].enabled).toBe(false);
    rerender({ id: "page" });
    const options = m.query.mock.lastCall?.[0];
    expect(options.enabled).toBe(true);
    options.queryFn();
    expect(m.document).toHaveBeenCalledWith("feature", "page");
  });
});
