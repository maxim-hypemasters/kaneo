import { Result } from "effect";
import type { NewTaskRelation } from "../api/task-relations.js";
import { InvalidArgument } from "../errors/errors.js";

export const RELATION_TYPES = ["blocks", "blocked-by", "relates-to"] as const;
export type LinkType = (typeof RELATION_TYPES)[number];

// Deprecated words from before features: a task's parent is now its feature.
// They still work (see join-parent-feature.ts) and name a task's feature link
// in listings, but are not offered anymore.
export const FEATURE_WORDS = ["subtask-of", "parent-of"] as const;
export type FeatureWord = (typeof FEATURE_WORDS)[number];

export type RelationType = LinkType | FeatureWord;

export type RelationDirection = "outgoing" | "incoming";

const ALIASES: Readonly<Record<string, RelationType>> = {
  "subtask-of": "subtask-of",
  "child-of": "subtask-of",
  "parent-of": "parent-of",
  blocks: "blocks",
  "blocked-by": "blocked-by",
  "relates-to": "relates-to",
  "related-to": "relates-to",
  related: "relates-to",
};

const UNSUPPORTED = new Set(["duplicates", "duplicate-of", "duplicated-by"]);

const TYPE_HINT = `Use one of: ${RELATION_TYPES.join(", ")}.`;
const FEATURE_HINT =
  "To put a task into a feature, run kaneo task edit <task> --feature <feature>.";

export function normalizeRelationWord(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-");
}

export function parseRelationType(
  input: string,
): Result.Result<RelationType, InvalidArgument> {
  const word = normalizeRelationWord(input);
  const type = ALIASES[word];
  if (type) return Result.succeed(type);
  return Result.fail(
    new InvalidArgument({
      message: UNSUPPORTED.has(word)
        ? `Kaneo has no "${input.trim()}" relation.`
        : `"${input.trim()}" is not a relation type.`,
      hint: UNSUPPORTED.has(word)
        ? `${TYPE_HINT} relates-to is the closest match.`
        : /feature|subtask|parent|child/u.test(word)
          ? `${TYPE_HINT} ${FEATURE_HINT}`
          : TYPE_HINT,
    }),
  );
}

export function isFeatureWord(type: string): type is FeatureWord {
  return (FEATURE_WORDS as ReadonlyArray<string>).includes(type);
}

export function toApiRelation(
  type: LinkType,
  taskId: string,
  otherId: string,
): NewTaskRelation {
  switch (type) {
    case "blocks":
      return {
        sourceTaskId: taskId,
        targetTaskId: otherId,
        relationType: "blocks",
      };
    case "blocked-by":
      return {
        sourceTaskId: otherId,
        targetTaskId: taskId,
        relationType: "blocks",
      };
    case "relates-to":
      return {
        sourceTaskId: taskId,
        targetTaskId: otherId,
        relationType: "related",
      };
  }
}

export type Perspective = {
  readonly type: string;
  readonly direction: RelationDirection;
};

export function perspectiveOf(
  relation: {
    readonly sourceTaskId: string;
    readonly relationType: string;
  },
  taskId: string,
): Perspective {
  const outgoing = relation.sourceTaskId === taskId;
  const direction: RelationDirection = outgoing ? "outgoing" : "incoming";
  switch (relation.relationType) {
    // A feature link: the source is the feature, the target its task.
    case "subtask":
      return { type: outgoing ? "parent-of" : "subtask-of", direction };
    case "blocks":
      return { type: outgoing ? "blocks" : "blocked-by", direction };
    case "related":
      return { type: "relates-to", direction };
    default:
      return { type: relation.relationType, direction };
  }
}

type Phrases = {
  readonly now: string;
  readonly noLonger: string;
  readonly not: string;
};

const PHRASES: Readonly<Record<RelationType, Phrases>> = {
  "subtask-of": {
    now: "is now in feature",
    noLonger: "is no longer in feature",
    not: "is not in feature",
  },
  "parent-of": {
    now: "is now the feature of",
    noLonger: "is no longer the feature of",
    not: "is not the feature of",
  },
  blocks: {
    now: "now blocks",
    noLonger: "no longer blocks",
    not: "does not block",
  },
  "blocked-by": {
    now: "is now blocked by",
    noLonger: "is no longer blocked by",
    not: "is not blocked by",
  },
  "relates-to": {
    now: "now relates to",
    noLonger: "no longer relates to",
    not: "is not related to",
  },
};

export function isRelationType(type: string): type is RelationType {
  return (
    (RELATION_TYPES as ReadonlyArray<string>).includes(type) ||
    isFeatureWord(type)
  );
}

export function linkedPhrase(type: RelationType): string {
  return PHRASES[type].now;
}

export function notLinkedPhrase(type: RelationType): string {
  return PHRASES[type].not;
}

export function unlinkedPhrase(type: string): string | null {
  return isRelationType(type) ? PHRASES[type].noLonger : null;
}

const HEADINGS: Readonly<Record<string, string>> = {
  blocks: "Blocks",
  "blocked-by": "Blocked by",
  "relates-to": "Related",
};

export function relationHeading(type: string): string {
  const known = HEADINGS[type];
  if (known) return known;
  const words = type.replace(/[-_]+/gu, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function relationOrder(type: string): number {
  const index = (RELATION_TYPES as ReadonlyArray<string>).indexOf(type);
  return index === -1 ? RELATION_TYPES.length : index;
}
