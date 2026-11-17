import { describe, expect, it } from "vite-plus/test";
import { classifyMarkdownHref, safeMarkdownUrl } from "./markdown-href";

describe("classifyMarkdownHref", () => {
  it("routes dashboard paths and the workspace's task permalinks in-app", () => {
    expect(
      classifyMarkdownHref("/dashboard/workspace/w1/project/p1", "acme"),
    ).toEqual({ kind: "app", href: "/dashboard/workspace/w1/project/p1" });
    expect(
      classifyMarkdownHref(
        "/dashboard/workspace/w1/project/p1?tab=documents&documentId=d1",
        "acme",
      ),
    ).toEqual({
      kind: "app",
      href: "/dashboard/workspace/w1/project/p1?tab=documents&documentId=d1",
    });
    expect(classifyMarkdownHref("/acme/task/KAN-12", "acme")).toEqual({
      kind: "app",
      href: "/acme/task/KAN-12",
    });
  });

  it("keeps other relative links as plain same-site links", () => {
    expect(classifyMarkdownHref("/other/task/KAN-1", "acme")).toEqual({
      kind: "relative",
      href: "/other/task/KAN-1",
    });
    expect(classifyMarkdownHref("/acme/task/KAN-1")).toEqual({
      kind: "relative",
      href: "/acme/task/KAN-1",
    });
    expect(classifyMarkdownHref("#notes")).toEqual({
      kind: "relative",
      href: "#notes",
    });
  });

  it("treats http, https, mailto and protocol-relative links as external", () => {
    for (const href of [
      "https://example.com/a?b=1",
      "http://example.com",
      "mailto:ada@example.com",
      "//example.com/path",
      "HTTPS://EXAMPLE.COM",
    ]) {
      expect(classifyMarkdownHref(href, "acme")).toEqual({
        kind: "external",
        href,
      });
    }
  });

  it("drops every other scheme, however it is disguised", () => {
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "\u0001javascript:alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "blob:https://example.com/x",
      "https://user:pass@example.com",
      "/\\evil.com",
      "",
      "   ",
    ]) {
      expect(classifyMarkdownHref(href, "acme"), href).toBeNull();
    }
  });
});

describe("safeMarkdownUrl", () => {
  it("passes safe links through and removes unsafe ones", () => {
    expect(safeMarkdownUrl("https://example.com")).toBe("https://example.com");
    expect(safeMarkdownUrl("/dashboard/x")).toBe("/dashboard/x");
    expect(safeMarkdownUrl("javascript:alert(1)")).toBeNull();
  });
});
