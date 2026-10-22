import { expect, it } from "vite-plus/test";
import { suggestReleaseName } from "./suggest-release-name";

const release = (name: string, submissionDate = "2026-10-20") => ({
  name,
  submissionDate,
});

it.each([
  ["0.69", "0.70"],
  ["1.4.9", "1.4.10"],
  ["v1.4.9", "v1.4.10"],
  ["v0.69", "v0.70"],
  ["0.99", "0.100"],
  ["0.0.0", "0.0.1"],
  ["1.9007199254740992", "1.9007199254740993"],
  ["0." + "1".repeat(98), "0." + "1".repeat(97) + "2"],
])("increments the last integer in %s", (name, expected) => {
  expect(suggestReleaseName([release(name)])).toBe(expected);
});

it.each([
  "",
  "Demo · 0.69",
  "Release creation demo",
  "1",
  "1.2.3.4",
  "1.2.3-beta.1",
  "1.2.3+build.1",
  "V1.2.3",
  "01.2",
  "1.02",
  "1.2.03",
  " 1.2",
  "1.2 ",
  "1.2\n",
])("does not suggest a version for %j", (name) => {
  expect(suggestReleaseName([release(name)])).toBe("");
});

it("leaves the first release unnamed", () => {
  expect(suggestReleaseName([])).toBe("");
});

it("uses the latest submission, not the highest version or last array item", () => {
  expect(
    suggestReleaseName([
      release("9.99", "2026-10-01"),
      release("0.69", "2026-10-30"),
      release("3.0", "2026-10-20"),
    ]),
  ).toBe("0.70");
});

it("keeps the first release in stable query order when submissions tie", () => {
  expect(suggestReleaseName([release("0.69"), release("4.1")])).toBe("0.70");
});

it("does not search older releases when the latest name is custom", () => {
  expect(
    suggestReleaseName([
      release("0.69", "2026-10-20"),
      release("Autumn launch", "2026-10-30"),
    ]),
  ).toBe("");
});

it("skips occupied names without changing the source releases", () => {
  const releases = [
    release("v1.4.9", "2026-10-30"),
    release("v1.4.10"),
    release("v1.4.11"),
  ];
  const before = structuredClone(releases);
  expect(suggestReleaseName(releases)).toBe("v1.4.12");
  expect(releases).toEqual(before);
});

it("leaves the name blank when the next available version exceeds 100 characters", () => {
  expect(suggestReleaseName([release("0." + "9".repeat(98))])).toBe("");
  expect(
    suggestReleaseName([
      release("0." + "9".repeat(97) + "8", "2026-10-30"),
      release("0." + "9".repeat(98)),
    ]),
  ).toBe("");
});
