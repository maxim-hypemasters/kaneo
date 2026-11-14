// Runs at most one save at a time. Edits made while a save is in flight
// produce exactly one follow-up save, so the text the person sees is the text
// that ends up saved.
export function createAutosaveQueue({
  delay,
  save,
  pending,
  onBusy,
}: {
  delay: number;
  // Resolves false when the save failed or could not be sent.
  save: () => Promise<boolean>;
  // Whether local changes are still unsaved.
  pending: () => boolean;
  onBusy?: (busy: boolean) => void;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<boolean> | null = null;
  let followUp = false;

  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function start(): Promise<boolean> {
    cancel();
    if (running) {
      followUp = true;
      return running;
    }
    onBusy?.(true);
    running = (async () => {
      let ok = await save().catch(() => false);
      while (followUp) {
        followUp = false;
        if (pending()) ok = await save().catch(() => false);
      }
      return ok;
    })().finally(() => {
      running = null;
      onBusy?.(false);
    });
    return running;
  }

  return {
    schedule() {
      cancel();
      timer = setTimeout(() => void start(), delay);
    },
    // Saves now and waits for every save in flight. It tries once more at
    // most, so a failing request never loops.
    async flush() {
      cancel();
      if (running) await running;
      if (!pending()) return true;
      return (await start()) && !pending();
    },
    cancel,
  };
}
