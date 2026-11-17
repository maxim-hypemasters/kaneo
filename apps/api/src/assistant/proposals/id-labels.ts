import type { ToolClient } from "@kaneo/mcp/tools";
import { entityPaths } from "./entity-paths";

type Json = Record<string, unknown>;

/** A task as cards and summaries name it. */
export type TaskRef = {
  id: string;
  /** KAN-12, or null when the project's key couldn't be read. */
  ticket: string | null;
  title: string;
  projectId: string;
  /** "KAN-12 Title", or the title alone. */
  label: string;
};

export type IdLabels = {
  /**
   * GETs a path once per instance and keeps the answer. `fresh` reads it
   * again and replaces what was kept. Rejects with the API's error.
   */
  load(path: string, options?: { fresh?: boolean }): Promise<unknown>;
  task(id: string): Promise<TaskRef | null>;
  /**
   * The name a card shows for an id argument, read as the user: a project
   * name, "KAN-12 Title", a milestone or release, a member, a label, a page,
   * a document or a custom field. Falls back to the id itself.
   */
  label(key: string, id: string, args: Json): Promise<string>;
};

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : null;

function named(list: unknown, id: string, key: string): string | null {
  if (!Array.isArray(list)) return null;
  const match = list.find((item) => isRecord(item) && item.id === id);
  return isRecord(match) ? text(match[key]) : null;
}

/**
 * Resolves ids to names through `client`, the user's read-only loopback
 * client, so a label never shows what the user can't see. Keeps every
 * answer for the instance's lifetime: one turn, or one approved write.
 */
export function createIdLabels(
  client: ToolClient,
  workspaceId: string,
): IdLabels {
  const cache = new Map<string, Promise<unknown>>();

  const load: IdLabels["load"] = (path, options) => {
    const kept = options?.fresh ? undefined : cache.get(path);
    if (kept) return kept;
    const loaded = client.json<unknown>(path, { method: "GET" });
    cache.set(path, loaded);
    // Kept for callers; an unobserved rejection must not crash the process.
    loaded.catch(() => {});
    return loaded;
  };
  const record = async (path: string) => {
    const value = await load(path);
    return isRecord(value) ? value : null;
  };

  const task = async (id: string): Promise<TaskRef | null> => {
    const found = await record(entityPaths.task(id)).catch(() => null);
    const projectId = text(found?.projectId);
    const title = text(found?.title);
    if (!found || !projectId || title === null) return null;
    const project = await record(entityPaths.project(projectId)).catch(
      () => null,
    );
    const slug = text(project?.slug);
    const ticket =
      slug && Number.isInteger(found.number)
        ? `${slug.toUpperCase()}-${found.number}`
        : null;
    return {
      id,
      ticket,
      title,
      projectId,
      label: ticket ? `${ticket} ${title}` : title,
    };
  };

  const resolve = async (
    key: string,
    id: string,
    args: Json,
  ): Promise<string | null> => {
    switch (key) {
      case "projectId":
        return text((await record(entityPaths.project(id)))?.name);
      case "taskId":
      case "sourceTaskId":
      case "targetTaskId":
      case "featureId":
        return (await task(id))?.label ?? null;
      case "milestoneId":
        return text((await record(entityPaths.milestone(id)))?.title);
      case "releaseId":
        return text((await record(entityPaths.release(id)))?.name);
      case "userId":
      case "leadId":
        return named(await load(entityPaths.members(workspaceId)), id, "name");
      case "labelId":
        return named(await load(entityPaths.labels(workspaceId)), id, "name");
      case "parentId":
      case "pageId":
        return text((await record(entityPaths.page(id)))?.title);
      case "documentId": {
        const featureId = text(args.featureId);
        if (!featureId) return null;
        return text(
          (await record(entityPaths.featureDocument(featureId, id)))?.title,
        );
      }
      case "fieldId": {
        const taskId = text(args.taskId);
        const projectId =
          text(args.projectId) ??
          (taskId ? ((await task(taskId))?.projectId ?? null) : null);
        if (!projectId) return null;
        return named(
          await load(entityPaths.projectCustomFields(projectId)),
          id,
          "name",
        );
      }
      default:
        return null;
    }
  };

  return {
    load,
    task,
    label: async (key, id, args) =>
      (await resolve(key, id, args).catch(() => null)) ?? id,
  };
}
