import { MAX_TURNS_PER_INSTANCE, MAX_TURNS_PER_USER } from "../constants";

export type TurnSlot = { release(): void };

/**
 * In-memory caps on turns streaming at once, per user and per process. A
 * slot's release is idempotent, so a stream's `finally` can always call it.
 */
export function createTurnSlots(limits: {
  perUser: number;
  perInstance: number;
}) {
  const byUser = new Map<string, number>();
  let total = 0;

  return {
    tryAcquire(userId: string): TurnSlot | null {
      const mine = byUser.get(userId) ?? 0;
      if (total >= limits.perInstance || mine >= limits.perUser) return null;
      byUser.set(userId, mine + 1);
      total += 1;

      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          total -= 1;
          const left = (byUser.get(userId) ?? 1) - 1;
          if (left > 0) byUser.set(userId, left);
          else byUser.delete(userId);
        },
      };
    },
    inUse: () => total,
  };
}

const instanceSlots = createTurnSlots({
  perUser: MAX_TURNS_PER_USER,
  perInstance: MAX_TURNS_PER_INSTANCE,
});

/**
 * Takes one of this process's turn slots, or returns null when the user or
 * the instance is at its cap. Take it in the handler right before
 * streamSSE, after every check that can answer 4xx, and release it exactly
 * once in the stream callback's `finally`.
 */
export function tryAcquireTurnSlot(userId: string): TurnSlot | null {
  return instanceSlots.tryAcquire(userId);
}

/** Turns holding a slot in this process; for tests and diagnostics. */
export function turnSlotsInUse(): number {
  return instanceSlots.inUse();
}
