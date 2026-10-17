import { describe, expect, it } from "vite-plus/test";
import { collectCardLinks } from "./card-links.js";

const item = (id: string, taskListId: string, linkedCardId: string | null) => ({
  id,
  taskListId,
  name: `Item ${id}`,
  isCompleted: false,
  position: 1,
  linkedCardId,
});

describe("collectCardLinks", () => {
  const taskLists = [
    { id: "tl1", cardId: "c1", name: "Steps" },
    { id: "tl2", cardId: "c2", name: "More" },
    { id: "tl9", cardId: "c_archived", name: "Old" },
  ];

  it("links the card holding the checklist to the linked card, in order", () => {
    expect(
      collectCardLinks(new Set(["c1", "c2", "c3"]), taskLists, [
        item("i1", "tl1", "c3"),
        item("i2", "tl2", "c3"),
        item("i3", "tl1", "c2"),
      ]),
    ).toEqual([
      { parentCardId: "c1", childCardId: "c3", name: "Item i1" },
      { parentCardId: "c2", childCardId: "c3", name: "Item i2" },
      { parentCardId: "c1", childCardId: "c2", name: "Item i3" },
    ]);
  });

  it("leaves out plain items and links to cards that aren't imported", () => {
    expect(
      collectCardLinks(new Set(["c1", "c2"]), taskLists, [
        item("i1", "tl1", null),
        item("i2", "tl1", "c_other_board"),
        item("i3", "tl9", "c1"),
        item("i4", "tl_missing", "c2"),
      ]),
    ).toEqual([]);
  });
});
