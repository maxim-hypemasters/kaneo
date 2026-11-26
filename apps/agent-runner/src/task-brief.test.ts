import { describe, expect, it } from "vite-plus/test";
import { buildAssessPrompt } from "./assess/build-assess-prompt";
import type { RunContext } from "./kaneo/client";
import { buildShipPrompt } from "./ship/build-ship-prompt";

const context: RunContext = {
  task: {
    id: "t1",
    ticketId: "HUB-7",
    type: "bug",
    title: "Login fails",
    description: "Steps: open /login",
    priority: "high",
    status: "To Do",
    labels: ["auth"],
    url: "http://kaneo/task/t1",
  },
  comments: [{ author: "Mo", content: "Only on Firefox", createdAt: "x" }],
  clarifications: [{ question: "Which version?", answer: "ESR" }],
  relatedTasks: [{ ticketId: "HUB-2", title: "Auth epic", relation: "blocks" }],
  project: {
    name: "Hub",
    repository: "acme/app",
    baseBranch: "main",
    instructions: "Run pnpm test.",
  },
  branchName: "hub-7",
  resultSchema: { type: "object" },
};

describe("prompts", () => {
  it("assess prompt carries the task, decisions, rubric and schema", () => {
    const prompt = buildAssessPrompt(context, { hasCode: true });
    for (const part of [
      "HUB-7 (bug)",
      "Steps: open /login",
      "Q: Which version?",
      "Mo: <<<",
      "HUB-2 (blocks)",
      "Run pnpm test.",
      "expected_actual",
      '{"type":"object"}',
    ])
      expect(prompt).toContain(part);
  });

  it("assess prompt says when there is no code", () => {
    expect(buildAssessPrompt(context, { hasCode: false })).toContain(
      "No repository is available",
    );
  });

  it("ship prompt forbids pushing and explains needs_input", () => {
    const prompt = buildShipPrompt(context, {
      branch: "hub-7",
      continued: false,
    });
    expect(prompt).toContain("new branch hub-7 from main");
    expect(prompt).toContain("Do not push");
    expect(prompt).toContain('"needs_input"');
    expect(
      buildShipPrompt(context, { branch: "hub-7", continued: true }),
    ).toContain("continues the existing branch hub-7");
  });
});
