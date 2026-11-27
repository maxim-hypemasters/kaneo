import { describe, expect, it } from "vite-plus/test";
import { RUNNER_VERSION } from "../version";
import { createKaneoClient, KaneoError } from "./client";

function recordingFetch(status: number, body: unknown) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return status === 204
      ? new Response(null, { status })
      : Response.json(body, { status });
  };
  return { fetch: fetch as typeof globalThis.fetch, requests };
}

describe("createKaneoClient", () => {
  it("names the claim's attempt on every request about the run", async () => {
    const { fetch, requests } = recordingFetch(200, { cancelRequested: false });
    const kaneo = createKaneoClient("http://kaneo/api", "kar_x", {
      canPush: false,
      fetch,
    });
    const ref = { id: "run-1", attempt: 2 };
    await kaneo.heartbeat(ref);
    await kaneo.events(ref, [{ kind: "step", message: "Cloning" }]);
    await kaneo.shipResult(ref, {
      prUrl: "https://x/pull/1",
      branch: "b",
      summary: "",
    });
    await kaneo.fail(ref, { code: "internal", message: "boom" });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/agent-runner/runs/run-1/heartbeat",
      "/api/agent-runner/runs/run-1/events",
      "/api/agent-runner/runs/run-1/ship-result",
      "/api/agent-runner/runs/run-1/fail",
    ]);
    for (const request of requests) {
      expect(request.headers.get("x-kaneo-run-attempt")).toBe("2");
      expect(request.headers.get("authorization")).toBe("Bearer kar_x");
    }
  });

  it("says on every claim whether the runner can push", async () => {
    for (const canPush of [true, false]) {
      const { fetch, requests } = recordingFetch(204, null);
      const kaneo = createKaneoClient("http://kaneo/api", "kar_x", {
        canPush,
        fetch,
      });
      expect(await kaneo.claim(["start"])).toBeNull();
      expect(new URL(requests[0]!.url).pathname).toBe(
        "/api/agent-runner/claim",
      );
      expect(await requests[0]!.json()).toEqual({
        kinds: ["start"],
        runnerVersion: RUNNER_VERSION,
        canPush,
      });
    }
  });

  it("throws the status of a refused request", async () => {
    const { fetch } = recordingFetch(409, { code: "AI_AGENT_RUN_NOT_RUNNING" });
    const kaneo = createKaneoClient("http://kaneo/api", "kar_x", {
      canPush: false,
      fetch,
    });
    const error = await kaneo
      .heartbeat({ id: "run-1", attempt: 1 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(KaneoError);
    expect((error as KaneoError).status).toBe(409);
  });
});
