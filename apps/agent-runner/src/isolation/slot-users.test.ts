import { describe, expect, it } from "vite-plus/test";
import { slotUser } from "./slot-users";

describe("slotUser", () => {
  it("gives each slot a user and group of its own above HERMES_UID", () => {
    const base = { uid: 10000, gid: 10000 };
    expect(slotUser(base, 0)).toEqual({ uid: 10001, gid: 10001 });
    expect(slotUser(base, 2)).toEqual({ uid: 10003, gid: 10003 });
  });
});
