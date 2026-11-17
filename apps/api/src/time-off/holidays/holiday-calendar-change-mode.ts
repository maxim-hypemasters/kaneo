// Whether a holiday calendar change applies at once or becomes a request.
// Approvers apply directly, for themselves and for others. A member's first
// choice is free on or before the deadline, a UTC day that counts; with no
// deadline it is always free. Every other change by a member needs approval.
export function holidayCalendarChangeMode(input: {
  forSelf: boolean;
  canApprove: boolean;
  chosen: boolean;
  deadline: string | null;
  today: string;
}): "apply" | "request" {
  const { forSelf, canApprove, chosen, deadline, today } = input;
  if (!forSelf || canApprove) return "apply";
  if (!chosen && (deadline === null || today <= deadline)) return "apply";
  return "request";
}
