import { describe, expect, it } from "vite-plus/test";
import { newMentionIds } from "./new-mention-ids";

const mention = (id: string) =>
  `<kaneo-mention id="${id}" label="${id}"></kaneo-mention>`;

describe("newMentionIds", () => {
  it("returns people mentioned only in the new text", () => {
    expect(
      newMentionIds(
        `Hi ${mention("ada")}`,
        `Hi ${mention("ada")} and ${mention("bo")}`,
        "me",
      ),
    ).toEqual(["bo"]);
  });

  it("leaves out the author and repeated mentions", () => {
    expect(
      newMentionIds(
        null,
        `${mention("me")} ${mention("bo")} ${mention("bo")}`,
        "me",
      ),
    ).toEqual(["bo"]);
  });

  it("treats a record's fields as one text", () => {
    expect(
      newMentionIds(
        [mention("ada"), null],
        [null, `${mention("ada")} ${mention("cy")}`, undefined],
        "me",
      ),
    ).toEqual(["cy"]);
  });

  it("finds nothing new in an unchanged or emptied text", () => {
    expect(newMentionIds(mention("ada"), mention("ada"), "me")).toEqual([]);
    expect(newMentionIds(mention("ada"), "", "me")).toEqual([]);
  });
});
