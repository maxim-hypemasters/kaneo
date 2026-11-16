import { z } from "../openapi";

export const triageProjectParam = z.object({ projectId: z.string() });

export const triageTaskParam = z.object({ id: z.string() });

export const replaceTriageMembersBody = z.object({
  userIds: z.array(z.string().min(1)).max(100).openapi({
    description:
      "The complete list of triage members. Each must be a workspace member with access to the project. An empty list turns triage off.",
  }),
});

export const declineTriageBody = z.object({
  reason: z.string().max(10_000).optional().openapi({
    description:
      "Why the work was declined. Posted as a comment from the caller and sent to the reporter.",
  }),
});
