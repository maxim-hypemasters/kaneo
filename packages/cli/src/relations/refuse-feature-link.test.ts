import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { resolvedTaskFixture } from "../testing/resolved-task.js";
import { refuseFeatureLink } from "./refuse-feature-link.js";

describe("refuseFeatureLink", () => {
  it("lets a Task and a Bug link", () => {
    expect(
      refuseFeatureLink({
        task: resolvedTaskFixture(1),
        other: resolvedTaskFixture(2, { type: "bug" }),
      }),
    ).toEqual(Result.succeed(undefined));
  });

  it("lets tasks from a server without features link", () => {
    expect(
      Result.isSuccess(
        refuseFeatureLink({
          task: resolvedTaskFixture(1, { type: undefined }),
          other: resolvedTaskFixture(2, { type: undefined }),
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [
      "the first task",
      resolvedTaskFixture(1, { type: "feature" }),
      resolvedTaskFixture(2),
      "KAN-1",
    ],
    [
      "the other task",
      resolvedTaskFixture(1),
      resolvedTaskFixture(2, { type: "feature" }),
      "KAN-2",
    ],
  ])("names the feature when it is %s", (_, task, other, key) => {
    const result = refuseFeatureLink({ task, other });
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "InvalidArgument",
        message: `${key} is a feature, and features don't have relations.`,
        hint: "To put a task into a feature, run kaneo task edit <task> --feature <feature>.",
      });
    }
  });
});
