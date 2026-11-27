import { describe, expect, it } from "vite-plus/test";
import { buildAssessPrompt } from "./assess/build-assess-prompt";
import type { PlanningContext } from "./assess/planning-brief";
import type { RunContext } from "./kaneo/client";
import type { BranchState } from "./repo/branch-state";
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
  planning: null,
};

const planning: PlanningContext = {
  missing: ["assignee", "estimate", "test_cases"],
  estimateDayMinutes: 420,
  people: [{ id: "u1", name: "Ada", openTasks: 3 }],
  features: [
    { id: "f1", title: "Auth", milestones: [{ id: "m1", title: "Beta" }] },
  ],
  releases: [{ id: "r1", name: "2.0", submissionDate: "2026-12-01" }],
  testCaseTarget: "bug",
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

  it("assess prompt asks for no checklist or summary", () => {
    for (const hasCode of [true, false])
      expect(buildAssessPrompt(context, { hasCode })).not.toMatch(
        /checklist|summary/i,
      );
  });

  it("assess prompt hands over the planning candidates and their rules only when Kaneo sends them", () => {
    expect(buildAssessPrompt(context, { hasCode: true })).not.toContain(
      "recommendations",
    );
    const prompt = buildAssessPrompt(
      { ...context, planning },
      { hasCode: true },
    );
    expect(prompt).toContain(`\`\`\`json\n${JSON.stringify(planning)}\n\`\`\``);
    for (const rule of [
      'Fill only the kinds in "missing"',
      "at most one pick per kind",
      "Use only ids listed above",
      "one working day is 420 minutes",
      'give 2 to 5 concrete "testCases.cases"',
      'Each "reason" is at most 200 characters, names nobody but the person picked, and never quotes other tasks.',
    ])
      expect(prompt).toContain(rule);
    expect(prompt).not.toMatch(/checklist|summary/i);
  });

  it("assess prompt says when there is no code, without lowering the score for it", () => {
    const prompt = buildAssessPrompt(context, { hasCode: false });
    expect(prompt).toContain(
      "No repository is available, so judge from the task alone.",
    );
    expect(prompt).not.toMatch(/lower the score/i);
  });

  it("ship prompt forbids pushing and explains needs_input", () => {
    const prompt = buildShipPrompt(context, {
      branch: "hub-7",
      branchState: "new",
    });
    expect(prompt).toContain("new branch hub-7 from main");
    expect(prompt).toContain("Do not push");
    expect(prompt).toContain('"needs_input"');
  });

  it("ship prompt says what the branch already holds", () => {
    const start = (branchState: BranchState) =>
      buildShipPrompt(context, { branch: "hub-7", branchState });
    expect(start("continued")).toContain(
      "It continues the existing branch hub-7, which already has earlier work on this task; build on it.",
    );
    expect(start("empty")).toContain(
      "It is on the branch hub-7, started from main, with no work on it yet.",
    );
    expect(start("empty")).not.toContain("earlier work");
  });
});
