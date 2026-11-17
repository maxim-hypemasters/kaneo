import { TRIAGE_STATUS } from "../../triage/triage-status";
import type { AssistantProposalField } from "../message-types";
import { proposalField, TRIAGE_FIELD_KEY } from "./proposal-fields";
import type { TriageRouting } from "./triage-routing";

export const TRIAGE_NOTE =
  "You aren't a triage member of this project, so it waits in Triage until a triage member accepts or declines it.";

export const NESTED_TRIAGE_NOTE =
  "You aren't a triage member of this project, so its new tasks and bugs wait in Triage until a triage member accepts or declines them.";

const note = (value: string) => proposalField(TRIAGE_FIELD_KEY, value, value);

/**
 * A card's fields once triage routes its new work. A new Task or Bug shows
 * the triage status in place of the status the model asked for, which it
 * shows as replaced; a note says a triage member decides on the work.
 */
export function withTriage(
  fields: AssistantProposalField[],
  routing: TriageRouting,
  requestedStatus: unknown,
): AssistantProposalField[] {
  if (routing === null) return fields;
  if (routing === "nested") return [...fields, note(NESTED_TRIAGE_NOTE)];
  const status = proposalField(
    "status",
    TRIAGE_STATUS,
    TRIAGE_STATUS,
    typeof requestedStatus === "string" ? requestedStatus : undefined,
  );
  const listed = fields.some((field) => field.key === "status");
  return [
    ...(listed
      ? fields.map((field) => (field.key === "status" ? status : field))
      : [...fields, status]),
    note(TRIAGE_NOTE),
  ];
}
