import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { HOLIDAY_DATA_VERSION } from "./holiday-data-version";

describe("HOLIDAY_DATA_VERSION", () => {
  it("is the exact version pinned in package.json", () => {
    const pinned = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ).dependencies["date-holidays"];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(HOLIDAY_DATA_VERSION).toBe(pinned);
  });
});
