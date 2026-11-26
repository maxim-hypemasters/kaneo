import { createHash } from "node:crypto";

export type AgentTaskInput = {
  type: string;
  title: string;
  description: string | null;
  // Oldest first, as the agent reads them.
  clarifications: ReadonlyArray<{ question: string; answer: string }>;
};

/** Fingerprints what an assessment was made from; any edit changes it. */
export function computeInputHash(input: AgentTaskInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.type,
        input.title.trim(),
        (input.description ?? "").trim(),
        input.clarifications.map((item) => [item.question, item.answer]),
      ]),
    )
    .digest("hex");
}
