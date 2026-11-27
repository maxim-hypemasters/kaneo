import { describe, expect, it } from "vite-plus/test";
import { readyPullRequestBody } from "./ready-pull-request-body";
import { START_MARKER } from "./start-marker";

const startText =
  "Work on [HUB-7](http://kaneo/task/t1) started from Kaneo; no changes yet.";

describe("readyPullRequestBody", () => {
  it("replaces Start's untouched body with the Ship's", () => {
    expect(
      readyPullRequestBody({
        current: `${startText}\n\n${START_MARKER}`,
        startText,
        shipBody: "Fixed it.",
      }),
    ).toBe("Fixed it.");
  });

  it("keeps what people wrote on the draft, ahead of the Ship's body", () => {
    expect(
      readyPullRequestBody({
        current: `${startText}\r\n\r\nDesign note: keep the old endpoint.\r\n- [ ] Check mobile\r\n\r\n${START_MARKER}`,
        startText,
        shipBody: "Fixed it.",
      }),
    ).toBe(
      "Design note: keep the old endpoint.\r\n- [ ] Check mobile\n\n---\n\nFixed it.",
    );
  });

  it("keeps a rewritten description whole when Start's sentence is gone", () => {
    expect(
      readyPullRequestBody({
        current: `Plan: split the form first.\n${START_MARKER}`,
        startText,
        shipBody: "Fixed it.",
      }),
    ).toBe("Plan: split the form first.\n\n---\n\nFixed it.");
  });
});
