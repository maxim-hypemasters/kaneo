import { describe, expect, it } from "vite-plus/test";
import { resolveAllowanceDraft } from "./allowance-draft";

const strict = { allowEmpty: false };
const optional = { allowEmpty: true };

describe("resolveAllowanceDraft", () => {
  it("does nothing when nothing was typed", () => {
    expect(resolveAllowanceDraft(null, 25, strict)).toEqual({
      kind: "unchanged",
    });
  });

  it("saves a new whole number of days", () => {
    expect(resolveAllowanceDraft(" 30 ", 25, strict)).toEqual({
      kind: "save",
      days: 30,
    });
    expect(resolveAllowanceDraft("0", null, optional)).toEqual({
      kind: "save",
      days: 0,
    });
    expect(resolveAllowanceDraft("366", 25, strict)).toEqual({
      kind: "save",
      days: 366,
    });
  });

  it("skips a value equal to the saved one", () => {
    expect(resolveAllowanceDraft("25", 25, strict)).toEqual({
      kind: "unchanged",
    });
    expect(resolveAllowanceDraft("025", 25, strict)).toEqual({
      kind: "unchanged",
    });
  });

  it("rejects anything but a whole number from 0 to 366", () => {
    for (const text of ["367", "-1", "2.5", "1e2", "ten", "12 3"]) {
      expect(resolveAllowanceDraft(text, 25, strict)).toEqual({
        kind: "invalid",
      });
    }
  });

  it("requires a value when the field can't be empty", () => {
    expect(resolveAllowanceDraft("  ", 25, strict)).toEqual({
      kind: "invalid",
    });
  });

  it("clears an override when emptied", () => {
    expect(resolveAllowanceDraft("", 30, optional)).toEqual({
      kind: "save",
      days: null,
    });
    expect(resolveAllowanceDraft("", null, optional)).toEqual({
      kind: "unchanged",
    });
  });
});
