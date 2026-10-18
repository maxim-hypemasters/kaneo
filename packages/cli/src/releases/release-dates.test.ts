import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { checkReleaseDateOrder, formatReleaseDay } from "./release-dates.js";

const dates = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-20",
  submissionDate: "2026-10-24",
};

describe("checkReleaseDateOrder", () => {
  it("accepts ordered and equal days", () => {
    expect(Result.isSuccess(checkReleaseDateOrder(dates))).toBe(true);
    const day = "2026-10-07";
    expect(
      Result.isSuccess(
        checkReleaseDateOrder({
          startDate: day,
          codeFreezeDate: day,
          submissionDate: day,
        }),
      ),
    ).toBe(true);
  });

  it("names a code freeze before the start", () => {
    const result = checkReleaseDateOrder({
      ...dates,
      codeFreezeDate: "2026-09-30",
    });
    expect(Result.isFailure(result) && result.failure).toMatchObject({
      message:
        "The code freeze (2026-09-30) is before the start date (2026-10-01).",
      hint: "Dates must run start ≤ code freeze ≤ submission. Equal days are allowed.",
    });
  });

  it("names a submission before the code freeze", () => {
    const result = checkReleaseDateOrder({
      ...dates,
      submissionDate: "2026-10-19",
    });
    expect(Result.isFailure(result) && result.failure.message).toBe(
      "The submission date (2026-10-19) is before the code freeze (2026-10-20).",
    );
  });
});

describe("formatReleaseDay", () => {
  it("leaves out this year", () => {
    expect(formatReleaseDay("2026-10-20", "2026-10-07")).toBe("Oct 20");
  });

  it("shows another year", () => {
    expect(formatReleaseDay("2027-01-05", "2026-10-07")).toBe("Jan 5, 2027");
  });

  it("keeps the day in any time zone", () => {
    expect(formatReleaseDay("2026-01-01", "2026-10-07")).toBe("Jan 1");
  });
});
