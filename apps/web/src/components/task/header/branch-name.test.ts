import { describe, expect, it } from "vite-plus/test";
import { generateBranchName } from "./branch-name";

describe("generateBranchName", () => {
  it("names a task feature/<id>/<title> by default", () => {
    expect(
      generateBranchName(
        undefined,
        "HYP",
        2,
        "Tooltip on task/bug card should show task/bug name",
        "task",
      ),
    ).toBe("feature/hyp-2/tooltip-on-task-bug-card-should-show-task-bug-name");
  });

  it("names a bug bugfix/<id>/<title> by default", () => {
    expect(
      generateBranchName(null, "HYP", 7, "Login button does nothing!", "bug"),
    ).toBe("bugfix/hyp-7/login-button-does-nothing");
  });

  it("treats an unknown type as a feature branch", () => {
    expect(generateBranchName("", "HYP", 3, "Fix", undefined)).toBe(
      "feature/hyp-3/fix",
    );
  });

  it("drops the title and its / when the title slugs to nothing", () => {
    expect(
      generateBranchName(undefined, "HYP", 7, "Кнопка не работает", "bug"),
    ).toBe("bugfix/hyp-7");
    expect(generateBranchName(undefined, "HYP", 2, undefined, "task")).toBe(
      "feature/hyp-2",
    );
  });

  it("keeps a - before an empty title, as older presets always did", () => {
    expect(generateBranchName("{number}-{title}", "HYP", 2, "!!", "task")).toBe(
      "2-",
    );
    expect(
      generateBranchName(
        "feature/{number}-{title}",
        "HYP",
        2,
        "Проверка",
        "bug",
      ),
    ).toBe("feature/2-");
  });

  it("keeps only ASCII letters and digits of the title", () => {
    expect(generateBranchName(undefined, "HYP", 2, "Café", "task")).toBe(
      "feature/hyp-2/caf",
    );
  });

  it.each([
    ["C++", "bugfix/c++-42/fix-login"],
    ["A.B", "bugfix/a.b-42/fix-login"],
    ["Q?", "bugfix/q?-42/fix-login"],
    ["$&X", "bugfix/$&x-42/fix-login"],
  ])("puts the project key %s in as written", (slug, branch) => {
    expect(generateBranchName(undefined, slug, 42, "Fix login", "bug")).toBe(
      branch,
    );
    expect(
      generateBranchName("{slug}-{number}", slug, 42, "Fix login", "bug"),
    ).toBe(`${slug.toLowerCase()}-42-fix-login`);
  });

  it("cuts the title to 50 characters without a trailing dash", () => {
    const name = generateBranchName(
      undefined,
      "HYP",
      4,
      "Make the board load faster when a project has few tasks",
      "task",
    );
    expect(name).toBe(
      "feature/hyp-4/make-the-board-load-faster-when-a-project-has-few",
    );
  });

  it("keeps adding the title to the explicitly stored old default", () => {
    expect(
      generateBranchName(
        "{slug}-{number}",
        "KAN",
        42,
        "Add rate limiting!",
        "bug",
      ),
    ).toBe("kan-42-add-rate-limiting");
    expect(generateBranchName("{slug}-{number}", "KAN", 42, "", "task")).toBe(
      "kan-42-",
    );
  });

  it("follows other explicit presets unchanged", () => {
    expect(
      generateBranchName(
        "feature/{number}-{title}",
        "KAN",
        7,
        "Fix login",
        "bug",
      ),
    ).toBe("feature/7-fix-login");
    expect(
      generateBranchName("fix/{slug}-{number}", "KAN", 7, "Fix login", "bug"),
    ).toBe("fix/kan-7");
    expect(
      generateBranchName(
        "{slug}-{number}-{title}",
        "KAN",
        7,
        "Fix login",
        "task",
      ),
    ).toBe("kan-7-fix-login");
  });

  it("needs a project slug and task number", () => {
    expect(generateBranchName(undefined, undefined, 7, "Fix", "task")).toBe("");
    expect(generateBranchName(undefined, "KAN", null, "Fix", "task")).toBe("");
  });
});
