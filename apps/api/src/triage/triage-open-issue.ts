import type db from "../database";
import { readTriageRouting } from "./read-triage-members";

// Issues opened in a git provider have no Kaneo creator. Open ones wait in
// Triage when the project has triage members; closed ones arrive done.
export async function triagesOpenIssue(
  database: Pick<typeof db, "select">,
  projectId: string,
  closed: boolean,
) {
  if (closed) return false;
  return (await readTriageRouting(projectId, null, database)).triageEnabled;
}
