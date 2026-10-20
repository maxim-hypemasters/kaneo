import { describe, expect, it } from "vite-plus/test";
import { buildFullTaskUpdateBody } from "./task-helpers.js";

describe("buildFullTaskUpdateBody", () => {
  it("updates Feature knowledge fields without synthesizing planning values", () => {
    expect(
      buildFullTaskUpdateBody(
        {
          type: "feature",
          title: "Knowledge",
          description: "Old",
          projectId: "p",
          position: null,
          status: null,
          priority: null,
        },
        { description: "New" },
      ),
    ).toEqual({ title: "Knowledge", description: "New", projectId: "p" });
    expect(() =>
      buildFullTaskUpdateBody(
        { type: "feature", title: "Knowledge", projectId: "p", position: 1 },
        { status: "done" },
      ),
    ).toThrow("Features are knowledge records");
  });
  it("merges patch onto existing task", () => {
    // Arrange
    const original = {
      title: "T",
      description: "D",
      status: "open",
      priority: "low",
      projectId: "p1",
      position: 1,
      userId: "u1",
    };
    const patch = { status: "done" as const };

    // Act
    const body = buildFullTaskUpdateBody(original, patch);

    // Assert
    expect(body.status).toBe("done");
    expect(body.title).toBe("T");
    expect(body.position).toBe(1);
  });
});
