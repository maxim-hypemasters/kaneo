import { beforeEach, expect, it, vi } from "vite-plus/test";
import getFeatureLinkCandidates from "./get-feature-link-candidates";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: {
    task: { "feature-link-candidates": { ":projectId": { $get: mocks.get } } },
  },
}));
beforeEach(() => vi.clearAllMocks());

it("reads a bounded project candidate page with identifier search and cancellation", async () => {
  const value = {
    data: [],
    pagination: { page: 2, limit: 50, total: 0, totalPages: 0 },
  };
  mocks.get.mockResolvedValue(Response.json(value));
  const signal = new AbortController().signal;
  expect(await getFeatureLinkCandidates("p", "  MFP-14 ", 2, signal)).toEqual(
    value,
  );
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
    {
      param: { projectId: "p" },
      query: { q: "MFP-14", page: "2", limit: "50" },
    },
    { init: { signal } },
  );
});

it("surfaces access and temporary failures without returning stale candidate data", async () => {
  mocks.get.mockResolvedValue(
    Response.json({ message: "Forbidden" }, { status: 403 }),
  );
  await expect(getFeatureLinkCandidates("p", "", 1)).rejects.toMatchObject({
    status: 403,
  });
});
