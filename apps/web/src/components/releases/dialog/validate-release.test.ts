import { expect, it } from "vite-plus/test";
import { validateRelease } from "./validate-release";

const valid = {
  name: "2.4",
  description: "",
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-15",
  submissionDate: "2026-10-20",
};

it("accepts ordered dates, equal days included", () => {
  expect(validateRelease(valid)).toEqual({});
  expect(
    validateRelease({
      ...valid,
      codeFreezeDate: "2026-10-01",
      submissionDate: "2026-10-01",
    }),
  ).toEqual({});
});

it("asks for a name and every date", () => {
  expect(
    validateRelease({
      name: "   ",
      description: "",
      startDate: null,
      codeFreezeDate: null,
      submissionDate: null,
    }),
  ).toEqual({
    name: { key: "tasks:releases.dialog.nameRequired" },
    startDate: { key: "tasks:releases.dialog.dateRequired" },
    codeFreezeDate: { key: "tasks:releases.dialog.dateRequired" },
    submissionDate: { key: "tasks:releases.dialog.dateRequired" },
  });
});

it("names the day that breaks the order", () => {
  expect(validateRelease({ ...valid, codeFreezeDate: "2026-09-30" })).toEqual({
    codeFreezeDate: {
      key: "tasks:releases.dialog.beforeStart",
      day: "2026-09-30",
    },
  });
  expect(validateRelease({ ...valid, submissionDate: "2026-10-14" })).toEqual({
    submissionDate: {
      key: "tasks:releases.dialog.beforeCodeFreeze",
      day: "2026-10-14",
    },
  });
  expect(
    validateRelease({
      ...valid,
      codeFreezeDate: null,
      submissionDate: "2026-09-01",
    }),
  ).toMatchObject({
    submissionDate: {
      key: "tasks:releases.dialog.beforeStart",
      day: "2026-09-01",
    },
  });
});
