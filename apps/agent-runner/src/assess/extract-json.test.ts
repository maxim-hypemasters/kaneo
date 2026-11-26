import { describe, expect, it } from "vite-plus/test";
import { extractJson } from "./extract-json";

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"score": 80}')).toEqual({ score: 80 });
  });

  it("parses a fenced object with prose around it", () => {
    expect(
      extractJson('Here you go:\n```json\n{"score": 70, "a": [1]}\n```\nDone.'),
    ).toEqual({ score: 70, a: [1] });
  });

  it("returns null for no or broken JSON", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{ score: }")).toBeNull();
  });
});
