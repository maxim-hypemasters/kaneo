import { describe, expect, it } from "vite-plus/test";
import type { KaneoClient } from "./kaneo.js";
import type { FeaturePlan } from "./plan-features.js";
import { writeCardLinks } from "./write-card-links.js";

type Call = [string, ...unknown[]];

function fakeKaneo(calls: Call[], failing: ReadonlySet<string> = new Set()) {
  return {
    async setTaskFeature(taskId: string, featureId: string) {
      calls.push(["setTaskFeature", taskId, featureId]);
      if (failing.has(taskId)) throw new Error("Conflict");
      return { id: taskId, title: "t", number: 1, featureId };
    },
    async createTaskRelation(input: { targetTaskId: string }) {
      calls.push(["createTaskRelation", input]);
      if (failing.has(input.targetTaskId)) throw new Error("Conflict");
      return {};
    },
  } as unknown as KaneoClient;
}

// a is the feature of b and c; b also links c, and d links c.
const plan: FeaturePlan = {
  featureOf: new Map([
    ["b", "a"],
    ["c", "a"],
  ]),
  related: [
    { parentCardId: "b", childCardId: "c", name: "See c" },
    { parentCardId: "d", childCardId: "c", name: "Also c" },
  ],
};
const taskIdByCardId = new Map([
  ["a", "t_a"],
  ["b", "t_b"],
  ["c", "t_c"],
  ["d", "t_d"],
]);
const cardNames = new Map([
  ["a", "Onboarding"],
  ["b", "Welcome email"],
  ["c", "Signup form"],
  ["d", "Pricing page"],
]);

describe("writeCardLinks", () => {
  it("puts each card into its feature, then creates the related links", async () => {
    const calls: Call[] = [];
    const result = await writeCardLinks({
      kaneo: fakeKaneo(calls),
      plan,
      taskIdByCardId,
      cardNames,
      withoutFeatures: false,
    });

    expect(calls).toEqual([
      ["setTaskFeature", "t_b", "t_a"],
      ["setTaskFeature", "t_c", "t_a"],
      [
        "createTaskRelation",
        { sourceTaskId: "t_b", targetTaskId: "t_c", relationType: "related" },
      ],
      [
        "createTaskRelation",
        { sourceTaskId: "t_d", targetTaskId: "t_c", relationType: "related" },
      ],
    ]);
    expect(result).toEqual({ links: 4, warnings: [] });
  });

  it("never creates subtask relations", async () => {
    const calls: Call[] = [];
    await writeCardLinks({
      kaneo: fakeKaneo(calls),
      plan,
      taskIdByCardId,
      cardNames,
      withoutFeatures: false,
    });
    expect(JSON.stringify(calls)).not.toContain("subtask");
  });

  it("turns each failed link into a warning and carries on", async () => {
    const calls: Call[] = [];
    const result = await writeCardLinks({
      kaneo: fakeKaneo(calls, new Set(["t_b", "t_c"])),
      plan,
      taskIdByCardId,
      cardNames,
      withoutFeatures: false,
    });

    expect(calls).toHaveLength(4);
    expect(result.links).toBe(0);
    expect(result.warnings).toEqual([
      'Could not add "Welcome email" to feature "Onboarding": Conflict',
      'Could not add "Signup form" to feature "Onboarding": Conflict',
      'Could not link "See c" as a related task: Conflict',
      'Could not link "Also c" as a related task: Conflict',
    ]);
  });

  it("skips cards that were not imported", async () => {
    const calls: Call[] = [];
    const result = await writeCardLinks({
      kaneo: fakeKaneo(calls),
      plan,
      taskIdByCardId: new Map([["b", "t_b"]]),
      cardNames,
      withoutFeatures: false,
    });
    expect(calls).toEqual([]);
    expect(result).toEqual({ links: 0, warnings: [] });
  });

  it("links the cards as related on a server without features", async () => {
    const calls: Call[] = [];
    const result = await writeCardLinks({
      kaneo: fakeKaneo(calls),
      plan,
      taskIdByCardId,
      cardNames,
      withoutFeatures: true,
    });

    expect(calls.map((call) => call[0])).not.toContain("setTaskFeature");
    expect(
      calls.map((call) => {
        const input = call[1] as { sourceTaskId: string; targetTaskId: string };
        return [input.sourceTaskId, input.targetTaskId];
      }),
    ).toEqual([
      ["t_b", "t_c"],
      ["t_d", "t_c"],
      ["t_a", "t_b"],
      ["t_a", "t_c"],
    ]);
    expect(result.links).toBe(4);
    expect(result.warnings).toEqual([
      "This Kaneo server has no features yet, so 2 linked card(s) were imported as related tasks. Update Kaneo to import them into features.",
    ]);
  });

  it("does not repeat a related link on a server without features", async () => {
    const calls: Call[] = [];
    await writeCardLinks({
      kaneo: fakeKaneo(calls),
      plan: {
        featureOf: new Map([["c", "a"]]),
        related: [{ parentCardId: "c", childCardId: "a", name: "Back to a" }],
      },
      taskIdByCardId,
      cardNames,
      withoutFeatures: true,
    });
    expect(calls).toHaveLength(1);
  });
});
