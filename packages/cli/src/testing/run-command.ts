import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Layer } from "effect";
import { KaneoApiLayer } from "../api/kaneo-api.js";
import {
  captureOutput,
  fakeHttpClient,
  json,
  memoryConfigStore,
  type RecordedRequest,
  testSession,
} from "./test-layers.js";

// Routes keyed by "METHOD /path"; anything else answers 404.
export type Routes = Readonly<
  Record<string, (request: RecordedRequest) => Response>
>;

// Runs a command's effect in JSON mode outside a terminal, against fake API
// routes, and returns its outcome, the requests it sent and its stdout.
export async function runCommand<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  routes: Routes,
) {
  const recorded: RecordedRequest[] = [];
  const output = captureOutput("json");
  const respond = (request: RecordedRequest) => {
    const route = routes[`${request.method} ${new URL(request.url).pathname}`];
    return route ? route(request) : json({ message: "Not Found" }, 404);
  };
  const layer = Layer.mergeAll(
    KaneoApiLayer.pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          fakeHttpClient(respond, recorded),
          testSession(),
          memoryConfigStore().layer,
        ),
      ),
    ),
    output.layer,
    NodeServices.layer,
  );
  // A service the layer lacks fails the test at run time.
  const provided = effect.pipe(Effect.provide(layer)) as Effect.Effect<
    A,
    E,
    never
  >;
  const result = await Effect.runPromise(Effect.result(provided));
  return {
    result,
    requests: recorded.map((request) => {
      const url = new URL(request.url);
      return [
        request.method,
        `${url.pathname}${url.search}`,
        request.body,
      ] as const;
    }),
    stdout: output.stdout,
    json: () => JSON.parse(output.stdout.join("")) as unknown,
  };
}
