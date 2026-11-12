"use client";

import { useEffect, useState } from "react";

export function useRoomId(): string {
  const [roomId, setRoomId] = useState("default-room");

  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("roomId");
      if (raw) {
        const sanitized = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
        if (sanitized) {
          setRoomId(sanitized);
        }
      }
    } catch {
      // Ignore invalid URLSearchParams
    }
  }, []);

  return roomId;
}
