import { Effect, Layer, Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { KaneoApiLayer } from "../api/kaneo-api.js";
import type { TaskDetail } from "../api/schemas.js";
import { resolvedTaskFixture } from "../testing/resolved-task.js";
import {
  captureOutput,
  fakeHttpClient,
  json,
  memoryConfigStore,
  testSession,
} from "../testing/test-layers.js";
import {
  checkFeatureProject,
  projectOrFeature,
  resolveFeature,
} from "./resolve-feature.js";

const feature = resolvedTaskFixture(1, { type: "feature" });

function resolve(task: Partial<TaskDetail>, workspaceId = "ws_1") {
  const loaded = { ...feature.task, ...task };
  const api = KaneoApiLayer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        fakeHttpClient((request) => {
          const path = new URL(request.url).pathname;
          if (path === "/api/task/by-ticket-id/KAN-1") return json(loaded);
          if (path === "/api/project/p1") return json(feature.project);
          return json({ message: "Not found" }, 404);
        }),
        testSession(),
        memoryConfigStore().layer,
      ),
    ),
  );
  return Effect.runPromise(
    Effect.result(
      resolveFeature(Option.some("KAN-1"), workspaceId).pipe(
        Effect.provide(Layer.mergeAll(api, captureOutput().layer)),
      ),
    ),
  );
}

const failureOf = (outcome: Result.Result<unknown, unknown>) =>
  Result.isFailure(outcome) ? outcome.failure : undefined;

describe("resolveFeature", () => {
  it("loads a feature", async () => {
    const outcome = await resolve({});
    expect(Result.isSuccess(outcome) && outcome.success?.task.id).toBe("t1");
  });

  it("does nothing without --feature", async () => {
    const effect = resolveFeature(Option.none(), "ws_1");
    expect(
      await Effect.runPromise(
        effect.pipe(
          Effect.provide(
            Layer.mergeAll(
              KaneoApiLayer.pipe(
                Layer.provideMerge(
                  Layer.mergeAll(
                    fakeHttpClient(() => json({})),
                    testSession(),
                    memoryConfigStore().layer,
                  ),
                ),
              ),
              captureOutput().layer,
            ),
          ),
        ),
      ),
    ).toBeUndefined();
  });

  it("refuses a plain task, and says how to make it a feature", async () => {
    expect(failureOf(await resolve({ type: "task" }))).toMatchObject({
      _tag: "InvalidArgument",
      message: "KAN-1 is not a feature.",
      hint: "Make it one with kaneo task edit KAN-1 --type feature, or pass a feature.",
    });
  });

  it("explains a server without features", async () => {
    expect(failureOf(await resolve({ type: undefined }))).toMatchObject({
      message: "KAN-1 is not a feature.",
      hint: "This Kaneo server has no features yet. Update it, then try again.",
    });
  });

  it("refuses a feature in another workspace", async () => {
    expect(failureOf(await resolve({}, "ws_2"))).toMatchObject({
      message: "KAN-1 is in another workspace.",
    });
  });
});

describe("projectOrFeature", () => {
  it("prefers the -p flag", () => {
    expect(projectOrFeature(Option.some("MOB"), feature)).toEqual(
      Option.some("MOB"),
    );
  });

  it("uses the feature's project without -p", () => {
    expect(projectOrFeature(Option.none(), feature)).toEqual(Option.some("p1"));
  });

  it("leaves the project open without a feature", () => {
    expect(projectOrFeature(Option.none(), undefined)).toEqual(Option.none());
  });
});

describe("checkFeatureProject", () => {
  it("accepts the feature's own project", () => {
    expect(
      Result.isSuccess(checkFeatureProject(feature, feature.project)),
    ).toBe(true);
  });

  it("refuses another project", () => {
    expect(
      failureOf(checkFeatureProject(feature, { id: "p2", name: "Mobile" })),
    ).toMatchObject({
      message: "KAN-1 is a feature of Kaneo Web, not Mobile.",
      hint: "A task can only belong to a feature in its own project.",
    });
  });
});
