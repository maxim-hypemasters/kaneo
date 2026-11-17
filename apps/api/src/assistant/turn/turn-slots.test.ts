import { describe, expect, it } from "vite-plus/test";
import { MAX_TURNS_PER_USER } from "../constants";
import {
  createTurnSlots,
  tryAcquireTurnSlot,
  turnSlotsInUse,
} from "./turn-slots";

describe("createTurnSlots", () => {
  it("caps turns per user", () => {
    const slots = createTurnSlots({ perUser: 2, perInstance: 8 });
    const first = slots.tryAcquire("ada");
    const second = slots.tryAcquire("ada");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(slots.tryAcquire("ada")).toBeNull();
    expect(slots.tryAcquire("mo")).not.toBeNull();
  });

  it("caps turns per instance across users", () => {
    const slots = createTurnSlots({ perUser: 2, perInstance: 3 });
    slots.tryAcquire("ada");
    slots.tryAcquire("ada");
    slots.tryAcquire("mo");

    expect(slots.tryAcquire("mo")).toBeNull();
    expect(slots.tryAcquire("lin")).toBeNull();
    expect(slots.inUse()).toBe(3);
  });

  it("frees a slot on release", () => {
    const slots = createTurnSlots({ perUser: 1, perInstance: 8 });
    const slot = slots.tryAcquire("ada");
    expect(slots.tryAcquire("ada")).toBeNull();

    slot?.release();

    expect(slots.inUse()).toBe(0);
    expect(slots.tryAcquire("ada")).not.toBeNull();
  });

  it("releases each slot only once", () => {
    const slots = createTurnSlots({ perUser: 2, perInstance: 8 });
    const first = slots.tryAcquire("ada");
    const second = slots.tryAcquire("ada");

    first?.release();
    first?.release();

    expect(slots.inUse()).toBe(1);
    expect(slots.tryAcquire("ada")).not.toBeNull();
    expect(slots.tryAcquire("ada")).toBeNull();
    second?.release();
    expect(slots.inUse()).toBe(1);
  });
});

describe("tryAcquireTurnSlot", () => {
  it("applies the instance caps from the constants", () => {
    const user = `user-${Math.random()}`;
    const taken = Array.from({ length: MAX_TURNS_PER_USER }, () =>
      tryAcquireTurnSlot(user),
    );

    expect(taken.every((slot) => slot !== null)).toBe(true);
    expect(tryAcquireTurnSlot(user)).toBeNull();
    for (const slot of taken) slot?.release();
    expect(turnSlotsInUse()).toBe(0);
  });
});
