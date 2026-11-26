import { runHermes } from "../hermes/run-hermes";
import type { RunClaim } from "../kaneo/client";
import { reportStop } from "../loop/report-stop";
import { startRunSession } from "../loop/run-session";
import { prepareCheckout } from "../repo/prepare-checkout";
import { prepareRunDir, removeRunDir } from "../repo/run-dir";
import { runWorkId } from "../repo/work-paths";
import type { RunDeps } from "../run-deps";
import { buildAssessPrompt, buildRepairPrompt } from "./build-assess-prompt";
import { extractJson } from "./extract-json";

const NOT_JSON = "The reply was not a JSON object.";

/**
 * Reads the code read-only (file tools that may write only to a scratch
 * directory, no terminal, no web) and reports a readiness assessment. One
 * repair round fixes an answer the API rejects.
 */
export async function runAssess(deps: RunDeps, claim: RunClaim) {
  const { config, kaneo, redact } = deps;
  const { run, context } = claim;
  const workId = runWorkId(run);
  const session = startRunSession(kaneo, run, {
    timeoutMs: config.assessTimeoutMs,
    redact,
    shutdown: deps.shutdown,
    log: deps.log,
  });
  try {
    const paths = await prepareRunDir(config, workId);
    let cwd = paths.scratch;
    let hasCode = false;
    if (context.project.repository) {
      try {
        const checkout = await prepareCheckout(config, {
          runId: workId,
          repository: context.project.repository,
          baseBranch: context.project.baseBranch,
          signal: session.signal,
        });
        cwd = checkout.dir;
        hasCode = true;
      } catch (error) {
        // A clone the session's stop killed is not a reason to go on without code.
        if (session.stopReason()) throw error;
        deps.log(
          `Assessing ${run.id} without code: ${redact((error as Error).message)}`,
        );
      }
    }

    const ask = (prompt: string, where: string) =>
      runHermes(config, {
        prompt,
        cwd: where,
        hermesHome: paths.hermes,
        toolsets: config.assessToolsets,
        maxTurns: config.assessMaxTurns,
        yolo: false,
        writeRoot: paths.scratch,
        signal: session.signal,
      });
    // The assessment is stored and shown to the workspace, like the rest of
    // Hermes's output.
    const submit = (text: string) => {
      const parsed = extractJson(redact(text));
      return parsed ? kaneo.assessment(run, parsed) : Promise.resolve(NOT_JSON);
    };

    let reply = await ask(buildAssessPrompt(context, { hasCode }), cwd);
    if (await reportStop(kaneo, run, session)) return;
    let rejection = await submit(reply.text);
    if (rejection !== null && !reply.error) {
      reply = await ask(
        buildRepairPrompt(reply.text, rejection),
        paths.scratch,
      );
      if (await reportStop(kaneo, run, session)) return;
      rejection = await submit(reply.text);
    }
    if (rejection !== null)
      await kaneo.fail(run, {
        code: "agent_failed",
        message: redact(
          reply.error
            ? `Hermes failed: ${reply.error}`
            : `Hermes did not return a valid assessment: ${rejection}`,
        ).slice(0, 2000),
      });
  } catch (error) {
    if (!(await reportStop(kaneo, run, session)))
      await kaneo
        .fail(run, {
          code: "internal",
          message: redact((error as Error).message).slice(0, 2000),
        })
        .catch(() => {});
  } finally {
    await session.end();
    await removeRunDir(config, workId);
  }
}
