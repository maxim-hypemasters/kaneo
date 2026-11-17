import { expect, it } from "vite-plus/test";
import { timelineMembers } from "./timeline-members";

it("puts the viewer first, sorts the rest by name and drops repeats", () => {
  const rows = timelineMembers(
    [
      { userId: "zed", user: { name: "Zed", image: null } },
      { userId: "me", user: { name: "Mia", image: "mia.png" } },
      { userId: "ana", user: { name: "ana" } },
      { userId: "zed", user: { name: "Zed again" } },
      { userId: "bo", user: null },
    ],
    "me",
  );
  expect(rows.map(({ userId }) => userId)).toEqual(["me", "bo", "ana", "zed"]);
  expect(rows[0]).toEqual({ userId: "me", name: "Mia", image: "mia.png" });
  expect(rows.find(({ userId }) => userId === "zed")?.name).toBe("Zed");
});
