import { describe, expect, it } from "vite-plus/test";
import { hasTestCasesHeading, testCasesMarkdown } from "./test-cases-markdown";

describe("testCasesMarkdown", () => {
  it("writes a Test cases section, one heading per case", () => {
    expect(
      testCasesMarkdown([
        {
          title: "Signs in on Firefox",
          steps: "1. Open /login\n2. Submit",
          expectedResult: "The dashboard opens.",
        },
        { title: "Shows an error", steps: null, expectedResult: null },
      ]),
    ).toBe(
      [
        "## Test cases",
        "### 1. Signs in on Firefox",
        "**Steps**",
        "1. Open /login\n2. Submit",
        "**Expected result**",
        "The dashboard opens.",
        "### 2. Shows an error",
      ].join("\n\n"),
    );
  });

  it("reads its own output as having test cases", () => {
    const markdown = testCasesMarkdown([
      { title: "A", steps: null, expectedResult: null },
    ]);
    expect(hasTestCasesHeading(`Intro\n\n${markdown}`)).toBe(true);
  });
});

describe("hasTestCasesHeading", () => {
  it.each([
    "## Test cases",
    "# Test Cases",
    "### test cases:",
    "Intro\n\n  ## Test cases ##\n\n1. A",
  ])("finds %j", (description) => {
    expect(hasTestCasesHeading(description)).toBe(true);
  });

  it.each([
    null,
    "",
    "Test cases are missing",
    "## Test cases for login",
    "    ## Test cases",
    "**Test cases**",
  ])("does not count %j", (description) => {
    expect(hasTestCasesHeading(description)).toBe(false);
  });
});
