import { describe, expect, it } from "vite-plus/test";
import { workReservations, type ReservableWork } from "./work-reservations";

const at = (iso: string) => new Date(iso);
const work = (values: Partial<ReservableWork>): ReservableWork => ({
  userId: "ana",
  scheduledAssigneeId: null,
  scheduleSegments: null,
  startDate: null,
  dueDate: null,
  ...values,
});

describe("workReservations", () => {
  it("reserves planned segments, not the span around them", () => {
    expect(
      workReservations(
        [
          work({
            userId: "bo",
            scheduledAssigneeId: "ana",
            startDate: at("2026-11-16T09:00:00Z"),
            dueDate: at("2026-11-18T17:00:00Z"),
            scheduleSegments: [
              {
                start: "2026-11-16T09:00:00.000Z",
                end: "2026-11-16T12:00:00.000Z",
              },
              {
                start: "2026-11-18T09:00:00.000Z",
                end: "2026-11-18T17:00:00.000Z",
              },
            ],
          }),
        ],
        "ana",
      ),
    ).toEqual([
      { start: at("2026-11-16T09:00:00Z"), end: at("2026-11-16T12:00:00Z") },
      { start: at("2026-11-18T09:00:00Z"), end: at("2026-11-18T17:00:00Z") },
    ]);
  });

  it("reserves the span of unplanned work given both dates", () => {
    const span = {
      startDate: at("2026-11-16T00:00:00Z"),
      dueDate: at("2026-11-17T00:00:00Z"),
    };
    expect(
      workReservations([work({ ...span, scheduleSegments: [] })], "ana"),
    ).toEqual([{ start: span.startDate, end: span.dueDate }]);
  });

  it("reserves nothing for a due date alone or an empty span", () => {
    const day = at("2026-11-16T00:00:00Z");
    expect(
      workReservations(
        [
          work({ dueDate: day }),
          work({ startDate: day }),
          work({ startDate: day, dueDate: day }),
        ],
        "ana",
      ),
    ).toEqual([]);
  });

  it("skips work someone else holds", () => {
    const span = {
      startDate: at("2026-11-16T00:00:00Z"),
      dueDate: at("2026-11-17T00:00:00Z"),
    };
    expect(
      workReservations(
        [
          work({ ...span, userId: "bo" }),
          // Planned for Bo until the next Apply, though assigned to Ana.
          work({
            ...span,
            scheduledAssigneeId: "bo",
            scheduleSegments: [
              {
                start: "2026-11-16T09:00:00.000Z",
                end: "2026-11-16T17:00:00.000Z",
              },
            ],
          }),
        ],
        "ana",
      ),
    ).toEqual([]);
  });
});
