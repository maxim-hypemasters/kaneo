import type { AssistantModel } from "@/fetchers/assistant/get-assistant-models";

export type AssistantModelGroup = {
  value: "recommended" | "all";
  items: AssistantModel[];
};

// Rendering every OpenRouter model at once is slow; typing narrows the list.
export const MODEL_LIST_LIMIT = 100;

// Recommended models first, then everything else in the API's order. Empty
// groups are left out.
export function groupAssistantModels(
  models: readonly AssistantModel[],
): AssistantModelGroup[] {
  const groups: AssistantModelGroup[] = [
    { value: "recommended", items: models.filter((m) => m.recommended) },
    { value: "all", items: models.filter((m) => !m.recommended) },
  ];
  return groups.filter((group) => group.items.length > 0);
}

// Every word of the query must appear in the model's id or name.
export function matchesModelQuery(
  model: Pick<AssistantModel, "id" | "name">,
  query: string,
): boolean {
  const haystack = `${model.id} ${model.name}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

// When the field holds a listed id, it shows a choice rather than a search,
// so the list should offer every model again.
export function isListedModel(
  models: readonly Pick<AssistantModel, "id">[],
  value: string,
): boolean {
  const id = value.trim();
  return id !== "" && models.some((model) => model.id === id);
}
