"use client";

import { useEffect, useState } from "react";
import { SpotlightState } from "@/types/game";

export function useCountdown(
  spotlight: SpotlightState | null,
  clockOffsetMs = 0
) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!spotlight) {
      setRemainingMs(0);
      return;
    }

    const compute = () => {
      if (spotlight.timerPausedRemainingMs !== null) {
        setRemainingMs(Math.max(0, spotlight.timerPausedRemainingMs));
      } else {
        setRemainingMs(
          Math.max(0, spotlight.timerEndsAt - (Date.now() + clockOffsetMs))
        );
      }
    };

    compute();
    if (spotlight.timerPausedRemainingMs !== null) return;

    const id = setInterval(compute, 150);
    return () => clearInterval(id);
  }, [
    spotlight?.lotId,
    spotlight?.timerEndsAt,
    spotlight?.timerPausedRemainingMs,
    clockOffsetMs,
  ]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const isPaused = spotlight?.timerPausedRemainingMs !== null;

  return { remainingMs, totalSeconds, isPaused };
}
