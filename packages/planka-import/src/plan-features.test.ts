import { describe, expect, it } from "vite-plus/test";
import type { CardLink } from "./card-links.js";
import { planFeatures } from "./plan-features.js";

const link = (parentCardId: string, childCardId: string): CardLink => ({
  parentCardId,
  childCardId,
  name: `${parentCardId}->${childCardId}`,
});

const pairs = (links: readonly CardLink[]) =>
  links.map((item) => [item.parentCardId, item.childCardId]);

describe("planFeatures", () => {
  it("puts linked cards into the feature of the card that links them", () => {
    const plan = planFeatures([link("a", "b"), link("a", "c")]);
    expect([...plan.featureOf]).toEqual([
      ["b", "a"],
      ["c", "a"],
    ]);
    expect(plan.related).toEqual([]);
  });

  it("keeps the first parent of a card as its feature and relates the rest", () => {
    const plan = planFeatures([link("a", "c"), link("b", "c")]);
    expect([...plan.featureOf]).toEqual([["c", "a"]]);
    expect(pairs(plan.related)).toEqual([["b", "c"]]);
  });

  it("flattens deeper levels into the top card's feature", () => {
    // b is linked from a, and links c itself: whatever the order, a is the
    // feature and b and c its tasks.
    for (const links of [
      [link("a", "b"), link("b", "c")],
      [link("b", "c"), link("a", "b")],
    ]) {
      const plan = planFeatures(links);
      expect(new Map(plan.featureOf)).toEqual(
        new Map([
          ["b", "a"],
          ["c", "a"],
        ]),
      );
      expect(pairs(plan.related)).toEqual([["b", "c"]]);
    }
  });

  it("never puts a feature into a feature", () => {
    const plan = planFeatures([link("a", "b"), link("b", "c"), link("c", "d")]);
    const features = new Set(plan.featureOf.values());
    expect([...features]).toEqual(["a"]);
    for (const feature of features) {
      expect(plan.featureOf.has(feature)).toBe(false);
    }
  });

  it("relates a link that would close a loop", () => {
    const plan = planFeatures([link("a", "b"), link("b", "c"), link("c", "a")]);
    expect(new Map(plan.featureOf)).toEqual(
      new Map([
        ["b", "a"],
        ["c", "a"],
      ]),
    );
    expect(pairs(plan.related)).toEqual([
      ["c", "a"],
      ["b", "c"],
    ]);
  });

  it("drops self links and repeated pairs, in either direction", () => {
    const plan = planFeatures([
      link("a", "a"),
      link("a", "b"),
      link("a", "b"),
      link("b", "a"),
    ]);
    expect([...plan.featureOf]).toEqual([["b", "a"]]);
    expect(plan.related).toEqual([]);
  });

  it("is empty without links", () => {
    const plan = planFeatures([]);
    expect(plan.featureOf.size).toBe(0);
    expect(plan.related).toEqual([]);
  });
});
