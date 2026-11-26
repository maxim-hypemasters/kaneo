import type { KaneoClient, RunRef } from "../kaneo/client";
import type { RunSession } from "./run-session";

/**
 * Ends a run whose session stopped, telling Kaneo why; a lost run is not
 * ours to report. Returns false while the session is still going.
 */
export async function reportStop(
  kaneo: KaneoClient,
  run: RunRef,
  session: Pick<RunSession, "stopReason">,
): Promise<boolean> {
  const reason = session.stopReason();
  if (!reason) return false;
  if (reason !== "lost")
    await kaneo
      .fail(run, {
        code: reason,
        message:
          reason === "cancelled"
            ? "Cancelled from Kaneo"
            : "The run took longer than the runner allows",
      })
      .catch(() => {});
  return true;
}
