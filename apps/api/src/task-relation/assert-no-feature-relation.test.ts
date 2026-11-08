import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vite-plus/test";
import { assertNoFeatureRelation } from "./assert-no-feature-relation";

describe("assertNoFeatureRelation", () => {
  it("allows Tasks and Bugs on both ends", () => {
    expect(() =>
      assertNoFeatureRelation({ type: "task" }, { type: "bug" }),
    ).not.toThrow();
  });

  it.each([
    ["source", { type: "feature" }, { type: "task" }],
    ["target", { type: "bug" }, { type: "feature" }],
  ])("refuses a Feature as the %s", (_, source, target) => {
    let error: unknown;
    try {
      assertNoFeatureRelation(source, target);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(HTTPException);
    expect(error).toMatchObject({
      status: 400,
      message: "Features do not have relations",
    });
  });
});
