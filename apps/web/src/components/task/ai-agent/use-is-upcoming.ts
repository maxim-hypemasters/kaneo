import { useEffect, useState } from "react";

/** Whether an ISO time is still ahead; re-renders once it passes. */
export function useIsUpcoming(at: string | null): boolean {
  const time = at === null ? Number.NaN : Date.parse(at);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(time)) return;
    const delay = time - Date.now();
    // A time that passed while the data sat in the cache settles at once.
    if (delay <= 0) {
      setNow(Date.now());
      return;
    }
    // Timers can fire a moment early; the time has passed by then either way.
    const timeout = setTimeout(() => setNow(Math.max(Date.now(), time)), delay);
    return () => clearTimeout(timeout);
  }, [time]);

  return time > now;
}
