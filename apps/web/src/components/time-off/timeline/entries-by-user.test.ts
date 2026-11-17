import { expect, it } from "vite-plus/test";
import { entriesByUser } from "./entries-by-user";

it("groups entries by member in date order", () => {
  const byUser = entriesByUser([
    { id: "b2", userId: "bo", startDate: "2026-11-20" },
    { id: "a1", userId: "ana", startDate: "2026-11-02" },
    { id: "b1", userId: "bo", startDate: "2026-11-03" },
  ]);
  expect([...byUser.keys()]).toEqual(["bo", "ana"]);
  expect(byUser.get("bo")?.map(({ id }) => id)).toEqual(["b1", "b2"]);
  expect(byUser.get("ana")?.map(({ id }) => id)).toEqual(["a1"]);
});

it("returns an empty map without entries", () => {
  expect(entriesByUser([]).size).toBe(0);
});
