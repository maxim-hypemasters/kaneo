import { beforeEach, expect, it, vi } from "vite-plus/test";
import getReleaseLinkCandidates from "./get-release-link-candidates";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: { release: { ":id": { "link-candidates": { $get: mocks.get } } } },
}));
beforeEach(() => vi.clearAllMocks());

it("sends a bounded typed read with search, page and cancellation", async () => {
  const value = {
    data: [],
    pagination: { total: 0, page: 2, limit: 50, totalPages: 0 },
  };
  mocks.get.mockResolvedValue(Response.json(value));
  const signal = new AbortController().signal;
  expect(
    await getReleaseLinkCandidates("r", "task", "  WWC-12 ", 2, signal),
  ).toEqual(value);
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(
    {
      param: { id: "r" },
      query: { kind: "task", q: "WWC-12", page: "2", limit: "50" },
    },
    { init: { signal } },
  );
});

it("surfaces authorization failures to the picker", async () => {
  mocks.get.mockResolvedValue(
    Response.json({ message: "Forbidden" }, { status: 403 }),
  );
  await expect(
    getReleaseLinkCandidates("r", "milestone", "", 1),
  ).rejects.toMatchObject({ status: 403 });
});
