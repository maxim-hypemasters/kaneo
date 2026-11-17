import { expect, it } from "vite-plus/test";
import { holidaysByUser } from "./holidays-by-user";

it("groups holidays by member in date order, names kept", () => {
  const byUser = holidaysByUser([
    { userId: "bo", date: "2026-12-26" },
    { userId: "me", date: "2026-12-25", name: "Christmas Day" },
    { userId: "bo", date: "2026-12-25" },
  ]);
  expect([...byUser.keys()]).toEqual(["bo", "me"]);
  expect(byUser.get("bo")?.map(({ date }) => date)).toEqual([
    "2026-12-25",
    "2026-12-26",
  ]);
  expect(byUser.get("me")).toEqual([
    { userId: "me", date: "2026-12-25", name: "Christmas Day" },
  ]);
});

it("returns an empty map without holidays", () => {
  expect(holidaysByUser([]).size).toBe(0);
});
