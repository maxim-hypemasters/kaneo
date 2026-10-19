import type { ExportedMilestone } from "../api/export-import.js";
import { Result } from "effect";
import { InvalidArgument } from "../errors/errors.js";
import { TASK_TYPES, type TaskType } from "../api/task-features.js";

export type ImportCandidate = {
  readonly title: string;
  readonly key?: string;
  readonly featureKey?: string | null;
  readonly milestoneKey?: string | null;
  readonly labelDefinitions?: ReadonlyArray<{
    readonly name: string;
    readonly color: string;
  }>;
  readonly type?: TaskType;
  readonly description?: string | undefined;
  readonly status?: string | undefined;
  readonly priority?: string | undefined;
  readonly startDate?: string | null | undefined;
  readonly dueDate?: string | null | undefined;
  readonly userId?: string | null | undefined;
  readonly labels: number;
};

const SHAPE_HINT =
  "Use the output of kaneo task export, or a JSON array of tasks with at least a title.";

type Fields = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(message: string): InvalidArgument {
  return new InvalidArgument({ message, hint: SHAPE_HINT });
}

function readTasks(document: unknown): unknown[] | null {
  if (Array.isArray(document)) return document;
  if (isRecord(document) && Array.isArray(document.tasks)) {
    return document.tasks;
  }
  return null;
}

function text(
  fields: Fields,
  key: string,
  where: string,
): Result.Result<string | undefined, InvalidArgument> {
  const value = fields[key];
  if (value === undefined || value === null) return Result.succeed(undefined);
  return typeof value === "string"
    ? Result.succeed(value)
    : Result.fail(invalid(`${where} has a ${key} that is not text.`));
}

function nullableText(
  fields: Fields,
  key: string,
  where: string,
): Result.Result<string | null | undefined, InvalidArgument> {
  if (fields[key] === null) return Result.succeed(null);
  return text(fields, key, where);
}

function itemType(
  fields: Fields,
  where: string,
): Result.Result<TaskType | undefined, InvalidArgument> {
  const value = fields.type;
  if (value === undefined) return Result.succeed(undefined);
  return typeof value === "string" &&
    (TASK_TYPES as readonly string[]).includes(value)
    ? Result.succeed(value as TaskType)
    : Result.fail(
        invalid(`${where} has an invalid type; expected task, bug or feature.`),
      );
}

function date(
  fields: Fields,
  key: string,
  where: string,
): Result.Result<string | null | undefined, InvalidArgument> {
  return Result.flatMap(nullableText(fields, key, where), (value) => {
    if (typeof value !== "string") return Result.succeed(value);
    if (value.trim() === "") return Result.succeed(null);
    return Number.isNaN(Date.parse(value))
      ? Result.fail(invalid(`${where} has an invalid ${key} "${value}".`))
      : Result.succeed(value);
  });
}

function parseTask(
  item: unknown,
  index: number,
): Result.Result<ImportCandidate, InvalidArgument> {
  const where = `Task ${index + 1}`;
  if (!isRecord(item)) {
    return Result.fail(invalid(`${where} is not an object.`));
  }
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (title === "") {
    return Result.fail(invalid(`${where} has no title.`));
  }
  const named = `${where} (${title})`;
  return Result.all({
    type: itemType(item, named),
    description: text(item, "description", named),
    status: text(item, "status", named),
    priority: text(item, "priority", named),
    startDate: date(item, "startDate", named),
    dueDate: date(item, "dueDate", named),
    userId: nullableText(item, "userId", named),
  }).pipe(
    Result.map(({ type, ...fields }) => ({
      title,
      ...(type === undefined ? {} : { type }),
      ...fields,
      status: fields.status?.trim() || undefined,
      priority: fields.priority?.trim() || undefined,
      labels: Array.isArray(item.labels) ? item.labels.length : 0,
    })),
  );
}

export function parseImportDocument(
  content: string,
  source: string,
): Result.Result<ImportCandidate[], InvalidArgument> {
  let document: unknown;
  try {
    document = JSON.parse(content);
  } catch {
    return Result.fail(invalid(`${source} is not valid JSON.`));
  }
  const items = readTasks(document);
  if (items === null) {
    return Result.fail(invalid(`${source} has no list of tasks.`));
  }
  if (items.length === 0) {
    return Result.fail(
      new InvalidArgument({ message: `${source} has no tasks to import.` }),
    );
  }
  const tasks: ImportCandidate[] = [];
  for (const [index, item] of items.entries()) {
    const parsed = parseTask(item, index);
    if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
    tasks.push(parsed.success);
  }
  return Result.succeed(tasks);
}

export type ImportDocument = {
  readonly tasks: ReadonlyArray<ImportCandidate>;
  readonly hierarchy?: {
    readonly version: 2;
    readonly milestones: ReadonlyArray<ExportedMilestone>;
  };
};

// Legacy callers keep receiving the same flat candidate list. Version 2 retains
// portable references and is sent atomically, rather than split into batches.
export function parseTransferDocument(
  content: string,
  source: string,
): Result.Result<ImportDocument, InvalidArgument> {
  const parsed = parseImportDocument(content, source);
  if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
  const document: unknown = JSON.parse(content);
  if (!isRecord(document) || document.version === undefined) {
    if (
      readTasks(document)?.some(
        (item) =>
          isRecord(item) &&
          (item.featureKey != null || item.milestoneKey != null),
      )
    ) {
      return Result.fail(
        invalid("Hierarchy references require a version 2 import document."),
      );
    }
    return Result.succeed({ tasks: parsed.success });
  }
  if (document.version !== 2)
    return Result.fail(invalid("Unsupported import version."));
  if (!Array.isArray(document.milestones))
    return Result.fail(invalid("Version 2 needs a list of milestones."));
  const milestones: ExportedMilestone[] = [];
  const isDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const day = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value
    );
  };
  for (const item of document.milestones) {
    if (!isRecord(item))
      return Result.fail(
        invalid("Invalid milestone definition in version 2 import."),
      );
    const startDate = item.startDate;
    const endDate = item.endDate === undefined ? item.targetDate : item.endDate;
    if (
      typeof item.key !== "string" ||
      !item.key.trim() ||
      typeof item.featureKey !== "string" ||
      !item.featureKey.trim() ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.trim().length > 255 ||
      !Number.isInteger(item.position) ||
      Number(item.position) < 0 ||
      Number(item.position) > 2_147_483_646 ||
      !(
        item.description == null ||
        (typeof item.description === "string" &&
          item.description.length <= 10_000)
      ) ||
      !(
        startDate == null ||
        (typeof startDate === "string" && isDay(startDate))
      ) ||
      !(endDate == null || (typeof endDate === "string" && isDay(endDate))) ||
      (typeof startDate === "string" &&
        typeof endDate === "string" &&
        startDate > endDate)
    )
      return Result.fail(
        invalid("Invalid milestone definition in version 2 import."),
      );
    milestones.push({
      key: item.key,
      featureKey: item.featureKey,
      title: item.title,
      description: item.description ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      position: Number(item.position),
    });
  }
  const sourceTasks = document.tasks as Fields[];
  const tasks: ImportCandidate[] = [];
  for (const [index, candidate] of parsed.success.entries()) {
    const item = sourceTasks[index]!;
    if (
      typeof item.key !== "string" ||
      !item.key.trim() ||
      !(item.featureKey == null || typeof item.featureKey === "string") ||
      !(item.milestoneKey == null || typeof item.milestoneKey === "string")
    )
      return Result.fail(
        invalid(
          `Task ${index + 1} needs a portable key and nullable Feature/milestone references.`,
        ),
      );
    const labels: Array<{ name: string; color: string }> = [];
    if (item.labels !== undefined) {
      if (!Array.isArray(item.labels))
        return Result.fail(invalid(`Task ${index + 1} has invalid labels.`));
      for (const label of item.labels) {
        if (
          !isRecord(label) ||
          typeof label.name !== "string" ||
          typeof label.color !== "string"
        )
          return Result.fail(invalid(`Task ${index + 1} has invalid labels.`));
        labels.push({ name: label.name, color: label.color });
      }
    }
    tasks.push({
      ...candidate,
      key: item.key,
      ...(item.featureKey === undefined ? {} : { featureKey: item.featureKey }),
      ...(item.milestoneKey === undefined
        ? {}
        : { milestoneKey: item.milestoneKey }),
      labelDefinitions: labels,
    });
  }
  const taskKeys = new Map(tasks.map((task) => [task.key, task]));
  const milestoneKeys = new Map(
    milestones.map((milestone) => [milestone.key, milestone]),
  );
  if (
    taskKeys.size !== tasks.length ||
    milestoneKeys.size !== milestones.length
  )
    return Result.fail(
      invalid("Portable task and milestone keys must be unique."),
    );
  for (const milestone of milestones) {
    if (taskKeys.get(milestone.featureKey)?.type !== "feature")
      return Result.fail(
        invalid("A milestone must reference a Feature in the import document."),
      );
  }
  for (const task of tasks) {
    if (
      task.featureKey &&
      (task.type === "feature" ||
        taskKeys.get(task.featureKey)?.type !== "feature")
    )
      return Result.fail(
        invalid(
          "Only Tasks and Bugs can reference a Feature in the import document.",
        ),
      );
    if (
      task.milestoneKey &&
      (!task.featureKey ||
        milestoneKeys.get(task.milestoneKey)?.featureKey !== task.featureKey)
    )
      return Result.fail(
        invalid("A milestone reference must belong to the task's Feature."),
      );
  }
  return Result.succeed({ tasks, hierarchy: { version: 2, milestones } });
}
