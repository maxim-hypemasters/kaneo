import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

// Planned work keeps its effort and is laid out again from `start`, so it
// may finish after `end`.
async function moveTaskSchedule(taskId: string, start: Date, end: Date) {
  const response = await client.task.schedule[":id"].$put({
    param: { id: taskId },
    json: { start: start.toISOString(), end: end.toISOString() },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default moveTaskSchedule;
