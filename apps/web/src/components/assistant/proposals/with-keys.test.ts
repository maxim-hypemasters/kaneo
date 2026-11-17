import { expect, it } from "vite-plus/test";
import { withKeys } from "./with-keys";

it("keys repeated texts apart and keeps the order", () => {
  const keyed = withKeys(["Login", "Signup", "Login"], (item) => item);
  expect(keyed.map((entry) => entry.item)).toEqual([
    "Login",
    "Signup",
    "Login",
  ]);
  expect(new Set(keyed.map((entry) => entry.key)).size).toBe(3);
  expect(
    withKeys([{ title: "A" }, { title: "A" }], (item) => item.title).map(
      (entry) => entry.key,
    ),
  ).toEqual(["0:A", "1:A"]);
});
