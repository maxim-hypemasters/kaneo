import { eachDayOfInterval, parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import { assigneeMilestoneTracks } from "./assignee-milestone-tracks";
import { scheduledMilestones } from "./scheduled-milestones";
import { isWeekendDay } from "./weekend-columns";

const timeline = {
  rangeStart: parseISO("2026-10-01"),
  days: eachDayOfInterval({
    start: parseISO("2026-10-01"),
    end: parseISO("2026-10-31"),
  }),
  hideWeekends: false,
};
function milestone(id: string, startDate: string, endDate: string) {
  return scheduledMilestones([
    {
      id,
      featureId: "f",
      featureTitle: "Feature",
      projectId: "p",
      title: id,
      leadId: "lead",
      status: "todo",
      priority: "no-priority",
      releaseId: null,
      position: 0,
      startDate,
      endDate,
      progress: { total: 0, started: 0, completed: 0 },
    },
  ])[0]!;
}
const ids = (tracks: ReturnType<typeof assigneeMilestoneTracks>) =>
  tracks.map((track) => track.map((task) => task.id));

describe("Milestones on a lead's header row", () => {
  it("shares a track for disjoint dates and stacks overlapping and same-day spans", () => {
    const tasks = [
      milestone("later", "2026-10-11", "2026-10-12"),
      milestone("overlap", "2026-10-05", "2026-10-15"),
      milestone("first", "2026-10-01", "2026-10-10"),
      milestone("same-day", "2026-10-10", "2026-10-10"),
    ];
    expect(ids(assigneeMilestoneTracks(tasks, timeline, false))).toEqual([
      ["milestone:first", "milestone:later"],
      ["milestone:overlap"],
      ["milestone:same-day"],
    ]);
    expect(tasks[0].id).toBe("milestone:later");
  });
  it("keeps clipped milestones and leaves offscreen spans out of header height", () => {
    expect(
      ids(
        assigneeMilestoneTracks(
          [
            milestone("before", "2026-09-01", "2026-09-30"),
            milestone("clipped", "2026-09-25", "2026-10-02"),
            milestone("after", "2026-11-01", "2026-11-03"),
          ],
          timeline,
          false,
        ),
      ),
    ).toEqual([["milestone:clipped"]]);
  });
  describe("with weekends hidden", () => {
    const workdays = {
      ...timeline,
      days: timeline.days.filter((day) => !isWeekendDay(day)),
      hideWeekends: true,
    };
    // 2026-10-03 is a Saturday.
    const weekend = milestone("weekend", "2026-10-03", "2026-10-04");
    const week = milestone("week", "2026-10-05", "2026-10-09");

    it("keeps a weekend-only milestone off the track of the Monday one it is drawn on", () => {
      expect(
        ids(assigneeMilestoneTracks([weekend, week], timeline, false)),
      ).toEqual([["milestone:weekend", "milestone:week"]]);
      expect(
        ids(assigneeMilestoneTracks([weekend, week], workdays, false)),
      ).toEqual([["milestone:weekend"], ["milestone:week"]]);
    });

    it("stacks a Saturday-only and a Sunday-only milestone, both drawn on Monday", () => {
      expect(
        ids(
          assigneeMilestoneTracks(
            [
              milestone("sat", "2026-10-03", "2026-10-03"),
              milestone("sun", "2026-10-04", "2026-10-04"),
            ],
            workdays,
            false,
          ),
        ),
      ).toEqual([["milestone:sat"], ["milestone:sun"]]);
    });

    it("lets milestones that only overlap on hidden days share a track", () => {
      expect(
        ids(
          assigneeMilestoneTracks(
            [
              milestone("fri-sun", "2026-10-02", "2026-10-04"),
              milestone("sat-mon", "2026-10-03", "2026-10-05"),
            ],
            workdays,
            false,
          ),
        ),
      ).toEqual([["milestone:fri-sun", "milestone:sat-mon"]]);
    });
  });
  it("gives short phone labels their own tracks", () => {
    expect(
      ids(
        assigneeMilestoneTracks(
          [
            milestone("first", "2026-10-01", "2026-10-01"),
            milestone("next", "2026-10-02", "2026-10-02"),
          ],
          timeline,
          true,
        ),
      ),
    ).toEqual([["milestone:first"], ["milestone:next"]]);
  });
});
