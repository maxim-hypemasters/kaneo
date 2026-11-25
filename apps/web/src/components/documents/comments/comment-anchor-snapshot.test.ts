import { describe, expect, it } from "vite-plus/test";
import { anchorUpdatesFor } from "./comment-anchor-snapshot";

const updates = [
  { id: "t1", quote: "quick fox", prefix: "the", suffix: "ran" },
];
const snapshot = { body: "the quick fox ran", updates };

describe("anchorUpdatesFor", () => {
  it("sends anchors with the body they were taken from", () => {
    expect(anchorUpdatesFor({ body: "the quick fox ran" }, snapshot)).toBe(
      updates,
    );
  });

  it("sends none with other text, a title-only save, or no snapshot", () => {
    expect(anchorUpdatesFor({ body: "the quick fox ran!" }, snapshot)).toEqual(
      [],
    );
    expect(anchorUpdatesFor({}, snapshot)).toEqual([]);
    expect(anchorUpdatesFor({ body: "the quick fox ran" }, null)).toEqual([]);
  });
});
