import { describe, expect, it } from "vite-plus/test";
import { formatUsd } from "./format-usd";

describe("formatUsd", () => {
  it("shows dollars with cents", () => {
    expect(formatUsd(3, "en-US")).toBe("$3.00");
    expect(formatUsd(12.345, "en-US")).toBe("$12.35");
    expect(formatUsd(0, "en-US")).toBe("$0.00");
  });

  it("keeps the precision of prices below a dollar", () => {
    expect(formatUsd(0.075, "en-US")).toBe("$0.075");
    expect(formatUsd(0.5, "en-US")).toBe("$0.50");
    expect(formatUsd(0.00012, "en-US")).toBe("$0.0001");
  });
});
