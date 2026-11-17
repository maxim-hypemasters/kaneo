import { expect, it } from "vite-plus/test";
import { visibleFields } from "./visible-fields";

const fields = [
  { key: "taskId", kind: "ref" as const, value: "KAN-12 Fix login" },
  { key: "title", kind: "text" as const, value: "KAN-12 Fix login" },
  { key: "featureId", kind: "ref" as const, value: "Onboarding" },
  {
    key: "milestoneId",
    kind: "ref" as const,
    value: "KAN-12 Fix login",
    from: null,
  },
];

it("drops only the field whose key the card's target shows", () => {
  expect(
    visibleFields({ targetKey: "taskId", fields }).map((field) => field.key),
  ).toEqual(["title", "featureId", "milestoneId"]);
});

it("keeps fields whose value only looks like the target", () => {
  // Same label as the target, different argument.
  expect(
    visibleFields({ targetKey: "projectId", fields }).map((field) => field.key),
  ).toEqual(["taskId", "title", "featureId", "milestoneId"]);
  expect(visibleFields({ targetKey: null, fields })).toEqual(fields);
});

it("keeps the target's field when it changes something", () => {
  expect(
    visibleFields({ targetKey: "milestoneId", fields }).map(
      (field) => field.key,
    ),
  ).toEqual(["taskId", "title", "featureId", "milestoneId"]);
});
