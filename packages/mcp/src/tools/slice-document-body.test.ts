import { describe, expect, it } from "vite-plus/test";
import { sliceDocumentBody } from "./slice-document-body.js";

describe("sliceDocumentBody", () => {
  it("returns a short body whole", () => {
    expect(sliceDocumentBody("# Plan")).toEqual({
      body: "# Plan",
      offset: 0,
      totalLength: 6,
      truncated: false,
      nextOffset: null,
    });
  });

  it("returns an empty body whole", () => {
    expect(sliceDocumentBody("")).toEqual({
      body: "",
      offset: 0,
      totalLength: 0,
      truncated: false,
      nextOffset: null,
    });
  });

  it("pages through a long body", () => {
    const first = sliceDocumentBody("abcdefghij", 0, 4);
    expect(first).toEqual({
      body: "abcd",
      offset: 0,
      totalLength: 10,
      truncated: true,
      nextOffset: 4,
    });
    const last = sliceDocumentBody("abcdefghij", 8, 4);
    expect(last).toEqual({
      body: "ij",
      offset: 8,
      totalLength: 10,
      truncated: true,
      nextOffset: null,
    });
  });

  it("defaults to 12,000 characters", () => {
    const slice = sliceDocumentBody("x".repeat(12_001));
    expect(slice.body).toHaveLength(12_000);
    expect(slice.nextOffset).toBe(12_000);
  });

  it("clamps offsets outside the body", () => {
    expect(sliceDocumentBody("abc", -5, 2)).toMatchObject({
      body: "ab",
      offset: 0,
      nextOffset: 2,
    });
    expect(sliceDocumentBody("abc", 99, 2)).toEqual({
      body: "",
      offset: 3,
      totalLength: 3,
      truncated: true,
      nextOffset: null,
    });
  });

  it("does not end a page between the halves of a surrogate pair", () => {
    const body = "ab😀cd";
    const first = sliceDocumentBody(body, 0, 3);
    expect(first).toMatchObject({ body: "ab", nextOffset: 2 });
    const second = sliceDocumentBody(body, 2, 3);
    expect(second).toMatchObject({ body: "😀c", nextOffset: 5 });
  });

  it("moves an offset inside a surrogate pair back to its start", () => {
    expect(sliceDocumentBody("ab😀cd", 3, 3)).toMatchObject({
      body: "😀c",
      offset: 2,
    });
  });

  it("returns a whole pair when the page is one code unit", () => {
    expect(sliceDocumentBody("😀😀", 0, 1)).toMatchObject({
      body: "😀",
      nextOffset: 2,
    });
  });

  it("reassembles the body from its pages", () => {
    const body = "Intro 😀 ".repeat(50);
    let offset: number | null = 0;
    let rebuilt = "";
    while (offset !== null) {
      const slice = sliceDocumentBody(body, offset, 7);
      rebuilt += slice.body;
      offset = slice.nextOffset;
    }
    expect(rebuilt).toBe(body);
  });
});
