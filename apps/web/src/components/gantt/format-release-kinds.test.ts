import { describe, expect, it } from "vite-plus/test";
import { formatReleaseKinds } from "./format-release-kinds";

describe("formatReleaseKinds", () => {
  it("joins two kinds the way the language does", () => {
    expect(formatReleaseKinds(["Code freeze", "Submission"], "en-US")).toBe(
      "Code freeze and Submission",
    );
    expect(formatReleaseKinds(["コードフリーズ", "提出"], "ja-JP")).toBe(
      "コードフリーズ、提出",
    );
    expect(formatReleaseKinds(["代码冻结", "提交"], "zh-CN")).toBe(
      "代码冻结和提交",
    );
  });

  it("leaves a single kind as it is", () => {
    expect(formatReleaseKinds(["Start"], "de-DE")).toBe("Start");
  });

  it("falls back to commas for a locale Intl rejects", () => {
    expect(formatReleaseKinds(["Start", "Code freeze"], "not a locale")).toBe(
      "Start, Code freeze",
    );
  });
});
