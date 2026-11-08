import { describe, expect, it } from "vite-plus/test";
import {
  activityResultTitle,
  activitySearchContent,
  activitySubjectOf,
} from "./activity-search-text";

describe("activitySubjectOf", () => {
  it("words Features as features and Tasks and Bugs as tasks", () => {
    expect(activitySubjectOf("feature")).toBe("feature");
    expect(activitySubjectOf("task")).toBe("task");
    expect(activitySubjectOf("bug")).toBe("task");
    expect(activitySubjectOf(null)).toBe("task");
  });
});

describe("activityResultTitle", () => {
  it("names comments, updates and creation readably", () => {
    expect(activityResultTitle("comment", "Checkout", "feature")).toBe(
      "Comment on Checkout",
    );
    expect(activityResultTitle("feature_update", "Checkout", "feature")).toBe(
      "Update on Checkout",
    );
    expect(activityResultTitle("created", "Checkout", "feature")).toBe(
      "Created Checkout",
    );
  });

  it("never shows a raw event type", () => {
    expect(activityResultTitle("status_changed", "Fix login", "task")).toBe(
      "Status changed on Fix login",
    );
    expect(activityResultTitle("feature_archived", "Checkout", "feature")).toBe(
      "Feature archived on Checkout",
    );
  });

  it("falls back to the subject when the title is missing", () => {
    expect(activityResultTitle("comment", null, "feature")).toBe(
      "Comment on feature",
    );
  });
});

describe("activitySearchContent", () => {
  it("prefers stored content", () => {
    expect(
      activitySearchContent("feature_update", "Shipped beta", {}, "feature"),
    ).toBe("Shipped beta");
  });

  it("words creation and moves for the subject", () => {
    expect(activitySearchContent("task", null, null, "feature")).toBe(
      "created the feature",
    );
    expect(activitySearchContent("created", null, null, "task")).toBe(
      "created the task",
    );
    expect(
      activitySearchContent(
        "moved",
        null,
        { fromProjectName: "Web", toProjectName: "Mobile" },
        "feature",
      ),
    ).toBe('moved the feature from "Web" to "Mobile"');
    expect(
      activitySearchContent(
        "moved",
        null,
        { fromProjectName: null, toProjectName: "Mobile" },
        "task",
      ),
    ).toBe('moved the task from another project to "Mobile"');
  });

  it("describes type changes and Feature archiving", () => {
    expect(
      activitySearchContent("type_changed", null, { newType: "bug" }, "task"),
    ).toBe("changed the type to bug");
    expect(
      activitySearchContent("feature_archived", null, null, "feature"),
    ).toBe("archived the feature");
    expect(
      activitySearchContent("feature_unarchived", null, null, "feature"),
    ).toBe("restored the feature");
  });

  it("keeps the existing workflow wording", () => {
    expect(
      activitySearchContent(
        "status_changed",
        null,
        { oldStatus: "to-do", newStatus: "in-progress" },
        "task",
      ),
    ).toBe("changed status from To Do to In Progress");
    expect(
      activitySearchContent(
        "assignee_changed",
        null,
        { isSelfAssigned: true },
        "task",
      ),
    ).toBe("assigned the task to themselves");
  });

  it("has nothing to show for a redacted update", () => {
    expect(
      activitySearchContent(
        "feature_update",
        null,
        { redacted: true },
        "feature",
      ),
    ).toBeUndefined();
  });
});
