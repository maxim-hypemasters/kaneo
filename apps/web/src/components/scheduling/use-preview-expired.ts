import { useEffect, useState } from "react";

export function usePreviewExpired(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const expiry = expiresAt ? Date.parse(expiresAt) : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      if (expiry !== null && Number.isFinite(expiry) && expiry > current) {
        timer = setTimeout(
          update,
          Math.min(expiry - current + 1, 2_147_483_647),
        );
      }
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [expiresAt]);
  const expiry = expiresAt ? Date.parse(expiresAt) : null;
  return expiry !== null && (!Number.isFinite(expiry) || expiry <= now);
}
