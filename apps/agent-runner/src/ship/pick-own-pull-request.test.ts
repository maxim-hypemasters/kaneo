import { describe, expect, it } from "vite-plus/test";
import { pickOwnPullRequest } from "./pick-own-pull-request";
import { START_MARKER } from "./start-marker";

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
    ).toEqual({
      url: "https://github.com/acme/app/pull/4",
      isDraft: false,
      startedByKaneo: false,
      body: "",
    });
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

  it("tells a draft Start opened from one a person opened", () => {
    const own = {
      url: "https://github.com/acme/app/pull/5",
      isCrossRepository: false,
      headRepositoryOwner: { login: "acme" },
      isDraft: true,
    };
    expect(
      pickOwnPullRequest(
        [{ ...own, body: `Work started from Kaneo.\n\n${START_MARKER}` }],
        "acme/app",
      ),
    ).toMatchObject({
      isDraft: true,
      startedByKaneo: true,
      body: `Work started from Kaneo.\n\n${START_MARKER}`,
    });
    expect(
      pickOwnPullRequest([{ ...own, body: "WIP" }], "acme/app"),
    ).toMatchObject({ isDraft: true, startedByKaneo: false });
    expect(
      pickOwnPullRequest([{ ...own, body: null }], "acme/app"),
    ).toMatchObject({ startedByKaneo: false });
  });
});
