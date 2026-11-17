import type { AssistantMessage } from "@/fetchers/assistant/get-assistant-chat";

type Preview = NonNullable<AssistantMessage["preview"]>;
export type ProposalField = Preview["fields"][number];

/**
 * The fields a card lists. The argument naming what the card is about (the
 * task of a task update, the project a task is created in) already shows in
 * its title, so the server names its key and that one field is left out. A
 * field that changes something, with a previous value, always stays.
 */
export function visibleFields(
  preview: Pick<Preview, "targetKey" | "fields">,
): ProposalField[] {
  return preview.fields.filter(
    (field) =>
      !(
        preview.targetKey !== null &&
        field.key === preview.targetKey &&
        field.from === undefined
      ),
  );
}
