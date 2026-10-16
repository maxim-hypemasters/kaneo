import type { PlankaTask, PlankaTaskList } from "@kaneo/importers/planka";

// A checklist item linked to another card: the linked card belongs under the
// card holding the checklist.
export type CardLink = {
  readonly parentCardId: string;
  readonly childCardId: string;
  readonly name: string;
};

// The linked checklist items between imported cards, in PLANKA's order.
// Links to cards that aren't imported (other boards, archive lists) are left
// out.
export function collectCardLinks(
  cardIds: ReadonlySet<string>,
  taskLists: readonly PlankaTaskList[],
  items: readonly PlankaTask[],
): CardLink[] {
  const cardOfList = new Map(taskLists.map((list) => [list.id, list.cardId]));
  const links: CardLink[] = [];
  for (const item of items) {
    const parentCardId = cardOfList.get(item.taskListId);
    const childCardId = item.linkedCardId;
    if (!parentCardId || !childCardId) continue;
    if (!cardIds.has(parentCardId) || !cardIds.has(childCardId)) continue;
    links.push({ parentCardId, childCardId, name: item.name });
  }
  return links;
}
