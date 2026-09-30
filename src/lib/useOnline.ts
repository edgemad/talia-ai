import { useEffect, useState } from "react";
import { verifyOnline } from "./themes";

/**
 * True "can I reach the internet" state.
 * navigator.onLine lies (hotspot without uplink), so we verify with a tiny
 * CDN fetch every 20s and on browser connectivity events.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    let alive = true;

    const check = async () => {
      const ok = await verifyOnline();
      if (alive) setOnline(ok);
    };

    const onUp = () => check();
    const onDown = () => setOnline(false);

    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    check();
    const t = setInterval(check, 20_000);

    return () => {
      alive = false;
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      clearInterval(t);
    };
  }, []);

  return online;
}
