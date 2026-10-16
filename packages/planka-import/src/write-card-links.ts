import type { KaneoClient } from "./kaneo.js";
import type { FeaturePlan } from "./plan-features.js";

const pairKey = (left: string, right: string) =>
  left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Puts each linked card into its feature and creates the related links. Runs
// once every card is a task. Each link that fails becomes a warning instead of
// failing the board.
export async function writeCardLinks(input: {
  kaneo: KaneoClient;
  plan: FeaturePlan;
  taskIdByCardId: ReadonlyMap<string, string>;
  cardNames: ReadonlyMap<string, string>;
  // The server predates features: the cards are linked as related instead.
  withoutFeatures: boolean;
}): Promise<{ links: number; warnings: string[] }> {
  const { kaneo, plan, taskIdByCardId, cardNames, withoutFeatures } = input;
  const warnings: string[] = [];
  let links = 0;

  const memberships = [...plan.featureOf].flatMap(([cardId, featureCardId]) => {
    const taskId = taskIdByCardId.get(cardId);
    const featureId = taskIdByCardId.get(featureCardId);
    return taskId && featureId
      ? [{ cardId, featureCardId, taskId, featureId }]
      : [];
  });
  const related = plan.related.flatMap((link) => {
    const sourceTaskId = taskIdByCardId.get(link.parentCardId);
    const targetTaskId = taskIdByCardId.get(link.childCardId);
    return sourceTaskId && targetTaskId
      ? [{ name: link.name, sourceTaskId, targetTaskId }]
      : [];
  });

  if (withoutFeatures && memberships.length > 0) {
    warnings.push(
      `This Kaneo server has no features yet, so ${memberships.length} linked card(s) were imported as related tasks. Update Kaneo to import them into features.`,
    );
    const linked = new Set(
      related.map((link) => pairKey(link.sourceTaskId, link.targetTaskId)),
    );
    for (const membership of memberships) {
      if (linked.has(pairKey(membership.featureId, membership.taskId)))
        continue;
      related.push({
        name: cardNames.get(membership.cardId) ?? membership.cardId,
        sourceTaskId: membership.featureId,
        targetTaskId: membership.taskId,
      });
    }
  } else {
    for (const membership of memberships) {
      try {
        await kaneo.setTaskFeature(membership.taskId, membership.featureId);
        links++;
      } catch (error) {
        warnings.push(
          `Could not add "${cardNames.get(membership.cardId)}" to feature "${cardNames.get(membership.featureCardId)}": ${reason(error)}`,
        );
      }
    }
  }

  for (const link of related) {
    try {
      await kaneo.createTaskRelation({
        sourceTaskId: link.sourceTaskId,
        targetTaskId: link.targetTaskId,
        relationType: "related",
      });
      links++;
    } catch (error) {
      warnings.push(
        `Could not link "${link.name}" as a related task: ${reason(error)}`,
      );
    }
  }

  return { links, warnings };
}
