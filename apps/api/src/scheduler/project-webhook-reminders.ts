import { and, between, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import db from "../database";
import {
  columnTable,
  integrationTable,
  taskReminderSentTable,
  taskTable,
} from "../database/schema";
import {
  type GenericWebhookConfig,
  normalizeGenericWebhookConfig,
} from "../plugins/generic-webhook/config";
import { sendDueDateReminder } from "../plugins/generic-webhook/events";
import {
  DUE_DATE_DURATION_MS,
  REMINDER_WINDOW_MINUTES,
} from "./reminder-timing";

const MINUTE_MS = 60 * 1000;

export async function checkProjectWebhookReminders(): Promise<{
  degraded: boolean;
}> {
  const now = new Date();
  const integrations = await db
    .select({
      id: integrationTable.id,
      projectId: integrationTable.projectId,
      config: integrationTable.config,
    })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.type, "generic-webhook"),
        eq(integrationTable.isActive, true),
      ),
    );
  let degraded = false;

  for (const integration of integrations) {
    try {
      const config = normalizeGenericWebhookConfig(
        JSON.parse(integration.config) as GenericWebhookConfig,
      );
      if (!config.events?.dueDateReminder) continue;

      const leadTimeMinutes = config.dueDateReminderLeadTimeMinutes ?? 1440;
      // Count back from expiration while keeping the indexed due date unmodified.
      const windowEnd = new Date(now.getTime() + leadTimeMinutes * MINUTE_MS);
      const windowStart = new Date(
        windowEnd.getTime() - REMINDER_WINDOW_MINUTES * MINUTE_MS,
      );
      const reminderType = `generic_webhook:${integration.id}`;
      const tasks = await db
        .select({ id: taskTable.id, dueDate: taskTable.dueDate })
        .from(taskTable)
        .leftJoin(columnTable, eq(taskTable.columnId, columnTable.id))
        .leftJoin(
          taskReminderSentTable,
          and(
            eq(taskReminderSentTable.taskId, taskTable.id),
            eq(taskReminderSentTable.reminderType, reminderType),
          ),
        )
        .where(
          and(
            eq(taskTable.projectId, integration.projectId),
            isNotNull(taskTable.dueDate),
            or(
              and(
                isNotNull(taskTable.scheduleSegments),
                between(taskTable.dueDate, windowStart, windowEnd),
              ),
              and(
                isNull(taskTable.scheduleSegments),
                between(
                  taskTable.dueDate,
                  new Date(windowStart.getTime() - DUE_DATE_DURATION_MS),
                  new Date(windowEnd.getTime() - DUE_DATE_DURATION_MS),
                ),
              ),
            ),
            isNull(taskReminderSentTable.id),
            or(isNull(columnTable.isFinal), eq(columnTable.isFinal, false)),
            ne(taskTable.status, "archived"),
          ),
        );

      for (const task of tasks) {
        if (!task.dueDate) continue;

        const sentRecord = await db.transaction(async (tx) => {
          const [current] = await tx
            .select({
              dueDate: taskTable.dueDate,
              status: taskTable.status,
              columnId: taskTable.columnId,
            })
            .from(taskTable)
            .where(eq(taskTable.id, task.id))
            .for("update");
          if (
            !current ||
            current.status === "archived" ||
            current.dueDate?.getTime() !== task.dueDate?.getTime()
          )
            return null;
          if (current.columnId) {
            const column = await tx.query.columnTable.findFirst({
              columns: { isFinal: true },
              where: eq(columnTable.id, current.columnId),
            });
            if (column?.isFinal) return null;
          }
          const [claimed] = await tx
            .insert(taskReminderSentTable)
            .values({ taskId: task.id, reminderType })
            .onConflictDoNothing({
              target: [
                taskReminderSentTable.taskId,
                taskReminderSentTable.reminderType,
              ],
            })
            .returning({ id: taskReminderSentTable.id });
          return claimed ?? null;
        });
        if (!sentRecord) continue;

        const delivered = await sendDueDateReminder(
          config,
          task.id,
          integration.projectId,
          leadTimeMinutes,
          task.dueDate,
        );

        if (!delivered) {
          await db
            .delete(taskReminderSentTable)
            .where(eq(taskReminderSentTable.id, sentRecord.id));
        }
      }
    } catch (error) {
      degraded = true;
      console.error("Failed to process project webhook reminder", {
        integrationId: integration.id,
        projectId: integration.projectId,
        error,
      });
    }
  }

  return { degraded };
}
