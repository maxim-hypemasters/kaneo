import { describe, expect, it } from "vite-plus/test";
import { makeUi } from "../render/ui.js";
import { stringWidth } from "../render/width.js";
import { toReleaseJson } from "./release-json.js";
import { renderReleaseList } from "./render-release-list.js";
import { releaseFixture } from "./test-releases.js";

const ui = (columns: number) =>
  makeUi({
    color: 0,
    unicode: true,
    hyperlinks: false,
    animate: false,
    columns,
  });

const today = "2026-10-21";
const context = {
  today,
  webUrl: "https://kaneo.test",
  project: { slug: "kan", workspaceId: "ws_1" },
};
const progress = (total: number, completed: number, unfinished: number) => ({
  tasks: { total, completed },
  features: { total: 0, completed: 0 },
  unfinished,
});

const view = {
  projectName: "Kaneo Web",
  projectSlug: "kan",
  projectUrl: "https://kaneo.test/p",
  today,
  releases: [
    releaseFixture("r1", "2.4", { progress: progress(30, 12, 18) }),
    releaseFixture("r2", "2.5 Winter launch", {
      startDate: "2026-10-25",
      codeFreezeDate: "2026-11-20",
      submissionDate: "2027-01-05",
      progress: progress(4, 0, 4),
    }),
    releaseFixture("r0", "2.3", {
      startDate: "2026-09-01",
      codeFreezeDate: "2026-09-20",
      submissionDate: "2026-09-24",
      progress: progress(8, 8, 0),
    }),
  ].map((release) => toReleaseJson(release, context)),
};

describe("renderReleaseList", () => {
  it("shows each release's phase, dates and progress at 120 columns", () => {
    expect(renderReleaseList(ui(120), view)).toEqual([
      "",
      "  Kaneo Web · KAN",
      "",
      "    Release            Phase            Start   Freeze  Submission   Tasks  Unfinished",
      "    2.4                code freeze      Oct 1   Oct 20  Oct 24       12/30          18",
      "    2.5 Winter launch  upcoming         Oct 25  Nov 20  Jan 5, 2027    0/4           4",
      "    2.3                past submission  Sep 1   Sep 20  Sep 24         8/8           0",
      "",
    ]);
  });

  it("keeps the phase and submission date in narrow terminals", () => {
    const lines = renderReleaseList(ui(50), view);
    for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(50);
    expect(lines[3]).toContain("Submission");
    expect(lines[6]).toContain("past submission");
  });

  it("says how to create the first release", () => {
    expect(renderReleaseList(ui(80), { ...view, releases: [] })).toEqual([
      "",
      "  Kaneo Web · KAN",
      "",
      "  No releases yet. Create one with kaneo release create <name>.",
      "",
    ]);
  });
});
