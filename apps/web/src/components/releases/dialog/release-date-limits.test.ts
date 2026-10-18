import { expect, it } from "vite-plus/test";
import { releaseDateLimits } from "./release-date-limits";

const values = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

it("holds each date between its neighbours", () => {
  expect(releaseDateLimits(values, "start")).toEqual({
    max: { day: "2026-10-15", kind: "codeFreeze" },
  });
  expect(releaseDateLimits(values, "codeFreeze")).toEqual({
    min: { day: "2026-10-01", kind: "start" },
    max: { day: "2026-10-20", kind: "submission" },
  });
  expect(releaseDateLimits(values, "submission")).toEqual({
    min: { day: "2026-10-15", kind: "codeFreeze" },
  });
});

it("skips a code freeze that isn't set yet", () => {
  const noFreeze = { ...values, codeFreezeDate: null };
  expect(releaseDateLimits(noFreeze, "start")).toEqual({
    max: { day: "2026-10-20", kind: "submission" },
  });
  expect(releaseDateLimits(noFreeze, "submission")).toEqual({
    min: { day: "2026-10-01", kind: "start" },
  });
});

it("leaves a date free when nothing bounds it", () => {
  const empty = { startDate: null, codeFreezeDate: null, submissionDate: null };
  expect(releaseDateLimits(empty, "start")).toEqual({ max: undefined });
  expect(releaseDateLimits(empty, "codeFreeze")).toEqual({
    min: undefined,
    max: undefined,
  });
});
