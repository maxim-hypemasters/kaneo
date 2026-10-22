import { beforeEach, expect, it, vi } from "vite-plus/test";
import getReleaseMilestoneCandidates from "./get-release-milestone-candidates";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: {
    release: {
      project: {
        ":projectId": { "milestone-link-candidates": { $get: mocks.get } },
      },
    },
  },
}));
beforeEach(() => vi.clearAllMocks());

it("reads bounded project candidates with search, pagination and cancellation", async () => {
  const result = {
    data: [],
    pagination: { total: 0, page: 2, limit: 50, totalPages: 0 },
  };
  mocks.get.mockResolvedValue(Response.json(result));
  const signal = new AbortController().signal;
  expect(
    await getReleaseMilestoneCandidates("p", "  Baseline ", 2, signal),
  ).toEqual(result);
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
    {
      param: { projectId: "p" },
      query: { q: "Baseline", page: "2", limit: "50" },
    },
    { init: { signal } },
  );
});

it("preserves typed API errors for the picker", async () => {
  mocks.get.mockResolvedValue(
    Response.json(
      { message: "Forbidden", code: "MISSING_PERMISSION" },
      { status: 403 },
    ),
  );
  await expect(getReleaseMilestoneCandidates("p", "", 1)).rejects.toMatchObject(
    { status: 403, code: "MISSING_PERMISSION" },
  );
});
