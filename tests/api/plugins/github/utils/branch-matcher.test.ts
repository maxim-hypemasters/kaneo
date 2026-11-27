import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  branchPatterns,
  type GitHubConfig,
  TYPED_BRANCH_PATTERN,
} from "../../../../../apps/api/src/plugins/github/config";
import {
  createBranchRegex,
  extractTaskNumber,
  extractTaskNumberFromBranch,
  extractTaskNumberFromPRBody,
  extractTaskNumberFromPRTitle,
  generateBranchName,
} from "../../../../../apps/api/src/plugins/github/utils/branch-matcher";

const baseConfig: GitHubConfig = {
  repositoryOwner: "kaneo",
  repositoryName: "api",
  installationId: 1,
  branchPattern: "{slug}-{number}",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateBranchName", () => {
  it("fills placeholders and slugifies the title", () => {
    expect(
      generateBranchName(
        "feature/{slug}-{number}-{title}",
        "KAN",
        42,
        "Fix login: SSO + invites",
        "task",
      ),
    ).toBe("feature/kan-42-fix-login-sso-invites");
  });

  it("names a task's branch feature/ and a bug's bugfix/", () => {
    expect(
      generateBranchName(
        TYPED_BRANCH_PATTERN,
        "HYP",
        2,
        "Tooltip on Task/Bug card should show Task/Bug name",
        "task",
      ),
    ).toBe("feature/hyp-2/tooltip-on-task-bug-card-should-show-task-bug-name");
    expect(
      generateBranchName(
        TYPED_BRANCH_PATTERN,
        "HYP",
        7,
        "Login button does nothing",
        "bug",
      ),
    ).toBe("bugfix/hyp-7/login-button-does-nothing");
  });

  it("cuts the title to 50 characters without a trailing dash", () => {
    const branch = generateBranchName(
      TYPED_BRANCH_PATTERN,
      "HYP",
      2,
      `${"a".repeat(49)} b`,
      "task",
    );

    expect(branch).toBe(`feature/hyp-2/${"a".repeat(49)}`);
  });

  it("drops an empty title with its / under the typed pattern", () => {
    expect(
      generateBranchName(TYPED_BRANCH_PATTERN, "HYP", 2, "Проверка", "task"),
    ).toBe("feature/hyp-2");
    expect(generateBranchName(TYPED_BRANCH_PATTERN, "HYP", 2, "", "bug")).toBe(
      "bugfix/hyp-2",
    );
  });

  it("keeps only ASCII letters and digits of the title", () => {
    expect(
      generateBranchName(TYPED_BRANCH_PATTERN, "HYP", 2, "Café", "task"),
    ).toBe("feature/hyp-2/caf");
  });
});

// Expected values are what these presets produced before the typed pattern
// was added; they must not change for projects that keep them.
describe("older presets", () => {
  it.each([
    ["{slug}-{number}", "Fix login", "hyp-2"],
    ["{slug}-{number}-{title}", "Fix login", "hyp-2-fix-login"],
    ["{slug}-{number}-{title}", "Проверка", "hyp-2-"],
    ["{number}-{title}", "", "2-"],
    ["feature/{number}-{title}", "!!!", "feature/2-"],
    ["fix/{slug}-{number}", "Fix login", "fix/hyp-2"],
    ["{number}", "Fix login", "2"],
  ])("%s names %j as before", (pattern, title, branch) => {
    expect(generateBranchName(pattern, "HYP", 2, title, "bug")).toBe(branch);
  });

  it.each([
    ["{number}-{title}", "2024", null],
    ["{number}-{title}", "2-fix-login", 2],
    ["{number}-{title}", "2-", 2],
    ["{slug}-{number}-{title}", "hyp-2", null],
    ["{slug}-{number}-{title}", "hyp-2-", 2],
    ["{slug}-{number}-{title}", "HYP-2-Fix-Login", 2],
    ["{slug}-{number}-{title}", "hyp-2/fix", null],
    ["{slug}-{number}", "hyp-2", 2],
    ["{slug}-{number}", "hyp-2-fix", 2],
    ["{slug}-{number}", "hyp-2x", null],
    ["feature/{number}-{title}", "feature/2", null],
    ["feature/{number}-{title}", "feature/2-fix", 2],
    ["fix/{slug}-{number}", "fix/hyp-2", 2],
    ["fix/{slug}-{number}", "feature/hyp-2", null],
    ["{number}", "2-fix", 2],
  ])("%s matches %s as before", (pattern, branch, taskNumber) => {
    expect(
      extractTaskNumberFromBranch(branch, { branchPattern: pattern }, "HYP"),
    ).toBe(taskNumber);
  });
});

describe("project keys with RegExp characters", () => {
  it.each([
    ["C++", "bugfix/c++-42/fix-login"],
    ["A.B", "bugfix/a.b-42/fix-login"],
    ["Q?", "bugfix/q?-42/fix-login"],
    ["$&X", "bugfix/$&x-42/fix-login"],
  ])("names and matches %s literally", (slug, branch) => {
    for (const pattern of branchPatterns) {
      const name = generateBranchName(pattern, slug, 42, "Fix login", "bug");

      expect(
        extractTaskNumberFromBranch(name, { branchPattern: pattern }, slug),
      ).toBe(42);
    }
    expect(
      generateBranchName(TYPED_BRANCH_PATTERN, slug, 42, "Fix login", "bug"),
    ).toBe(branch);
    expect(
      generateBranchName("{slug}-{number}-{title}", slug, 42, "Fix", "bug"),
    ).toBe(`${slug.toLowerCase()}-42-fix`);
  });

  it("does not read the key's characters as RegExp syntax", () => {
    const taskNumber = (branch: string, slug: string) =>
      extractTaskNumberFromBranch(branch, {}, slug);

    expect(taskNumber("bugfix/axb-42/fix", "A.B")).toBeNull();
    expect(taskNumber("bugfix/-42/fix", "Q?")).toBeNull();
    expect(taskNumber("bugfix/cc-42/fix", "C++")).toBeNull();
    expect(taskNumber("bugfix/c++-42/fix", "C++")).toBe(42);
  });
});

describe("createBranchRegex", () => {
  it("matches default patterns and optional suffixes", () => {
    const regex = createBranchRegex("{slug}-{number}-{title}", "KAN");

    expect(regex.test("kan-7-polish-sidebar")).toBe(true);
    expect(regex.test("kan-7-polish-sidebar-part-2")).toBe(true);
    expect(regex.test("ops-7-polish-sidebar")).toBe(false);
  });

  it("matches typed branches with or without a title", () => {
    const config = { ...baseConfig, branchPattern: TYPED_BRANCH_PATTERN };
    const taskNumber = (branch: string) =>
      extractTaskNumberFromBranch(branch, config, "HYP");

    expect(taskNumber("feature/hyp-2/tooltip-on-task-bug-card")).toBe(2);
    expect(taskNumber("bugfix/hyp-7/login-button-does-nothing")).toBe(7);
    expect(taskNumber("feature/hyp-2")).toBe(2);
    expect(taskNumber("Bugfix/HYP-7/Login-Button")).toBe(7);
  });

  it("does not match other branches under the typed pattern", () => {
    const config = { ...baseConfig, branchPattern: TYPED_BRANCH_PATTERN };
    const taskNumber = (branch: string) =>
      extractTaskNumberFromBranch(branch, config, "HYP");

    expect(taskNumber("hyp-2")).toBeNull();
    expect(taskNumber("hyp-2-tooltip")).toBeNull();
    expect(taskNumber("fix/hyp-2/tooltip")).toBeNull();
    expect(taskNumber("feature/ops-2/tooltip")).toBeNull();
    expect(taskNumber("feature/hyp-2x")).toBeNull();
  });
});

describe("branch names round trip", () => {
  // slugify keeps only ASCII alphanumerics, so a title written in any other
  // script leaves nothing where {title} goes.
  it.each([
    ["Проверка входа", "Cyrillic"],
    ["ログイン修正", "Japanese"],
    ["登录修复", "Chinese"],
    ["수정", "Korean"],
    ["Διόρθωση", "Greek"],
  ])("matches the branch it generated for %s (%s)", (title) => {
    for (const pattern of branchPatterns) {
      const config = { ...baseConfig, branchPattern: pattern };
      const branch = generateBranchName(pattern, "KAN", 42, title, "bug");

      expect(extractTaskNumberFromBranch(branch, config, "KAN")).toBe(42);
    }
  });

  it("matches the branch it generated for a Latin title", () => {
    const pattern = "{slug}-{number}-{title}";
    const config = { ...baseConfig, branchPattern: pattern };
    const branch = generateBranchName(
      pattern,
      "KAN",
      42,
      "Fix the login bug",
      "bug",
    );

    expect(branch).toBe("kan-42-fix-the-login-bug");
    expect(extractTaskNumberFromBranch(branch, config, "KAN")).toBe(42);
  });

  it("matches every preset's branch for a Latin title", () => {
    for (const pattern of branchPatterns) {
      const config = { ...baseConfig, branchPattern: pattern };
      const branch = generateBranchName(
        pattern,
        "KAN",
        42,
        "Fix the login bug",
        "task",
      );

      expect(extractTaskNumberFromBranch(branch, config, "KAN")).toBe(42);
    }
  });
});

describe("extractTaskNumberFromBranch", () => {
  it("uses the configured branch pattern", () => {
    expect(
      extractTaskNumberFromBranch("kan-17-refine-search", baseConfig, "KAN"),
    ).toBe(17);
  });

  it("falls back to the typed pattern when none is set", () => {
    const config = { ...baseConfig, branchPattern: undefined };

    expect(
      extractTaskNumberFromBranch(
        "feature/kan-17/refine-search",
        config,
        "KAN",
      ),
    ).toBe(17);
    expect(
      extractTaskNumberFromBranch("kan-17-refine-search", config, "KAN"),
    ).toBeNull();
  });

  it("supports custom regex patterns", () => {
    expect(
      extractTaskNumberFromBranch(
        "feature/TASK-33",
        {
          ...baseConfig,
          customBranchRegex: "TASK-(\\d+)",
        },
        "KAN",
      ),
    ).toBe(33);
  });

  it("returns null and logs when the custom regex is invalid", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(
      extractTaskNumberFromBranch(
        "feature/TASK-33",
        {
          ...baseConfig,
          customBranchRegex: "(",
        },
        "KAN",
      ),
    ).toBeNull();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe("extractTaskNumberFromPRTitle", () => {
  it.each(["task 21", "task: 21", "task-21", "task#21"])(
    "recognizes the delimited marker %s in titles and bodies",
    (reference) => {
      const projectSlug = "KAN";

      const titleTaskNumber = extractTaskNumberFromPRTitle(
        reference,
        projectSlug,
      );
      const bodyTaskNumber = extractTaskNumberFromPRBody(
        reference,
        projectSlug,
      );

      expect(titleTaskNumber).toBe(21);
      expect(bodyTaskNumber).toBe(21);
    },
  );

  it("recognizes explicit task references", () => {
    const projectSlug = "KAN";
    const conventionalTitle = "feat(KAN-42): copy text";
    const bracketedTitle = "[kan-42] Copy text";
    const taskMarkerTitle = "Task: 55 tidy auth flow";

    const conventionalTaskNumber = extractTaskNumberFromPRTitle(
      conventionalTitle,
      projectSlug,
    );
    const bracketedTaskNumber = extractTaskNumberFromPRTitle(
      bracketedTitle,
      projectSlug,
    );
    const markerTaskNumber = extractTaskNumberFromPRTitle(
      taskMarkerTitle,
      projectSlug,
    );

    expect(conventionalTaskNumber).toBe(42);
    expect(bracketedTaskNumber).toBe(42);
    expect(markerTaskNumber).toBe(55);
  });

  it.each([
    "[12] Ship notifications",
    "Fix sidebar (#34)",
    "55: tidy auth flow",
    "Release (61)",
    "feat(OTHER-42): copy text",
    "feat(XKAN-42): copy text",
    "feat(KAN-42extra): copy text",
    "task42",
    "Refactor task61 renderer",
  ])("does not treat %s as a local task", (title) => {
    const projectSlug = "KAN";

    const taskNumber = extractTaskNumberFromPRTitle(title, projectSlug);

    expect(taskNumber).toBeNull();
  });
});

describe("extractTaskNumberFromPRBody", () => {
  it("recognizes task references in the body", () => {
    const projectSlug = "KAN";
    const issueReference = "Closes #21";
    const taskMarker = "task: 77";
    const projectReference = "Implements KAN-42";
    const unlinkedBody = "No linked task";

    const issueTaskNumber = extractTaskNumberFromPRBody(issueReference);
    const markerTaskNumber = extractTaskNumberFromPRBody(taskMarker);
    const projectTaskNumber = extractTaskNumberFromPRBody(
      projectReference,
      projectSlug,
    );
    const unlinkedTaskNumber = extractTaskNumberFromPRBody(unlinkedBody);

    expect(issueTaskNumber).toBeNull();
    expect(markerTaskNumber).toBe(77);
    expect(projectTaskNumber).toBe(42);
    expect(unlinkedTaskNumber).toBeNull();
  });

  it.each([
    "https://kaneo.example.com/acme/task/KAN-42",
    "https://kaneo.example.com/acme/task/KAN-42/fix-kan-7-login",
    "[Task](https://kaneo.example.com/acme/task/kan-42/fix-login)",
  ])("recognizes the short task link %s", (body) => {
    expect(extractTaskNumberFromPRBody(body, "KAN")).toBe(42);
  });

  it("ignores a workspace slug that looks like a ticket ID", () => {
    expect(
      extractTaskNumberFromPRBody(
        "See https://kaneo.example.com/kan-42/task/OPS-5/fix-login",
        "KAN",
      ),
    ).toBeNull();
    expect(
      extractTaskNumberFromPRBody(
        "See https://kaneo.example.com/KAN-42/task/OPS-5.",
        "KAN",
      ),
    ).toBeNull();
  });

  it("reads a short link that ends a sentence", () => {
    expect(
      extractTaskNumberFromPRBody(
        "Fixes https://kaneo.example.com/acme/task/KAN-42.",
        "KAN",
      ),
    ).toBe(42);
  });

  it("ignores the project key in another project's link title", () => {
    expect(
      extractTaskNumberFromPRBody(
        "See https://kaneo.example.com/acme/task/OPS-5/kan-7-follow-up",
        "KAN",
      ),
    ).toBeNull();
  });

  it("does not join text around a link into a task marker", () => {
    expect(
      extractTaskNumberFromPRBody("Task https://example.com 123", "KAN"),
    ).toBeNull();
  });

  it("ignores task markers inside another project's link", () => {
    expect(
      extractTaskNumberFromPRBody(
        "See https://kaneo.example.com/acme/task/OPS-5/fix-task-3-sorting",
        "KAN",
      ),
    ).toBeNull();
    expect(
      extractTaskNumberFromPRBody(
        "task: 7, see https://kaneo.example.com/acme/task/OPS-5/fix-task-3",
        "KAN",
      ),
    ).toBe(7);
  });

  it("recognizes a short task link with a non-Latin project key", () => {
    expect(
      extractTaskNumberFromPRBody(
        "https://kaneo.example.com/acme/task/ПРО-42/fix-login",
        "ПРО",
      ),
    ).toBe(42);
  });

  it.each([
    "Closes #61",
    "Fixes #61",
    "Resolves #61",
    "Closes 61",
    "Fixes acme/repo#61",
    "task42",
    "Refactor task61 renderer",
  ])("does not interpret %s as a local task", (body) => {
    const projectSlug = "KAN";

    const taskNumber = extractTaskNumberFromPRBody(body, projectSlug);

    expect(taskNumber).toBeNull();
  });
});

describe("extractTaskNumber", () => {
  it("prefers the branch match before title and body", () => {
    expect(
      extractTaskNumber(
        "kan-88-polish-editor",
        "[KAN-12] Ship notifications",
        "Closes #21",
        baseConfig,
        "KAN",
      ),
    ).toBe(88);
  });

  it("falls back to the title and then body", () => {
    expect(
      extractTaskNumber(
        "misc-branch",
        "[KAN-12] Ship notifications",
        "Closes #21",
        baseConfig,
        "KAN",
      ),
    ).toBe(12);

    expect(
      extractTaskNumber(
        "misc-branch",
        undefined,
        "Resolves task 21",
        baseConfig,
        "KAN",
      ),
    ).toBe(21);
  });

  it("accepts task number 0 from the branch before other matches", () => {
    expect(
      extractTaskNumber(
        "kan-0-initial-setup",
        "[99] Other task",
        undefined,
        baseConfig,
        "KAN",
      ),
    ).toBe(0);
  });

  it("does not confuse the remote closing issue with a project key", () => {
    expect(
      extractTaskNumber(
        "codex/kan-42-copy-message-text",
        "feat(KAN-42): copy message text",
        "Closes #61",
        baseConfig,
        "KAN",
      ),
    ).toBe(42);
  });

  it("leaves issue-only references for remote issue resolution", () => {
    expect(
      extractTaskNumber(
        "misc-branch",
        "Fix #61",
        "Closes #61",
        baseConfig,
        "KAN",
      ),
    ).toBeNull();
  });
});
