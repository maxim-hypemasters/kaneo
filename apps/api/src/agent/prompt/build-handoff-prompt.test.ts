import { describe, expect, it } from "vite-plus/test";
import type { TaskContext } from "../../agent-runner/controllers/build-task-context";
import { buildHandoffPrompt } from "./build-handoff-prompt";

const context: TaskContext = {
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
};

describe("buildHandoffPrompt", () => {
  it("names the repository, branch and pull request title", () => {
    const prompt = buildHandoffPrompt(context, { includeInstructions: true });
    for (const part of [
      "HUB-7 in the acme/app repository",
      "branch hub-7",
      "create it from main",
      'title "HUB-7: Login fails"',
      "Read AGENTS.md",
    ])
      expect(prompt).toContain(part);
  });

  it("carries the brief: description, decisions, comments, related tasks", () => {
    const prompt = buildHandoffPrompt(context, { includeInstructions: true });
    for (const part of [
      "Ticket: HUB-7 (bug)",
      "<<<\nSteps: open /login\n>>>",
      "Q: Which version?\n  A: ESR",
      "Mo: <<<",
      "HUB-2 (blocks): Auth epic",
    ])
      expect(prompt).toContain(part);
  });

  it("includes project instructions only for settings managers", () => {
    expect(
      buildHandoffPrompt(context, { includeInstructions: true }),
    ).toContain("Run pnpm test.");
    const withheld = buildHandoffPrompt(context, {
      includeInstructions: false,
    });
    expect(withheld).not.toContain("Run pnpm test.");
    expect(withheld).not.toContain("Project instructions");
  });

  it("has none of the runner's Hermes rules", () => {
    const prompt = buildHandoffPrompt(context, { includeInstructions: true });
    expect(prompt).not.toContain("needs_input");
    expect(prompt).not.toContain("Do not push");
    expect(prompt).not.toContain("Hermes");
  });

  it("works without a repository", () => {
    const prompt = buildHandoffPrompt(
      { ...context, project: { ...context.project, repository: null } },
      { includeInstructions: false },
    );
    expect(prompt).toMatch(/^You are working on HUB-7\. /);
  });
});
