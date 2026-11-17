import { describe, expect, it } from "vite-plus/test";
import { formatFieldValue } from "./format-field-value";

describe("formatFieldValue", () => {
  it("shows calendar days without a time, whatever the time zone", () => {
    expect(formatFieldValue("date", "2026-11-20", "en-US")).toBe(
      "Nov 20, 2026",
    );
    expect(formatFieldValue("date", "2026-11-20T00:00:00.000Z", "en-US")).toBe(
      "Nov 20, 2026",
    );
  });

  it("shows a moment with its time", () => {
    const shown = formatFieldValue("date", "2026-11-20T14:30:00.000Z", "en-US");
    expect(shown).toMatch(/Nov 2[01], 2026/);
    expect(shown).toMatch(/\d:\d{2}/);
  });

  it("keeps other values, empty values and unreadable dates as they are", () => {
    expect(formatFieldValue("text", "2026-11-20", "en-US")).toBe("2026-11-20");
    expect(formatFieldValue("date", "", "en-US")).toBe("");
    expect(formatFieldValue("date", "next week", "en-US")).toBe("next week");
    expect(formatFieldValue("date", "2026-11-20", "not a locale!")).toMatch(
      /2026/,
    );
  });
});
