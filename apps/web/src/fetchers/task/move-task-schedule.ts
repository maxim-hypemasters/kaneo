import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Planned work keeps its effort and is laid out again from `start`, so it
// may finish after `end`. `exact` sets the span by hand instead (a resized
// bar): the work takes both dates as given. `userId` also reassigns it in
// the same step (a lane drop); undefined keeps the assignee, null unassigns.
async function moveTaskSchedule(
  taskId: string,
  start: Date,
  end: Date,
  exact = false,
  userId?: string | null,
) {
  const response = await client.task.schedule[":id"].$put({
    param: { id: taskId },
    json: {
      start: start.toISOString(),
      end: end.toISOString(),
      ...(exact ? { exact } : {}),
      ...(userId !== undefined ? { userId } : {}),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default moveTaskSchedule;
