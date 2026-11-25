import { describe, expect, it } from "vite-plus/test";
import { applyLinkOrder } from "./apply-link-order";

describe("applyLinkOrder", () => {
  it("sorts the requested links by position", () => {
    expect(
      applyLinkOrder(
        ["a", "b", "c"],
        [
          { id: "a", position: 2 },
          { id: "b", position: 0 },
          { id: "c", position: 1 },
        ],
      ),
    ).toEqual(["b", "c", "a"]);
  });

  it("keeps links the request leaves out after the listed ones", () => {
    expect(
      applyLinkOrder(
        ["a", "b", "c", "d"],
        [
          { id: "c", position: 0 },
          { id: "a", position: 1 },
        ],
      ),
    ).toEqual(["c", "a", "b", "d"]);
  });
});
