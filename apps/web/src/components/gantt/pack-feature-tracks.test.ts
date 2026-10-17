import { parseISO } from "date-fns";
import { describe, expect, it } from "vite-plus/test";
import { MAX_FEATURE_TRACKS, packFeatureTracks } from "./pack-feature-tracks";

const span = (id: string, start: string, end: string) => ({
  id,
  start: parseISO(start),
  end: parseISO(end),
});

const tracksOf = (result: { placed: { id: string; track: number }[] }) =>
  Object.fromEntries(result.placed.map((item) => [item.id, item.track]));

describe("packFeatureTracks", () => {
  it("returns no tracks for no features", () => {
    expect(packFeatureTracks([])).toEqual({
      placed: [],
      overflow: [],
      trackCount: 0,
    });
  });

  it("shares a track only when one feature ends before the next starts", () => {
    const result = packFeatureTracks([
      span("a", "2026-09-01", "2026-09-04"),
      span("b", "2026-09-05", "2026-09-08"),
      // Starts on b's last day: bars include their end day, so it overlaps.
      span("c", "2026-09-08", "2026-09-10"),
    ]);

    expect(tracksOf(result)).toEqual({ a: 0, b: 0, c: 1 });
    expect(result.trackCount).toBe(2);
    expect(result.overflow).toEqual([]);
  });

  it("packs in start order, whatever order the features come in", () => {
    const result = packFeatureTracks([
      span("late", "2026-09-10", "2026-09-12"),
      span("long", "2026-09-01", "2026-09-20"),
      span("early", "2026-09-02", "2026-09-05"),
      span("next", "2026-09-06", "2026-09-08"),
    ]);

    expect(result.placed.map((item) => item.id)).toEqual([
      "long",
      "early",
      "next",
      "late",
    ]);
    expect(tracksOf(result)).toEqual({ long: 0, early: 1, next: 1, late: 1 });
    expect(result.trackCount).toBe(2);
  });

  it("compares calendar days, not times of day", () => {
    const result = packFeatureTracks([
      span("a", "2026-09-01T09:00:00", "2026-09-03T18:00:00"),
      span("b", "2026-09-03T20:00:00", "2026-09-05T10:00:00"),
      span("c", "2026-09-06T00:00:00", "2026-09-07T00:00:00"),
    ]);

    expect(tracksOf(result)).toEqual({ a: 0, b: 1, c: 0 });
  });

  it(`stops at ${MAX_FEATURE_TRACKS} tracks and overflows the rest in start order`, () => {
    const result = packFeatureTracks([
      span("one", "2026-09-01", "2026-09-10"),
      span("two", "2026-09-01", "2026-09-10"),
      span("three", "2026-09-02", "2026-09-10"),
      span("four", "2026-09-04", "2026-09-06"),
      span("five", "2026-09-03", "2026-09-05"),
      // Fits again once a track is free.
      span("six", "2026-09-11", "2026-09-12"),
    ]);

    expect(result.trackCount).toBe(MAX_FEATURE_TRACKS);
    expect(tracksOf(result)).toEqual({ one: 0, two: 1, three: 2, six: 0 });
    expect(result.overflow.map((item) => item.id)).toEqual(["five", "four"]);
  });

  it("keeps the caller's order for features with the same dates", () => {
    const result = packFeatureTracks(
      [
        span("b", "2026-09-01", "2026-09-02"),
        span("a", "2026-09-01", "2026-09-02"),
      ],
      1,
    );

    expect(result.placed.map((item) => item.id)).toEqual(["b"]);
    expect(result.overflow.map((item) => item.id)).toEqual(["a"]);
  });
});
