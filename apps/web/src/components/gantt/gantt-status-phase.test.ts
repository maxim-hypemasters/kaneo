import { describe, expect, it } from "vite-plus/test";
import { ganttStatusPhase } from "./gantt-status-phase";

const columns = [
  { slug: "to-do", isFinal: false },
  { slug: "in-progress", isFinal: false },
  { slug: "in-review", isFinal: false },
  { slug: "done", isFinal: true },
];

describe("Gantt status phase", () => {
  it("reads to do, in progress and done from the default workflow", () => {
    expect(ganttStatusPhase("to-do", columns)).toBe("todo");
    expect(ganttStatusPhase("in-progress", columns)).toBe("active");
    expect(ganttStatusPhase("in-review", columns)).toBe("active");
    expect(ganttStatusPhase("done", columns)).toBe("done");
  });

  it("follows a custom workflow's first and final columns", () => {
    const custom = [
      { slug: "inbox", isFinal: false },
      { slug: "building", isFinal: false },
      { slug: "shipped", isFinal: true },
      { slug: "wont-do", isFinal: true },
    ];
    expect(ganttStatusPhase("inbox", custom)).toBe("todo");
    expect(ganttStatusPhase("building", custom)).toBe("active");
    expect(ganttStatusPhase("shipped", custom)).toBe("done");
    expect(ganttStatusPhase("wont-do", custom)).toBe("done");
  });

  it("treats planned work as to do, and unknown statuses as in progress", () => {
    expect(ganttStatusPhase("planned", columns)).toBe("todo");
    expect(ganttStatusPhase("mystery", undefined)).toBe("active");
  });
});
