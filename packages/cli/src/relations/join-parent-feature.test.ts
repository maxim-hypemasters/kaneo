import { Effect, Layer, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { KaneoApiLayer } from "../api/kaneo-api.js";
import { resolvedTaskFixture } from "../testing/resolved-task.js";
import {
  fakeHttpClient,
  json,
  memoryConfigStore,
  type RecordedRequest,
  testSession,
} from "../testing/test-layers.js";
import type { ResolvedTask } from "../tasks/resolve-task.js";
import { joinParentFeature } from "./join-parent-feature.js";

function run(parent: ResolvedTask, child: ResolvedTask) {
  const recorded: RecordedRequest[] = [];
  const api = KaneoApiLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        fakeHttpClient(() => json({ id: "updated" }), recorded),
        testSession(),
        memoryConfigStore().layer,
      ),
    ),
  );
  const result = Effect.runPromise(
    Effect.result(joinParentFeature(parent, child).pipe(Effect.provide(api))),
  );
  const calls = () =>
    recorded.map((request) => [
      request.method,
      new URL(request.url).pathname,
      request.body,
    ]);
  return { result, calls };
}

const child = resolvedTaskFixture(3);

describe("joinParentFeature", () => {
  it("puts the child into a parent that is a feature", async () => {
    const parent = resolvedTaskFixture(1, { type: "feature" });
    const { result, calls } = run(parent, child);
    expect(await result).toEqual(
      Result.succeed({ featureId: "t1", madeFeature: false }),
    );
    expect(calls()).toEqual([
      ["PUT", "/api/task/feature/t3", { featureId: "t1" }],
    ]);
  });

  it("rejects a plain parent instead of converting it", async () => {
    const { result, calls } = run(resolvedTaskFixture(1), child);
    const outcome = await result;
    expect(Result.isFailure(outcome)).toBe(true);
    expect(calls()).toEqual([]);
  });

  it("uses the feature a parent is in", async () => {
    const parent = resolvedTaskFixture(1, { featureId: "t9" });
    const { result, calls } = run(parent, child);
    expect(await result).toEqual(
      Result.succeed({ featureId: "t9", madeFeature: false }),
    );
    expect(calls()).toEqual([
      ["PUT", "/api/task/feature/t3", { featureId: "t9" }],
    ]);
  });

  it.each([
    [
      "the child is a feature",
      resolvedTaskFixture(1),
      resolvedTaskFixture(3, { type: "feature" }),
      "KAN-3 is a feature, and a feature can't belong to one.",
    ],
    [
      "the tasks are in different projects",
      resolvedTaskFixture(1, { type: "feature" }),
      resolvedTaskFixture(3, {}, { id: "p2", slug: "mob" }),
      "MOB-3 and KAN-1 are in different projects.",
    ],
    [
      "the child is already in the feature",
      resolvedTaskFixture(1, { type: "feature" }),
      resolvedTaskFixture(3, { featureId: "t1" }),
      "KAN-3 is already in this feature.",
    ],
    [
      "the server has no features",
      resolvedTaskFixture(1, { type: undefined }),
      child,
      "KAN-1 is not a feature.",
    ],
  ])("changes nothing when %s", async (_, parent, task, message) => {
    const { result, calls } = run(parent, task);
    const outcome = await result;
    expect(Result.isFailure(outcome)).toBe(true);
    if (Result.isFailure(outcome)) {
      expect(outcome.failure).toMatchObject({
        _tag: "InvalidArgument",
        message,
      });
    }
    expect(calls()).toEqual([]);
  });
});
