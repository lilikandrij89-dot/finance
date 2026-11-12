"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyGameAction } from "@/lib/game-engine";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { GameAction, GameState } from "@/types/game";

export type ConnectionMode = "supabase" | "local-sse";

const NON_OPTIMISTIC_ACTIONS = new Set<GameAction["type"]>([
  "SPIN_ROULETTE",
  "RESET_GAME",
]);

export function useGameRoom(roomId = "default-room") {
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<ConnectionMode>(
    isSupabaseConfigured() ? "supabase" : "local-sse"
  );
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  const versionRef = useRef<number>(0);
  const stateRef = useRef<GameState | null>(null);
  const confirmedStateRef = useRef<GameState | null>(null);
  const inFlightCountRef = useRef<number>(0);
  const dispatchQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const realtimeSubscribedRef = useRef<boolean>(false);
  const clockOffsetRef = useRef<number>(0);

  const syncClockOffset = useCallback((serverNow?: number) => {
    if (typeof serverNow === "number" && Number.isFinite(serverNow)) {
      const nextOffset = serverNow - Date.now();
      if (Math.abs(nextOffset - clockOffsetRef.current) > 250) {
        clockOffsetRef.current = nextOffset;
        setClockOffsetMs(nextOffset);
      }
    }
  }, []);

  const applyLatestState = useCallback((next: GameState, force = false) => {
    if (!next) return;
    const isReset = next.version === 1 && versionRef.current > 1;
    if (!force && !isReset && next.version < versionRef.current) {
      return;
    }
    if (
      !force &&
      !isReset &&
      next.version === versionRef.current &&
      next.updatedAt === stateRef.current?.updatedAt
    ) {
      return;
    }
    versionRef.current = next.version;
    stateRef.current = next;
    confirmedStateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollTick = 0;

    versionRef.current = 0;
    stateRef.current = null;
    confirmedStateRef.current = null;
    inFlightCountRef.current = 0;
    realtimeSubscribedRef.current = false;
    setState(null);
    setConnected(false);

    async function loadInitial() {
      try {
        const res = await fetch(
          `/api/game?roomId=${encodeURIComponent(roomId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Не вдалося завантажити стан гри");
        const json = (await res.json()) as {
          state: GameState;
          mode: ConnectionMode;
          serverNow?: number;
        };
        if (!active) return;
        syncClockOffset(json.serverNow);
        setMode(json.mode);
        applyLatestState(json.state, true);
        setConnected(true);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Помилка з'єднання");
        setConnected(false);
      }
    }

    loadInitial();

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      const channel = supabase
        .channel(`fin-storm-${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "game_rooms",
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            const row = payload.new as { state?: GameState } | undefined;
            if (row?.state && active) {
              // While local actions are in flight, only accept strictly newer server state
              if (
                inFlightCountRef.current > 0 &&
                row.state.version <= versionRef.current
              ) {
                return;
              }
              applyLatestState(row.state);
            }
          }
        )
        .subscribe((status) => {
          if (active) {
            const sub = status === "SUBSCRIBED";
            realtimeSubscribedRef.current = sub;
            setConnected(sub);
          }
        });

      // Light fallback poll: every 2.5s when Realtime is offline, every ~10s when Subscribed
      pollTimer = setInterval(async () => {
        pollTick += 1;
        if (realtimeSubscribedRef.current && pollTick % 4 !== 0) {
          return;
        }
        if (inFlightCountRef.current > 0) {
          return;
        }
        try {
          const res = await fetch(
            `/api/game?roomId=${encodeURIComponent(
              roomId
            )}&sinceVersion=${versionRef.current}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const json = (await res.json()) as {
              unchanged?: boolean;
              state?: GameState;
              serverNow?: number;
            };
            if (active && inFlightCountRef.current === 0) {
              syncClockOffset(json.serverNow);
              if (!json.unchanged && json.state) {
                applyLatestState(json.state);
              }
            }
          }
        } catch {
          // ignore transient poll error
        }
      }, 2500);

      return () => {
        active = false;
        realtimeSubscribedRef.current = false;
        if (pollTimer) clearInterval(pollTimer);
        supabase.removeChannel(channel);
      };
    } else {
      eventSource = new EventSource(
        `/api/stream?roomId=${encodeURIComponent(roomId)}`
      );
      eventSource.onopen = () => {
        if (active) setConnected(true);
      };
      eventSource.onmessage = (evt) => {
        if (!active) return;
        try {
          const parsed = JSON.parse(evt.data) as GameState;
          if (
            inFlightCountRef.current > 0 &&
            parsed.version <= versionRef.current &&
            parsed.phase !== "lobby"
          ) {
            return;
          }
          applyLatestState(parsed, parsed.phase === "lobby" || parsed.version === 1);
        } catch {
          // ignore malformed chunk
        }
      };
      eventSource.onerror = () => {
        if (active) setConnected(false);
      };

      return () => {
        active = false;
        eventSource?.close();
      };
    }
  }, [roomId, applyLatestState, syncClockOffset]);

  const dispatch = useCallback(
    async (action: GameAction): Promise<GameState | null> => {
      setError(null);
      const isBlocking = NON_OPTIMISTIC_ACTIONS.has(action.type);
      const current = stateRef.current;

      if (!isBlocking && current) {
        const optimistic = applyGameAction(current, action);
        if (optimistic === current) {
          // Action is a no-op locally; skip slow server round-trip
          return current;
        }
        versionRef.current = optimistic.version;
        stateRef.current = optimistic;
        setState(optimistic);
      }

      if (isBlocking) {
        setBusy(true);
      }
      inFlightCountRef.current += 1;

      const task = dispatchQueueRef.current.then(async () => {
        try {
          const res = await fetch("/api/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId, action }),
          });
          const json = (await res.json()) as {
            state?: GameState;
            serverNow?: number;
            error?: string;
          };
          if (!res.ok || !json.state) {
            throw new Error(json.error || "Помилка виконання дії");
          }
          syncClockOffset(json.serverNow);
          confirmedStateRef.current = json.state;

          // Only apply server state when no newer optimistic action is still queued
          if (inFlightCountRef.current <= 1) {
            applyLatestState(
              json.state,
              action.type === "RESET_GAME" || action.type === "SPIN_ROULETTE"
            );
          }
          return json.state;
        } catch (e) {
          setError(e instanceof Error ? e.message : "Помилка мережі");
          if (inFlightCountRef.current <= 1 && confirmedStateRef.current) {
            applyLatestState(confirmedStateRef.current, true);
          }
          return null;
        } finally {
          inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
          if (isBlocking) {
            setBusy(false);
          }
        }
      });

      dispatchQueueRef.current = task.catch(() => null);
      return task;
    },
    [roomId, applyLatestState, syncClockOffset]
  );

  return { state, mode, connected, busy, error, clockOffsetMs, dispatch };
}
