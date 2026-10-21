import { describe, expect, it } from "vite-plus/test";
import { featureCreationOrigin } from "./feature-creation-origin";

describe("Feature creation origin", () => {
  const pathname = "/dashboard/workspace/w/project/p/task/feature";
  it("uses explicit scoped release context without placing release on the Feature", () => {
    expect(
      featureCreationOrigin({ pathname, originReleaseId: "r1", context: null }),
    ).toEqual({ projectId: "p", releaseId: "r1" });
  });
  it("prefers explicit scope, then the current release page, over stale inherited context", () => {
    const input = {
      pathname: "/dashboard/workspace/w/project/p/releases/current",
      search: { originReleaseId: "search" },
      context: { projectId: "p", releaseId: "stale" },
    };
    expect(featureCreationOrigin(input)).toEqual({
      projectId: "p",
      releaseId: "current",
    });
    expect(
      featureCreationOrigin({ ...input, originReleaseId: "explicit" }),
    ).toEqual({ projectId: "p", releaseId: "explicit" });
    expect(
      featureCreationOrigin({ ...input, originReleaseId: "invalid/release" }),
    ).toBeNull();
  });
  it("finds release pages and validated full-page Feature search context", () => {
    expect(
      featureCreationOrigin({
        pathname: "/dashboard/workspace/w/project/p/releases/r2",
        context: null,
      }),
    ).toEqual({ projectId: "p", releaseId: "r2" });
    expect(
      featureCreationOrigin({
        pathname,
        search: { originReleaseId: "r3" },
        context: null,
      }),
    ).toEqual({ projectId: "p", releaseId: "r3" });
  });
  it("retains same-project task-view context but discards foreign context", () => {
    expect(
      featureCreationOrigin({
        pathname,
        context: { projectId: "p", releaseId: "r4" },
      }),
    ).toEqual({ projectId: "p", releaseId: "r4" });
    expect(
      featureCreationOrigin({
        pathname,
        context: { projectId: "foreign", releaseId: "r4" },
      }),
    ).toBeNull();
    expect(
      featureCreationOrigin({
        pathname,
        search: { originReleaseId: "search" },
        context: { projectId: "p", releaseId: "inherited" },
      }),
    ).toEqual({ projectId: "p", releaseId: "inherited" });
    expect(
      featureCreationOrigin({
        pathname,
        search: { originReleaseId: "search" },
        context: { projectId: "foreign", releaseId: "inherited" },
      }),
    ).toEqual({ projectId: "p", releaseId: "search" });
  });
  it("rejects malformed context and independent workspace entry points", () => {
    for (const originReleaseId of ["", "foreign?secret", "release/other"])
      expect(
        featureCreationOrigin({ pathname, originReleaseId, context: null }),
      ).toBeNull();
    expect(
      featureCreationOrigin({
        pathname: "/dashboard/workspace/w",
        context: null,
      }),
    ).toBeNull();
    expect(featureCreationOrigin({ pathname, context: null })).toBeNull();
  });
});
