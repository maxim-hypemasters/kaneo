import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vite-plus/test";
import {
  assertTriageTransition,
  routeCreationStatus,
  TRIAGE_STATUS,
} from "./triage-status";

function statusOf(run: () => void) {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof HTTPException ? error.status : "other";
  }
}

describe("routeCreationStatus", () => {
  it.each(["task", "bug"])(
    "sends a %s from someone outside triage to Triage",
    (type) => {
      expect(
        routeCreationStatus({
          type,
          requested: "in-progress",
          triageEnabled: true,
          isMember: false,
        }),
      ).toBe(TRIAGE_STATUS);
    },
  );

  it("keeps the requested status for triage members", () => {
    expect(
      routeCreationStatus({
        type: "bug",
        requested: "in-progress",
        triageEnabled: true,
        isMember: true,
      }),
    ).toBe("in-progress");
  });

  it("keeps the requested status when triage is off", () => {
    expect(
      routeCreationStatus({
        type: "task",
        requested: undefined,
        triageEnabled: false,
        isMember: false,
      }),
    ).toBeUndefined();
  });

  it("never routes features", () => {
    expect(
      routeCreationStatus({
        type: "feature",
        requested: undefined,
        triageEnabled: true,
        isMember: false,
      }),
    ).toBeUndefined();
  });
});

describe("assertTriageTransition", () => {
  it("allows ordinary moves and resending the current status", () => {
    expect(statusOf(() => assertTriageTransition("to-do", "done"))).toBeNull();
    expect(
      statusOf(() => assertTriageTransition(TRIAGE_STATUS, TRIAGE_STATUS)),
    ).toBeNull();
    expect(
      statusOf(() => assertTriageTransition(TRIAGE_STATUS, undefined)),
    ).toBeNull();
  });

  it("refuses to leave triage outside Accept and Decline", () => {
    expect(statusOf(() => assertTriageTransition(TRIAGE_STATUS, "to-do"))).toBe(
      409,
    );
    expect(
      statusOf(() => assertTriageTransition(TRIAGE_STATUS, "archived")),
    ).toBe(409);
  });

  it("refuses to set triage directly", () => {
    expect(statusOf(() => assertTriageTransition("to-do", TRIAGE_STATUS))).toBe(
      400,
    );
    expect(statusOf(() => assertTriageTransition(null, TRIAGE_STATUS))).toBe(
      400,
    );
  });
});
