import type { ImportDocument } from "@/fetchers/task/import-tasks";

export function parseTasksImport(content: string): ImportDocument | null {
  const data: unknown = JSON.parse(content);
  if (typeof data !== "object" || data === null || !("tasks" in data)) {
    return null;
  }

  if (!Array.isArray(data.tasks)) return null;
  if ("version" in data && data.version !== 2) return null;
  if (
    "version" in data &&
    data.version === 2 &&
    (!("milestones" in data) || !Array.isArray(data.milestones))
  )
    return null;
  return data as ImportDocument;
}

export function isJsonFile(file: Pick<File, "name" | "type">) {
  return file.type === "application/json" || file.name.endsWith(".json");
}
