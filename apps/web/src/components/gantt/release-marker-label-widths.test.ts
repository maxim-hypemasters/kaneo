import { expect, it } from "vite-plus/test";
import { releaseMarkerLabelWidths } from "./release-marker-label-widths";

it("gives each label the room up to the next marker day or the end", () => {
  expect(
    releaseMarkerLabelWidths(
      [{ index: 2 }, { index: 3 }, { index: 10 }, { index: 28 }],
      30,
    ),
  ).toEqual([
    { roomDays: 1, iconOnly: true },
    { roomDays: 7, iconOnly: false },
    { roomDays: 18, iconOnly: false },
    { roomDays: 1.5, iconOnly: false },
  ]);
});

it("drops to icons on the last rendered day", () => {
  expect(releaseMarkerLabelWidths([{ index: 29 }], 30)).toEqual([
    { roomDays: 0.5, iconOnly: true },
  ]);
});
