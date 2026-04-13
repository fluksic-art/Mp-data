"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const INTERVAL_S = 30;

export function AutoRefresh() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(INTERVAL_S);
  const counterRef = useRef(INTERVAL_S);

  useEffect(() => {
    const tick = setInterval(() => {
      counterRef.current -= 1;
      if (counterRef.current <= 0) {
        counterRef.current = INTERVAL_S;
        router.refresh();
      }
      setSecondsLeft(counterRef.current);
    }, 1000);

    return () => clearInterval(tick);
  }, [router]);

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      Auto-refresh in {secondsLeft}s
    </span>
  );
}
