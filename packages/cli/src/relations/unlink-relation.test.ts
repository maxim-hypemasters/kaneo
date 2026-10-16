import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { KaneoApiLayer } from "../api/kaneo-api.js";
import type { TaskRelation } from "../api/task-relations.js";
import {
  fakeHttpClient,
  json,
  memoryConfigStore,
  type RecordedRequest,
  testSession,
} from "../testing/test-layers.js";
import { unlinkRelation } from "./unlink-relation.js";

async function unlink(relation: TaskRelation) {
  const recorded: RecordedRequest[] = [];
  const api = KaneoApiLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        fakeHttpClient(() => json({ ...relation }), recorded),
        testSession(),
        memoryConfigStore().layer,
      ),
    ),
  );
  await Effect.runPromise(unlinkRelation(relation).pipe(Effect.provide(api)));
  return recorded.map((request) => [
    request.method,
    new URL(request.url).pathname,
    request.body,
  ]);
}

describe("unlinkRelation", () => {
  it("takes a task out of its feature for a feature link", async () => {
    expect(
      await unlink({
        id: "feature:t3:t1",
        sourceTaskId: "t1",
        targetTaskId: "t3",
        relationType: "subtask",
      }),
    ).toEqual([["PUT", "/api/task/feature/t3", { featureId: null }]]);
  });

  it("deletes a subtask relation listed by a server from before features", async () => {
    expect(
      await unlink({
        id: "r9",
        sourceTaskId: "t1",
        targetTaskId: "t3",
        relationType: "subtask",
      }),
    ).toEqual([["DELETE", "/api/task-relation/r9", undefined]]);
  });

  it("deletes any other relation", async () => {
    expect(
      await unlink({
        id: "r1",
        sourceTaskId: "t1",
        targetTaskId: "t3",
        relationType: "blocks",
      }),
    ).toEqual([["DELETE", "/api/task-relation/r1", undefined]]);
  });
});
