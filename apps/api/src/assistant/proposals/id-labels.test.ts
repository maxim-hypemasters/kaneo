import type { ToolClient } from "@kaneo/mcp/tools";
import { describe, expect, it } from "vite-plus/test";
import { createIdLabels } from "./id-labels";

const RESPONSES: Record<string, unknown> = {
  "/api/project/p1": { id: "p1", name: "Mobile", slug: "mob" },
  "/api/task/t1": { id: "t1", title: "Fix login", number: 12, projectId: "p1" },
  "/api/task/t2": { id: "t2", title: "Orphan", number: 3, projectId: "gone" },
  "/api/milestone/m1": { id: "m1", title: "Beta" },
  "/api/release/r1": { id: "r1", name: "2.1" },
  "/api/workspace/ws/members": [
    { id: "u1", name: "Ada", email: "ada@example.com" },
  ],
  "/api/label/workspace/ws": [{ id: "l1", name: "urgent" }],
  "/api/project-document/d1": { id: "d1", title: "Handbook" },
  "/api/feature/f1/documents/doc1": { id: "doc1", title: "Spec" },
  "/api/custom-field/project/p1": [{ id: "cf1", name: "Severity" }],
};

function fakeClient() {
  const calls: string[] = [];
  const client: ToolClient = {
    async json<T>(path: string) {
      calls.push(path);
      if (!(path in RESPONSES)) throw new Error(`${path}: Not found`);
      return RESPONSES[path] as T;
    },
  };
  return { client, calls };
}

describe("createIdLabels", () => {
  it("names each kind of id", async () => {
    const labels = createIdLabels(fakeClient().client, "ws");
    const cases: [string, string, Record<string, unknown>, string][] = [
      ["projectId", "p1", {}, "Mobile"],
      ["taskId", "t1", {}, "MOB-12 Fix login"],
      ["featureId", "t1", {}, "MOB-12 Fix login"],
      ["milestoneId", "m1", {}, "Beta"],
      ["releaseId", "r1", {}, "2.1"],
      ["userId", "u1", {}, "Ada"],
      ["leadId", "u1", {}, "Ada"],
      ["labelId", "l1", {}, "urgent"],
      ["pageId", "d1", {}, "Handbook"],
      ["parentId", "d1", {}, "Handbook"],
      ["documentId", "doc1", { featureId: "f1" }, "Spec"],
      ["fieldId", "cf1", { taskId: "t1" }, "Severity"],
      ["fieldId", "cf1", { projectId: "p1" }, "Severity"],
    ];
    for (const [key, id, args, label] of cases)
      expect(await labels.label(key, id, args)).toBe(label);
  });

  it("falls back to the id when a lookup fails", async () => {
    const labels = createIdLabels(fakeClient().client, "ws");
    expect(await labels.label("projectId", "nope", {})).toBe("nope");
    expect(await labels.label("userId", "u9", {})).toBe("u9");
    expect(await labels.label("documentId", "doc1", {})).toBe("doc1");
    expect(await labels.label("title", "x", {})).toBe("x");
  });

  it("names a task by its title when its project can't be read", async () => {
    const labels = createIdLabels(fakeClient().client, "ws");
    expect(await labels.task("t2")).toEqual({
      id: "t2",
      ticket: null,
      title: "Orphan",
      projectId: "gone",
      label: "Orphan",
    });
    expect(await labels.task("t9")).toBeNull();
  });

  it("reads each path once unless asked for a fresh copy", async () => {
    const { client, calls } = fakeClient();
    const labels = createIdLabels(client, "ws");
    await labels.label("taskId", "t1", {});
    await labels.label("taskId", "t1", {});
    expect(calls).toEqual(["/api/task/t1", "/api/project/p1"]);
    await labels.load("/api/task/t1", { fresh: true });
    expect(calls.at(-1)).toBe("/api/task/t1");
    expect(calls).toHaveLength(3);
  });

  it("rejects a load with the API's error", async () => {
    const labels = createIdLabels(fakeClient().client, "ws");
    await expect(labels.load("/api/task/missing")).rejects.toThrow(
      "/api/task/missing: Not found",
    );
  });
});
