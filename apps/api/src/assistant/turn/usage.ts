import { and, eq, sql } from "drizzle-orm";
import db from "../../database";
import { assistantUsageTable } from "../../database/schema";
import { DAILY_MODEL_CALLS_PER_USER } from "../constants";
import { assistantError } from "../errors";
import type { AssistantMessageUsage } from "../message-types";

const usage = assistantUsageTable;
const key = [usage.workspaceId, usage.userId, usage.day];

/** The UTC day the counters are kept for, from a JS Date (never now()). */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Counts one model call against the user's daily cap in this workspace, in
 * one atomic upsert. Returns false, without counting, once the cap is
 * reached; the caller must not make the call then.
 */
export async function reserveModelCall(
  workspaceId: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const reserved = await db
    .insert(usage)
    .values({ workspaceId, userId, day: utcDay(now), modelCalls: 1 })
    .onConflictDoUpdate({
      target: key,
      set: { modelCalls: sql`${usage.modelCalls} + 1` },
      setWhere: sql`${usage.modelCalls} < ${DAILY_MODEL_CALLS_PER_USER}`,
    })
    .returning({ modelCalls: usage.modelCalls });
  return reserved.length > 0;
}

/** Adds a model call's tokens and cost, including a partial call's. */
export async function recordUsage(
  workspaceId: string,
  userId: string,
  spent: AssistantMessageUsage,
  now: Date = new Date(),
): Promise<void> {
  const promptTokens = count(spent.promptTokens);
  const completionTokens = count(spent.completionTokens);
  const costUsd =
    spent.costUsd !== undefined && Number.isFinite(spent.costUsd)
      ? Math.max(0, spent.costUsd)
      : 0;
  await db
    .insert(usage)
    .values({
      workspaceId,
      userId,
      day: utcDay(now),
      promptTokens,
      completionTokens,
      costUsd,
    })
    .onConflictDoUpdate({
      target: key,
      set: {
        promptTokens: sql`${usage.promptTokens} + ${promptTokens}`,
        completionTokens: sql`${usage.completionTokens} + ${completionTokens}`,
        costUsd: sql`${usage.costUsd} + ${costUsd}`,
      },
    });
}

/**
 * The pre-check before a turn streams: throws 429 ASSISTANT_DAILY_LIMIT when
 * the user has no model calls left today. reserveModelCall still guards
 * each call, since turns can run at the same time.
 */
export async function checkDailyAllowance(
  workspaceId: string,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const [row] = await db
    .select({ modelCalls: usage.modelCalls })
    .from(usage)
    .where(
      and(
        eq(usage.workspaceId, workspaceId),
        eq(usage.userId, userId),
        eq(usage.day, utcDay(now)),
      ),
    )
    .limit(1);
  if ((row?.modelCalls ?? 0) >= DAILY_MODEL_CALLS_PER_USER) {
    throw assistantError("ASSISTANT_DAILY_LIMIT");
  }
}
