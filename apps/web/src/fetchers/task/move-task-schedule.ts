import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Planned work keeps its effort and is laid out again from `start`, so it
// may finish after `end`. `exact` sets the span by hand instead (a resized
// bar): the work takes both dates as given.
async function moveTaskSchedule(
  taskId: string,
  start: Date,
  end: Date,
  exact = false,
) {
  const response = await client.task.schedule[":id"].$put({
    param: { id: taskId },
    json: {
      start: start.toISOString(),
      end: end.toISOString(),
      ...(exact ? { exact } : {}),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default moveTaskSchedule;
