import type { z } from "zod";
import type db from "../../database";
import { activityTable } from "../../database/schema";
import type { scheduleSnapshotSchema } from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ImportedScheduleSnapshot = z.infer<typeof scheduleSnapshotSchema>;
export type ImportedScheduleFields = {
  startDate?: string | null;
  dueDate?: string | null;
  legacyStartDate?: string | null;
  legacyDueDate?: string | null;
  scheduleSnapshots?: ImportedScheduleSnapshot[];
};

export function importedTaskDates(
  values: ImportedScheduleFields,
  scheduleGeneration: number,
) {
  const legacyStartDate =
    values.legacyStartDate === undefined
      ? values.startDate
      : values.legacyStartDate;
  const legacyDueDate =
    values.legacyDueDate === undefined ? values.dueDate : values.legacyDueDate;
  return {
    legacyStartDate: legacyStartDate ? new Date(legacyStartDate) : null,
    legacyDueDate: legacyDueDate ? new Date(legacyDueDate) : null,
    startDate:
      scheduleGeneration === 0 && legacyStartDate
        ? new Date(legacyStartDate)
        : null,
    dueDate:
      scheduleGeneration === 0 && legacyDueDate
        ? new Date(legacyDueDate)
        : null,
  };
}

export async function preserveImportedSchedule(
  tx: Tx,
  projectId: string,
  taskId: string,
  userId: string | undefined,
  values: ImportedScheduleFields,
) {
  const legacy = importedTaskDates(values, 0);
  const snapshots: ImportedScheduleSnapshot[] = [
    ...(values.scheduleSnapshots ?? []),
    ...(legacy.legacyStartDate || legacy.legacyDueDate
      ? [
          {
            source: "legacy" as const,
            startDate: legacy.legacyStartDate?.toISOString() ?? null,
            dueDate: legacy.legacyDueDate?.toISOString() ?? null,
          },
        ]
      : []),
  ];
  if (snapshots.length)
    await tx.insert(activityTable).values(
      snapshots.map(({ createdAt, ...snapshot }) => ({
        taskId,
        userId: userId ?? null,
        type: "schedule_preserved",
        content: null,
        eventData: { ...snapshot, projectId, imported: true },
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
      })),
    );
}
