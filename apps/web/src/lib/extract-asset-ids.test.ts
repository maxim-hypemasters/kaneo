import { describe, expect, it } from "vite-plus/test";
import { extractAssetIds } from "./extract-asset-ids";

describe("extractAssetIds", () => {
  it("finds images and links with relative or absolute URLs once each", () => {
    expect(
      extractAssetIds(
        [
          "![diagram](/api/asset/abc123)",
          "[spec.pdf](https://kaneo.example/api/asset/def456)",
          "Again: ![diagram](/api/asset/abc123)",
        ].join("\n"),
      ),
    ).toEqual(new Set(["abc123", "def456"]));
  });

  it("ignores other URLs and empty text", () => {
    expect(
      extractAssetIds("[site](https://example.com/asset/abc) /api/assets/x"),
    ).toEqual(new Set());
    expect(extractAssetIds("")).toEqual(new Set());
  });
});
