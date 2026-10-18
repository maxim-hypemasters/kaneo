import { describe, expect, it } from "vite-plus/test";
import {
  formatReleaseDate,
  formatReleaseRange,
  parseReleaseDate,
  toReleaseDate,
} from "./release-date";

// Intl puts thin or narrow spaces around range dashes in newer ICU versions.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("parseReleaseDate", () => {
  it("reads a day as local midnight of that day", () => {
    const date = parseReleaseDate("2026-10-20");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 9, 20,
    ]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });

  it("round-trips with toReleaseDate", () => {
    expect(toReleaseDate(parseReleaseDate("2027-02-28"))).toBe("2027-02-28");
    expect(toReleaseDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("formatReleaseDate", () => {
  it("leaves out this year and shows other years", () => {
    const today = "2026-10-17";
    expect(formatReleaseDate("2026-10-20", { locale: "en-US", today })).toBe(
      "Oct 20",
    );
    expect(formatReleaseDate("2027-01-09", { locale: "en-US", today })).toBe(
      "Jan 9, 2027",
    );
  });
});

describe("formatReleaseRange", () => {
  it("joins two days of this year", () => {
    expect(
      plain(
        formatReleaseRange("2026-10-01", "2026-11-20", {
          locale: "en-US",
          today: "2026-10-17",
        }),
      ),
    ).toBe("Oct 1 – Nov 20");
  });

  it("shows the years when the range leaves this year", () => {
    expect(
      plain(
        formatReleaseRange("2026-12-15", "2027-01-09", {
          locale: "en-US",
          today: "2026-10-17",
        }),
      ),
    ).toBe("Dec 15, 2026 – Jan 9, 2027");
  });

  it("follows the locale", () => {
    expect(
      plain(
        formatReleaseRange("2026-10-01", "2026-10-20", {
          locale: "de-DE",
          today: "2026-10-17",
        }),
      ),
    ).toBe(
      plain(
        new Intl.DateTimeFormat("de-DE", {
          month: "short",
          day: "numeric",
        }).formatRange(new Date(2026, 9, 1), new Date(2026, 9, 20)),
      ),
    );
  });
});
