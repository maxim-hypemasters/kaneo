import { z } from "../openapi";

export const triageMembersSchema = z
  .object({
    userIds: z.array(z.string()).openapi({
      description:
        "Users who accept or decline new work, in the order they were added. Empty when triage is off.",
    }),
  })
  .openapi("TriageMembers");
