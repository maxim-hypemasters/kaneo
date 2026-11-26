import { describe, expect, it } from "vite-plus/test";
import { pickOwnPullRequest } from "./pick-own-pull-request";

describe("pickOwnPullRequest", () => {
  it("skips pull requests from forks with the same branch name", () => {
    expect(
      pickOwnPullRequest(
        [
          {
            url: "https://github.com/acme/app/pull/9",
            isCrossRepository: true,
            headRepositoryOwner: { login: "stranger" },
          },
          {
            url: "https://github.com/acme/app/pull/4",
            isCrossRepository: false,
            headRepositoryOwner: { login: "Acme" },
          },
        ],
        "acme/app",
      ),
    ).toBe("https://github.com/acme/app/pull/4");
  });

  it("finds none when only forks or unknown heads match", () => {
    expect(
      pickOwnPullRequest(
        [
          {
            url: "https://github.com/acme/app/pull/9",
            isCrossRepository: true,
          },
          { url: "https://github.com/acme/app/pull/8" },
        ],
        "acme/app",
      ),
    ).toBeNull();
  });
});
