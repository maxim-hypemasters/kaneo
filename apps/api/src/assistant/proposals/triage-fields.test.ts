import { describe, expect, it } from "vite-plus/test";
import type { AssistantProposalField } from "../message-types";
import { NESTED_TRIAGE_NOTE, TRIAGE_NOTE, withTriage } from "./triage-fields";

const title: AssistantProposalField = {
  key: "title",
  kind: "text",
  value: "Export fails",
};
const status: AssistantProposalField = {
  key: "status",
  kind: "text",
  value: "in-progress",
};
const note = (value: string): AssistantProposalField => ({
  key: "triage",
  kind: "text",
  value,
});

describe("withTriage", () => {
  it("leaves a card alone when nothing waits in Triage", () => {
    expect(withTriage([title, status], null, "in-progress")).toEqual([
      title,
      status,
    ]);
  });

  it("replaces the requested status with triage, in place", () => {
    expect(withTriage([status, title], "self", "in-progress")).toEqual([
      { key: "status", kind: "text", value: "triage", from: "in-progress" },
      title,
      note(TRIAGE_NOTE),
    ]);
  });

  it("adds the triage status when none was requested", () => {
    expect(withTriage([title], "self", undefined)).toEqual([
      title,
      { key: "status", kind: "text", value: "triage" },
      note(TRIAGE_NOTE),
    ]);
  });

  it("only notes nested work, leaving the card's own status", () => {
    expect(withTriage([title], "nested", undefined)).toEqual([
      title,
      note(NESTED_TRIAGE_NOTE),
    ]);
  });
});
