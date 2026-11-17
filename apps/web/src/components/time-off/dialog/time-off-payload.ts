import type {
  CreateTimeOffInput,
  TimeOffRequest,
  UpdateTimeOffInput,
} from "@/fetchers/time-off/types";
import { SELF, type TimeOffFormValues } from "./time-off-form-values";

type CompleteValues = TimeOffFormValues & {
  startDate: string;
  endDate: string;
};

export function createTimeOffPayload(
  values: CompleteValues,
): CreateTimeOffInput {
  const note = values.note.trim();
  return {
    type: values.type,
    startDate: values.startDate,
    endDate: values.endDate,
    ...(note ? { note } : {}),
    ...(values.member && values.member !== SELF
      ? { userId: values.member }
      : {}),
  };
}

// Only what changed, so an untouched field never bumps the version or
// re-runs the date checks. Null when nothing changed.
export function updateTimeOffPayload(
  values: CompleteValues,
  request: TimeOffRequest,
): UpdateTimeOffInput | null {
  const data: UpdateTimeOffInput = {};
  if (values.type !== request.type) data.type = values.type;
  if (values.startDate !== request.startDate) data.startDate = values.startDate;
  if (values.endDate !== request.endDate) data.endDate = values.endDate;
  const note = values.note.trim();
  if (note !== (request.note ?? "")) data.note = note || null;
  return Object.keys(data).length > 0 ? data : null;
}
