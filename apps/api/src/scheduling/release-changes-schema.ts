import { HTTPException } from "hono/http-exception";
import { z } from "../openapi";
import { createReleaseBody } from "../release/schema";
import { isoDay } from "../release/release-dates";

const key = z.string().trim().min(1).max(255);
const moveTarget = z.union([
  z.object({ releaseId: key }).strict(),
  z.object({ draftKey: key }).strict(),
]);
export const releasePlanChangesSchema = z
  .object({
    releaseDates: z
      .object({ codeFreezeDate: isoDay, submissionDate: isoDay })
      .strict()
      .optional(),
    moves: z
      .array(
        z
          .object({
            taskId: key,
            target: moveTarget,
          })
          .strict(),
      )
      .max(10_000)
      .optional(),
    milestoneMoves: z
      .array(z.object({ milestoneId: key, target: moveTarget }).strict())
      .max(10_000)
      .optional(),
    newRelease: createReleaseBody
      .pick({
        name: true,
        startDate: true,
        codeFreezeDate: true,
        submissionDate: true,
      })
      .extend({ key })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((changes, context) => {
    for (const [field, moves] of [
      ["moves", changes.moves],
      ["milestoneMoves", changes.milestoneMoves],
    ] as const) {
      const ids = new Set<string>();
      for (const [index, move] of (moves ?? []).entries()) {
        const [idField, id] =
          "taskId" in move
            ? (["taskId", move.taskId] as const)
            : (["milestoneId", move.milestoneId] as const);
        if (ids.has(id))
          context.addIssue({
            code: "custom",
            path: [field, index, idField],
            message:
              field === "moves"
                ? "Task ids must be unique"
                : "Milestone ids must be unique",
          });
        ids.add(id);
        if (
          "draftKey" in move.target &&
          move.target.draftKey !== changes.newRelease?.key
        )
          context.addIssue({
            code: "custom",
            path: [field, index, "target"],
            message: "Unknown draft release",
          });
      }
    }
  });

export type ReleasePlanChanges = z.infer<typeof releasePlanChangesSchema>;
export type ReleasePlanMoveTarget = z.infer<typeof moveTarget>;

export function canonicalReleaseChanges(
  value?: ReleasePlanChanges,
): ReleasePlanChanges {
  const parsed = releasePlanChangesSchema.safeParse(value ?? {});
  if (!parsed.success)
    throw new HTTPException(400, {
      message: "Invalid release planning changes",
    });
  const changes = parsed.data;
  const moves = changes.moves
    ?.slice()
    .sort((a, b) => a.taskId.localeCompare(b.taskId));
  const milestoneMoves = changes.milestoneMoves
    ?.slice()
    .sort((a, b) => a.milestoneId.localeCompare(b.milestoneId));
  const usesNewRelease = [...(moves ?? []), ...(milestoneMoves ?? [])].some(
    ({ target }) => "draftKey" in target,
  );
  return {
    ...(changes.releaseDates ? { releaseDates: changes.releaseDates } : {}),
    ...(moves?.length ? { moves } : {}),
    ...(milestoneMoves?.length ? { milestoneMoves } : {}),
    ...(changes.newRelease && usesNewRelease
      ? { newRelease: changes.newRelease }
      : {}),
  };
}
