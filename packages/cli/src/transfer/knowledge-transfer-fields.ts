import { Result } from "effect";
import type {
  ExportedRelease,
  PlanningSnapshot,
} from "../api/export-import.js";
import { InvalidArgument } from "../errors/errors.js";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const timestamp = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
export function calendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const day = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}
export function parseReleaseDefinitions(
  value: unknown,
): Result.Result<ExportedRelease[], InvalidArgument> {
  if (value === undefined) return Result.succeed([]);
  if (!Array.isArray(value))
    return Result.fail(
      new InvalidArgument({
        message: "The release definitions must be a list.",
      }),
    );
  const releases: ExportedRelease[] = [];
  for (const item of value) {
    if (
      !record(item) ||
      typeof item.key !== "string" ||
      !item.key.trim() ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.trim().length > 255 ||
      !calendarDay(item.startDate) ||
      !calendarDay(item.codeFreezeDate) ||
      !calendarDay(item.submissionDate) ||
      item.startDate > item.codeFreezeDate ||
      item.codeFreezeDate > item.submissionDate
    )
      return Result.fail(
        new InvalidArgument({
          message: "Invalid release definition or date order.",
        }),
      );
    releases.push({
      key: item.key,
      name: item.name.trim(),
      startDate: item.startDate,
      codeFreezeDate: item.codeFreezeDate,
      submissionDate: item.submissionDate,
    });
  }
  if (
    new Set(releases.map((release) => release.key)).size !== releases.length ||
    new Set(releases.map((release) => release.name)).size !== releases.length
  )
    return Result.fail(
      new InvalidArgument({
        message:
          "Release keys and names must be unique in the import document.",
      }),
    );
  return Result.succeed(releases);
}
export function parsePlanningSnapshots(
  value: unknown,
): Result.Result<PlanningSnapshot[] | undefined, InvalidArgument> {
  if (value === undefined) return Result.succeed(undefined);
  if (!Array.isArray(value))
    return Result.fail(
      new InvalidArgument({
        message: "Feature planning snapshots must be a list.",
      }),
    );
  const snapshots: PlanningSnapshot[] = [];
  const fields = [
    "projectId",
    "status",
    "columnId",
    "priority",
    "userId",
    "startDate",
    "dueDate",
    "releaseId",
    "releaseName",
    "archivedAt",
  ] as const;
  for (const item of value) {
    if (
      !record(item) ||
      !(
        item.createdAt === undefined ||
        (typeof item.createdAt === "string" && timestamp(item.createdAt))
      ) ||
      fields.some(
        (field) =>
          item[field] !== undefined &&
          item[field] !== null &&
          typeof item[field] !== "string",
      )
    )
      return Result.fail(
        new InvalidArgument({ message: "Invalid Feature planning snapshot." }),
      );
    const snapshot: Record<string, string | null> = {};
    if (typeof item.createdAt === "string") snapshot.createdAt = item.createdAt;
    for (const field of fields)
      if (item[field] === null || typeof item[field] === "string")
        snapshot[field] = item[field];
    snapshots.push(snapshot);
  }
  return Result.succeed(snapshots);
}
export const isArchiveTimestamp = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && timestamp(value));
