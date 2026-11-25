import { describe, expect, it } from "vite-plus/test";
import { toResourceUrl } from "./to-resource-url";

describe("toResourceUrl", () => {
  it("keeps a full web address", () => {
    expect(toResourceUrl(" https://figma.com/file/abc ")).toBe(
      "https://figma.com/file/abc",
    );
    expect(toResourceUrl("http://wiki/Home")).toBe("http://wiki/Home");
  });

  it("adds https to an address typed without a scheme", () => {
    expect(toResourceUrl("figma.com/file/abc")).toBe(
      "https://figma.com/file/abc",
    );
    expect(toResourceUrl("localhost:3000/docs")).toBe(
      "https://localhost:3000/docs",
    );
    expect(toResourceUrl("staging.example.com:8443")).toBe(
      "https://staging.example.com:8443/",
    );
  });

  it("rejects anything a link should not open", () => {
    for (const input of [
      "",
      "   ",
      "design file",
      "figma",
      "javascript:alert(1)",
      "mailto:someone@example.com",
      "ftp://example.com/file",
      "https://user:secret@example.com",
    ])
      expect(toResourceUrl(input)).toBeNull();
  });
});
