import type { CardLink } from "./card-links.js";

export type FeaturePlan = {
  // Card -> the card whose feature it joins. Every value becomes a feature.
  readonly featureOf: ReadonlyMap<string, string>;
  // Links kept as related ones.
  readonly related: readonly CardLink[];
};

const pairKey = (left: string, right: string) =>
  left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;

// Kaneo has two levels, a feature and its tasks, and a task has one feature.
// The first link to a card makes it a task of its parent's feature; further
// parents become related links. Deeper levels join the top card's feature,
// keeping the link to their own parent as a related one, the way Kaneo
// converted existing subtasks. A link that would close a loop is related.
export function planFeatures(links: readonly CardLink[]): FeaturePlan {
  const seen = new Set<string>();
  const parentOf = new Map<string, string>();
  const kept: CardLink[] = [];
  const related: CardLink[] = [];

  const isAncestor = (ancestor: string, card: string | undefined): boolean =>
    card !== undefined &&
    (card === ancestor || isAncestor(ancestor, parentOf.get(card)));
  const topOf = (card: string): string => {
    const parent = parentOf.get(card);
    return parent ? topOf(parent) : card;
  };

  for (const link of links) {
    const { parentCardId, childCardId } = link;
    const key = pairKey(parentCardId, childCardId);
    if (parentCardId === childCardId || seen.has(key)) continue;
    seen.add(key);
    if (parentOf.has(childCardId) || isAncestor(childCardId, parentCardId)) {
      related.push(link);
    } else {
      parentOf.set(childCardId, parentCardId);
      kept.push(link);
    }
  }

  const featureOf = new Map<string, string>();
  for (const link of kept) {
    const feature = topOf(link.parentCardId);
    featureOf.set(link.childCardId, feature);
    if (feature !== link.parentCardId) related.push(link);
  }

  return { featureOf, related };
}
