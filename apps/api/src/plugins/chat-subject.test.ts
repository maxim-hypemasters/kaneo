import { describe, expect, it } from "vite-plus/test";
import { chatSubject } from "./chat-subject";

describe("chatSubject", () => {
  it("names a Feature without workflow fields", () => {
    expect(chatSubject("feature")).toEqual({
      noun: "feature",
      label: "Feature",
      showsWorkflow: false,
    });
  });

  it.each(["task", "bug", null] as const)(
    "keeps the task wording for %s",
    (type) => {
      expect(chatSubject(type)).toEqual({
        noun: "task",
        label: "Task",
        showsWorkflow: true,
      });
    },
  );
});
