import { ApiError } from "../errors/api-error";

export function assertWithinCodeFreeze(
  warnings: readonly { taskId: string; reason: string }[],
) {
  const late = warnings.filter(
    (warning) => warning.reason === "after_code_freeze",
  );
  if (late.length)
    throw new ApiError(422, {
      code: "PLAN_AFTER_CODE_FREEZE",
      message:
        "Resolve work finishing after code freeze before applying this plan",
      issues: late.map(({ taskId }) => ({
        path: `tasks.${taskId}`,
        message: "Finishes after code freeze",
      })),
    });
}
