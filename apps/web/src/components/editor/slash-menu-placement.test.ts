import { describe, expect, it } from "vite-plus/test";
import { placeSlashMenu } from "./slash-menu-placement";

const origin = { top: 100, left: 50, width: 600 };
const viewport = { top: 0, height: 800 };
const menu = { width: 288, height: 200 };

describe("placeSlashMenu", () => {
  it("opens below the caret, relative to the container", () => {
    expect(
      placeSlashMenu({
        anchor: { top: 200, bottom: 220, left: 150 },
        origin,
        viewport,
        menu,
      }),
    ).toEqual({ top: 124, left: 100, maxHeight: 288 });
  });

  it("flips above the caret near the bottom of the viewport", () => {
    const placement = placeSlashMenu({
      anchor: { top: 700, bottom: 720, left: 150 },
      origin,
      viewport,
      menu,
    });
    // 200px tall menu ending 4px above the caret.
    expect(placement.top).toBe(700 - 4 - 200 - origin.top);
    expect(placement.maxHeight).toBe(288);
  });

  it("stays below when the space above is smaller", () => {
    const placement = placeSlashMenu({
      anchor: { top: 120, bottom: 140, left: 150 },
      origin,
      viewport: { top: 0, height: 300 },
      menu,
    });
    expect(placement.top).toBe(144 - origin.top);
    expect(placement.maxHeight).toBe(300 - 8 - 140 - 4);
  });

  it("caps the height to the side it opens on when neither side fits", () => {
    const placement = placeSlashMenu({
      anchor: { top: 230, bottom: 250, left: 150 },
      origin: { ...origin, top: 0 },
      viewport: { top: 0, height: 400 },
      menu: { width: 288, height: 400 },
    });
    // Above has 218px, below 138px: open above, capped to the room there.
    expect(placement.maxHeight).toBe(218);
    expect(placement.top).toBe(8);
  });

  it("measures against the visual viewport offset", () => {
    const input = {
      anchor: { top: 700, bottom: 720, left: 150 },
      origin: { ...origin, top: 0 },
      menu,
    };
    // Scrolled (pinch zoom) to 600-1100: plenty of room below.
    expect(
      placeSlashMenu({ ...input, viewport: { top: 600, height: 500 } }).top,
    ).toBe(724);
    // The same caret in a 0-500 viewport is past the bottom: flip above.
    expect(
      placeSlashMenu({ ...input, viewport: { top: 0, height: 500 } }).top,
    ).toBe(700 - 4 - 200);
  });

  it("clamps the left edge inside the container", () => {
    expect(
      placeSlashMenu({
        anchor: { top: 200, bottom: 220, left: 620 },
        origin,
        viewport,
        menu,
      }).left,
    ).toBe(600 - 288);
    expect(
      placeSlashMenu({
        anchor: { top: 200, bottom: 220, left: 20 },
        origin,
        viewport,
        menu,
      }).left,
    ).toBe(0);
    expect(
      placeSlashMenu({
        anchor: { top: 200, bottom: 220, left: 100 },
        origin: { ...origin, width: 200 },
        viewport,
        menu,
      }).left,
    ).toBe(0);
  });
});
