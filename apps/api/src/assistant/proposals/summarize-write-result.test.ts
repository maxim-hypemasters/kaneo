import { describe, expect, it } from "vite-plus/test";
import {
  summarizeWriteResult,
  type WriteSummaryContext,
  writtenTaskId,
} from "./summarize-write-result";

const ctx = (
  task: WriteSummaryContext["task"] = null,
): WriteSummaryContext => ({
  workspaceId: "ws_1",
  workspaceSlug: "acme",
  task,
});
const loginTask = { ticket: "KAN-42", title: "Fix login", projectId: "p1" };

describe("summarizeWriteResult", () => {
  it("names a created or changed task with its permalink", () => {
    expect(
      summarizeWriteResult("create_task", {}, { id: "t1" }, ctx(loginTask)),
    ).toEqual({ label: "Created KAN-42 Fix login", href: "/acme/task/KAN-42" });
    expect(
      summarizeWriteResult("update_task_status", {}, {}, ctx(loginTask)),
    ).toEqual({ label: "Updated KAN-42 Fix login", href: "/acme/task/KAN-42" });
    expect(
      summarizeWriteResult("create_task_comment", {}, {}, ctx(loginTask)),
    ).toEqual({
      label: "Commented on KAN-42 Fix login",
      href: "/acme/task/KAN-42",
    });
  });

  it("names a task without a link when its ticket is unknown", () => {
    expect(
      summarizeWriteResult(
        "update_task",
        {},
        {},
        ctx({ ticket: null, title: "Fix login", projectId: "p1" }),
      ),
    ).toEqual({ label: "Updated Fix login", href: null });
  });

  it("links projects, releases and pages", () => {
    expect(
      summarizeWriteResult(
        "create_project",
        { name: "Mobile" },
        { id: "p9", name: "Mobile" },
        ctx(),
      ),
    ).toEqual({
      label: "Created project Mobile",
      href: "/dashboard/workspace/ws_1/project/p9",
    });
    expect(
      summarizeWriteResult(
        "create_release",
        {},
        { id: "r1", projectId: "p1", name: "2.1" },
        ctx(),
      ),
    ).toEqual({
      label: "Created release 2.1",
      href: "/dashboard/workspace/ws_1/project/p1/releases/r1",
    });
    expect(
      summarizeWriteResult(
        "update_project_page",
        { pageId: "d1" },
        { id: "d1", projectId: "p1", title: "Onboarding" },
        ctx(),
      ),
    ).toEqual({
      label: "Updated page Onboarding",
      href: "/dashboard/workspace/ws_1/project/p1?tab=documents&documentId=d1",
    });
  });

  it("links a Feature document through its Feature's project", () => {
    expect(
      summarizeWriteResult(
        "create_feature_document",
        { featureId: "f1" },
        { id: "doc1", featureId: "f1", title: "Spec" },
        ctx({ ticket: "KAN-3", title: "Payments", projectId: "p1" }),
      ),
    ).toEqual({
      label: "Created document Spec",
      href: "/dashboard/workspace/ws_1/project/p1?tab=documents&documentId=doc1&documentFeatureId=f1",
    });
  });

  it("falls back to Done", () => {
    expect(summarizeWriteResult("create_task", {}, {}, ctx())).toEqual({
      label: "Done",
      href: null,
    });
    expect(summarizeWriteResult("create_release", {}, null, ctx())).toEqual({
      label: "Done",
      href: null,
    });
    expect(summarizeWriteResult("unknown_tool", {}, {}, ctx())).toEqual({
      label: "Done",
      href: null,
    });
  });

  it("cuts a very long label", () => {
    const { label } = summarizeWriteResult(
      "update_task",
      {},
      {},
      ctx({ ticket: "KAN-1", title: "x".repeat(400), projectId: "p1" }),
    );
    expect(label.length).toBe(200);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("writtenTaskId", () => {
  it("finds the task a write changed or created", () => {
    expect(writtenTaskId("create_task", { projectId: "p" }, { id: "t1" })).toBe(
      "t1",
    );
    expect(writtenTaskId("update_task", { taskId: "t2" }, {})).toBe("t2");
    expect(
      writtenTaskId("create_task_relation", { sourceTaskId: "t3" }, {}),
    ).toBe("t3");
    expect(writtenTaskId("update_milestone", {}, { featureId: "f1" })).toBe(
      "f1",
    );
    expect(
      writtenTaskId("create_project", { name: "x" }, { id: "p" }),
    ).toBeNull();
  });
});
