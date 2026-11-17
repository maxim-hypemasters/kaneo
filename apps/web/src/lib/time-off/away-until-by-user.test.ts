import { describe, expect, it } from "vite-plus/test";
import { awayUntilByUser } from "./away-until-by-user";

const entry = (
  userId: string,
  startDate: string,
  endDate: string,
  status?: string,
) => ({ id: `${userId}-${startDate}`, userId, startDate, endDate, status });

// 2026-11-18 is a Wednesday.
const today = "2026-11-18";

describe("awayUntilByUser", () => {
  it("returns the last day for members away today", () => {
    expect(
      awayUntilByUser([entry("ana", "2026-11-16", "2026-11-19")], today),
    ).toEqual(new Map([["ana", "2026-11-19"]]));
  });

  it("counts the first and last day as away", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-18", "2026-11-20"),
          entry("ben", "2026-11-10", "2026-11-18"),
        ],
        today,
      ),
    ).toEqual(
      new Map([
        ["ana", "2026-11-20"],
        ["ben", "2026-11-18"],
      ]),
    );
  });

  it("leaves out members whose time off is over or still ahead", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-09", "2026-11-17"),
          entry("ben", "2026-11-19", "2026-11-27"),
        ],
        today,
      ).size,
    ).toBe(0);
  });

  it("keeps approved and status-less entries only", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-20", "pending"),
          entry("ben", "2026-11-16", "2026-11-20", "declined"),
          entry("cy", "2026-11-16", "2026-11-20", "cancelled"),
          entry("dee", "2026-11-16", "2026-11-20", "approved"),
          entry("eli", "2026-11-16", "2026-11-20"),
        ],
        today,
      ),
    ).toEqual(
      new Map([
        ["dee", "2026-11-20"],
        ["eli", "2026-11-20"],
      ]),
    );
  });

  it("chains the next entry when it starts the following day", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-19", "2026-11-24"),
          entry("ana", "2026-11-16", "2026-11-18"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-11-24"]]));
  });

  it("chains across a weekend gap", () => {
    // Friday 2026-11-20, then Monday 2026-11-23.
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-20"),
          entry("ana", "2026-11-23", "2026-11-25"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-11-25"]]));
  });

  it("chains an entry that ends on Saturday into the next Monday", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-21"),
          entry("ana", "2026-11-23", "2026-11-24"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-11-24"]]));
  });

  it("stops at a gap that includes a weekday", () => {
    // Back at work on Friday 2026-11-20.
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-19"),
          entry("ana", "2026-11-23", "2026-11-25"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-11-19"]]));
  });

  it("chains several entries, and stops at the first real gap", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-20"),
          entry("ana", "2026-11-23", "2026-11-27"),
          entry("ana", "2026-11-30", "2026-12-01"),
          entry("ana", "2026-12-03", "2026-12-04"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-12-01"]]));
  });

  it("chains across a month boundary", () => {
    // Friday 2027-01-29, then Monday 2027-02-01.
    expect(
      awayUntilByUser(
        [
          entry("ana", "2027-01-25", "2027-01-29"),
          entry("ana", "2027-02-01", "2027-02-03"),
        ],
        "2027-01-27",
      ),
    ).toEqual(new Map([["ana", "2027-02-03"]]));
    expect(
      awayUntilByUser(
        [
          entry("ben", "2026-11-25", "2026-11-30"),
          entry("ben", "2026-12-01", "2026-12-02"),
        ],
        "2026-11-30",
      ),
    ).toEqual(new Map([["ben", "2026-12-02"]]));
  });

  it("chains across a year boundary", () => {
    // Thursday 2026-12-31, then Friday 2027-01-01.
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-12-28", "2026-12-31"),
          entry("ana", "2027-01-01", "2027-01-08"),
        ],
        "2026-12-30",
      ),
    ).toEqual(new Map([["ana", "2027-01-08"]]));
  });

  it("does not chain through a pending entry", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-19", "approved"),
          entry("ana", "2026-11-20", "2026-11-20", "pending"),
          entry("ana", "2026-11-23", "2026-11-25", "approved"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-11-19"]]));
  });

  it("keeps each member's stretch separate", () => {
    expect(
      awayUntilByUser(
        [
          entry("ana", "2026-11-16", "2026-11-18"),
          entry("ben", "2026-11-19", "2026-11-30"),
        ],
        today,
      ),
    ).toEqual(new Map([["ana", "2026-11-18"]]));
  });
});
