import { expect, it } from "vite-plus/test";
import { releaseTimelinePosition } from "./release-timeline-position";

const release = {
  startDate: "2026-10-01",
  codeFreezeDate: "2026-10-16",
  submissionDate: "2026-10-21",
};

it("places code freeze and today between start and submission", () => {
  expect(releaseTimelinePosition(release, "2026-10-11")).toEqual({
    codeFreeze: 75,
    today: 50,
    todayInRange: true,
  });
});

it("clamps today to the bar outside the release", () => {
  expect(releaseTimelinePosition(release, "2026-09-01")).toMatchObject({
    today: 0,
    todayInRange: false,
  });
  expect(releaseTimelinePosition(release, "2026-11-30")).toMatchObject({
    today: 100,
    todayInRange: false,
  });
  expect(releaseTimelinePosition(release, "2026-10-21")).toMatchObject({
    today: 100,
    todayInRange: true,
  });
});

it("fills a one-day release once it starts", () => {
  const oneDay = {
    startDate: "2026-10-01",
    codeFreezeDate: "2026-10-01",
    submissionDate: "2026-10-01",
  };
  expect(releaseTimelinePosition(oneDay, "2026-09-30")).toEqual({
    codeFreeze: 100,
    today: 0,
    todayInRange: false,
  });
  expect(releaseTimelinePosition(oneDay, "2026-10-01")).toEqual({
    codeFreeze: 100,
    today: 100,
    todayInRange: true,
  });
});
