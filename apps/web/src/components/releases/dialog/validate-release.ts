import type {
  ReleaseDateField,
  ReleaseFormValues,
} from "./release-form-values";

export type ReleaseFieldError = {
  key:
    | "tasks:releases.dialog.nameRequired"
    | "tasks:releases.dialog.dateRequired"
    | "tasks:releases.dialog.beforeStart"
    | "tasks:releases.dialog.beforeCodeFreeze"
    // Set from the API's answer, not by validateRelease.
    | "tasks:releases.ux.nameTaken";
  // The offending day (YYYY-MM-DD), for the message.
  day?: string;
};

export type ReleaseFormErrors = Partial<
  Record<"name" | ReleaseDateField, ReleaseFieldError>
>;

// The API's rules: a name, all three dates, start ≤ code freeze ≤ submission
// (equal days allowed). The date pickers keep the order already; this catches
// what they can't, such as a missing date.
export function validateRelease(values: ReleaseFormValues): ReleaseFormErrors {
  const errors: ReleaseFormErrors = {};
  const { startDate, codeFreezeDate, submissionDate } = values;
  if (!values.name.trim()) {
    errors.name = { key: "tasks:releases.dialog.nameRequired" };
  }
  if (!startDate) {
    errors.startDate = { key: "tasks:releases.dialog.dateRequired" };
  }
  if (!codeFreezeDate) {
    errors.codeFreezeDate = { key: "tasks:releases.dialog.dateRequired" };
  } else if (startDate && codeFreezeDate < startDate) {
    errors.codeFreezeDate = {
      key: "tasks:releases.dialog.beforeStart",
      day: codeFreezeDate,
    };
  }
  if (!submissionDate) {
    errors.submissionDate = { key: "tasks:releases.dialog.dateRequired" };
  } else if (codeFreezeDate && submissionDate < codeFreezeDate) {
    errors.submissionDate = {
      key: "tasks:releases.dialog.beforeCodeFreeze",
      day: submissionDate,
    };
  } else if (startDate && submissionDate < startDate) {
    errors.submissionDate = {
      key: "tasks:releases.dialog.beforeStart",
      day: submissionDate,
    };
  }
  return errors;
}
