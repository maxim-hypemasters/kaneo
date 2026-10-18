import { expect, it } from "vite-plus/test";
import { openingReleaseSpans } from "./opening-release-spans";

it("spans current and upcoming releases from start to submission", () => {
  const release = (startDate: string, submissionDate: string) => ({
    startDate,
    codeFreezeDate: startDate,
    submissionDate,
  });

  expect(
    openingReleaseSpans(
      [
        release("2026-08-01", "2026-10-16"),
        release("2026-10-01", "2026-10-17"),
        release("2026-12-01", "2027-01-15"),
      ],
      "2026-10-17",
    ),
  ).toEqual([
    {
      scheduleStart: new Date(2026, 9, 1),
      scheduleEnd: new Date(2026, 9, 17),
    },
    {
      scheduleStart: new Date(2026, 11, 1),
      scheduleEnd: new Date(2027, 0, 15),
    },
  ]);
});
