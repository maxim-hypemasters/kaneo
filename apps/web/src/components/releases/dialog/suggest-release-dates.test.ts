import { expect, it } from "vite-plus/test";
import { suggestReleaseDates } from "./suggest-release-dates";

it("starts the day after the latest submission with the same lengths", () => {
  expect(
    suggestReleaseDates(
      [
        {
          startDate: "2026-10-01",
          codeFreezeDate: "2026-10-15",
          submissionDate: "2026-10-20",
        },
        {
          startDate: "2026-09-01",
          codeFreezeDate: "2026-09-02",
          submissionDate: "2026-09-03",
        },
      ],
      "2026-10-05",
    ),
  ).toEqual({
    startDate: "2026-10-21",
    codeFreezeDate: "2026-11-04",
    submissionDate: "2026-11-09",
  });
});

it("doesn't suggest a start in the past", () => {
  expect(
    suggestReleaseDates(
      [
        {
          startDate: "2026-01-01",
          codeFreezeDate: "2026-01-08",
          submissionDate: "2026-01-10",
        },
      ],
      "2026-10-17",
    ),
  ).toEqual({
    startDate: "2026-10-17",
    codeFreezeDate: "2026-10-24",
    submissionDate: "2026-10-26",
  });
});

it("crosses a month and year end by calendar days", () => {
  expect(
    suggestReleaseDates(
      [
        {
          startDate: "2026-12-01",
          codeFreezeDate: "2026-12-29",
          submissionDate: "2026-12-31",
        },
      ],
      "2026-12-01",
    ),
  ).toEqual({
    startDate: "2027-01-01",
    codeFreezeDate: "2027-01-29",
    submissionDate: "2027-01-31",
  });
});

it("suggests nothing for a project's first release", () => {
  expect(suggestReleaseDates([], "2026-10-17")).toBeNull();
});
