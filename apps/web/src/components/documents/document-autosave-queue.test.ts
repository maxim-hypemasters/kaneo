import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { createAutosaveQueue } from "./document-autosave-queue";

// The local text has a version; a save stores whatever version is current
// when it starts, once its request is answered.
function setup({ fail = false } = {}) {
  const state = { version: 0, saved: 0 };
  const requests: Array<() => void> = [];
  const save = vi.fn(() => {
    const sending = state.version;
    return new Promise<boolean>((resolve) => {
      requests.push(() => {
        if (fail) return resolve(false);
        state.saved = sending;
        resolve(true);
      });
    });
  });
  const onBusy = vi.fn();
  const queue = createAutosaveQueue({
    delay: 1000,
    save,
    pending: () => state.version !== state.saved,
    onBusy,
  });
  const edit = () => {
    state.version += 1;
    queue.schedule();
  };
  const answer = async () => {
    await vi.advanceTimersByTimeAsync(0);
    requests.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { state, save, onBusy, queue, edit, answer, requests };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createAutosaveQueue", () => {
  it("saves once, a second after the last edit of a burst", async () => {
    const { save, edit, onBusy } = setup();
    edit();
    await vi.advanceTimersByTimeAsync(600);
    edit();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(onBusy).toHaveBeenLastCalledWith(true);
  });

  it("never overlaps saves and follows edits made during one with exactly one more", async () => {
    const { state, save, edit, answer, onBusy } = setup();
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledOnce();
    await answer();
    expect(save).toHaveBeenCalledTimes(2);
    await answer();
    expect(save).toHaveBeenCalledTimes(2);
    expect(state.saved).toBe(3);
    expect(onBusy.mock.calls).toEqual([[true], [false]]);
  });

  it("flushes at once and waits for the save in flight and the one after it", async () => {
    const { state, save, edit, answer, queue } = setup();
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    edit();
    let result: boolean | undefined;
    void queue.flush().then((value) => (result = value));
    await answer();
    expect(save).toHaveBeenCalledTimes(2);
    expect(result).toBeUndefined();
    await answer();
    expect(result).toBe(true);
    expect(state.saved).toBe(2);
    // The debounce timer was cleared by the flush.
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("resolves a failed flush as false after one more attempt", async () => {
    const { save, edit, answer, queue } = setup({ fail: true });
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    let result: boolean | undefined;
    void queue.flush().then((value) => (result = value));
    await answer();
    await answer();
    expect(result).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected save as a failure", async () => {
    const queue = createAutosaveQueue({
      delay: 1000,
      save: () => Promise.reject(new Error("offline")),
      pending: () => true,
    });
    await expect(queue.flush()).resolves.toBe(false);
  });

  it("cancels only the waiting timer, not the save in flight", async () => {
    const { state, save, edit, answer, queue } = setup();
    edit();
    await vi.advanceTimersByTimeAsync(1000);
    edit();
    queue.cancel();
    await answer();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledOnce();
    expect(state.saved).toBe(1);
  });

  it("sends nothing when there is nothing to save", async () => {
    const { save, queue } = setup();
    await expect(queue.flush()).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});
