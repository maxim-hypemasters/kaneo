// Shapes stored in the jsonb columns of assistant_message.

/**
 * A tool call as replayed to the model. `arguments` is always a JSON object
 * string: "{}" with `invalid` set when the model's JSON was invalid or cut off.
 */
export type AssistantToolCall = {
  id: string;
  name: string;
  arguments: string;
  invalid?: boolean;
};

export type AssistantMessageUsage = {
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
};

/**
 * Proof that the model saw a whole document or description unchanged.
 * `version` is the revision for documents and the sha256 hex of the
 * description for tasks.
 */
export type ReadReceipt = {
  kind: "project_page" | "feature_document" | "task_description";
  id: string;
  version: string;
};

export type AssistantProposalField = {
  key: string;
  kind: "text" | "markdown" | "ref" | "date" | "list";
  value: string;
  from?: string | null;
};

/** A task a card's nested work creates, or existing work it links. */
export type AssistantNestedTask = {
  /** A new draft's title, or an existing task's "KAN-12 Title". */
  title: string;
  /** A draft's type; null when it takes the default, and for linked work. */
  type: "task" | "bug" | null;
  /** A draft's estimate; null when it has none, and for linked work. */
  estimateSeconds: number | null;
  existing: boolean;
};

export type AssistantNestedMilestone = {
  title: string;
  leadLabel: string | null;
  releaseLabel: string | null;
  priority: string | null;
  tasks: AssistantNestedTask[];
};

/** The server-built preview an approval card shows. */
export type AssistantProposalPreview = {
  target: string | null;
  /** The argument whose value `target` shows, so a card lists it once. */
  targetKey: string | null;
  fields: AssistantProposalField[];
  diff: { before: string; after: string } | null;
  nested: {
    milestones: AssistantNestedMilestone[];
    /** Work outside any milestone. */
    tasks: AssistantNestedTask[];
    /** The release that new work outside any milestone joins. */
    unassignedReleaseLabel: string | null;
  } | null;
};

export type AssistantResultSummary = { label: string; href: string | null };

export type AssistantMessageRole = "user" | "assistant" | "tool";
export type AssistantMessageStatus = "complete" | "interrupted";
export type AssistantApproval = "pending" | "approved" | "rejected" | "skipped";
