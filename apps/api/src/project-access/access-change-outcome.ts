export type AccessChangeOutcome = {
  changes: { userId: string; projectIds: string[] }[];
  triageProjectIds: string[];
  unassigned: { id: string; projectId: string }[];
};
