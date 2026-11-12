import fs from "node:fs";
import path from "node:path";
import { applyGameAction, createInitialGameState } from "@/lib/game-engine";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { GameAction, GameState } from "@/types/game";

type Listener = (state: GameState) => void;

interface GlobalStore {
  rooms: Map<string, GameState>;
  listeners: Map<string, Set<Listener>>;
  locks: Map<string, Promise<unknown>>;
}

const g = globalThis as unknown as { __finStormStore?: GlobalStore };
if (!g.__finStormStore) {
  g.__finStormStore = {
    rooms: new Map(),
    listeners: new Map(),
    locks: new Map(),
  };
}

const store = g.__finStormStore;
const PERSIST_PATH = path.join(process.cwd(), ".next", "fin-storm-rooms.json");

function loadFromDisk(): void {
  if (store.rooms.size > 0) return;
  try {
    if (fs.existsSync(PERSIST_PATH)) {
      const raw = fs.readFileSync(PERSIST_PATH, "utf8");
      const parsed = JSON.parse(raw) as Record<string, GameState>;
      for (const [id, st] of Object.entries(parsed)) {
        store.rooms.set(id, st);
      }
    }
  } catch {
    // Ignore read errors on serverless/read-only filesystems
  }
}

function saveToDisk(): void {
  try {
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
    const obj: Record<string, GameState> = {};
    for (const [id, st] of store.rooms.entries()) {
      obj[id] = st;
    }
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(obj), "utf8");
  } catch {
    // Ignore write errors on read-only filesystems
  }
}

export function subscribeLocalRoom(
  roomId: string,
  listener: Listener
): () => void {
  let set = store.listeners.get(roomId);
  if (!set) {
    set = new Set();
    store.listeners.set(roomId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

function notifyLocalListeners(roomId: string, state: GameState): void {
  const set = store.listeners.get(roomId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(state);
    } catch {
      // ignore broken stream
    }
  }
}

async function runSerialized<T>(
  roomId: string,
  task: () => Promise<T>
): Promise<T> {
  const prev = store.locks.get(roomId) ?? Promise.resolve();
  const next = prev.then(task, task);
  store.locks.set(roomId, next);
  try {
    return await next;
  } finally {
    if (store.locks.get(roomId) === next) {
      store.locks.delete(roomId);
    }
  }
}

async function fetchSupabaseRoom(roomId: string): Promise<GameState> {
  const supabase = getSupabaseClient()!;
  const { data, error } = await supabase
    .from("game_rooms")
    .select("state")
    .eq("id", roomId)
    .maybeSingle();

  if (!error && data?.state) {
    const loaded = data.state as GameState;
    store.rooms.set(roomId, loaded);
    return loaded;
  }

  const fresh = createInitialGameState(roomId);
  await supabase.from("game_rooms").upsert({
    id: roomId,
    state: fresh,
    version: fresh.version,
    updated_at: new Date().toISOString(),
  });
  store.rooms.set(roomId, fresh);
  return fresh;
}

export async function getRoomState(roomId = "default-room"): Promise<GameState> {
  const supabase = getSupabaseClient();
  if (supabase && isSupabaseConfigured()) {
    return fetchSupabaseRoom(roomId);
  }

  loadFromDisk();
  let state = store.rooms.get(roomId);
  if (!state) {
    state = createInitialGameState(roomId);
    store.rooms.set(roomId, state);
    saveToDisk();
  }
  return state;
}

export async function dispatchRoomAction(
  roomId: string,
  action: GameAction
): Promise<GameState> {
  return runSerialized(roomId, async () => {
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      for (let attempt = 0; attempt < 3; attempt++) {
        // Use warm in-memory cache on attempt 0 to avoid an extra remote SELECT
        const cached = attempt === 0 ? store.rooms.get(roomId) : undefined;
        const current = cached ?? (await fetchSupabaseRoom(roomId));
        const next = applyGameAction(current, action);

        if (next === current) {
          // If action was a no-op against cached state, verify against DB once
          if (cached) {
            const freshCurrent = await fetchSupabaseRoom(roomId);
            if (freshCurrent.version !== cached.version) {
              const retryNext = applyGameAction(freshCurrent, action);
              if (retryNext === freshCurrent) return freshCurrent;
              const { data: retryData, error: retryError } = await supabase
                .from("game_rooms")
                .update({
                  state: retryNext,
                  version: retryNext.version,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", roomId)
                .eq("version", freshCurrent.version)
                .select("version")
                .maybeSingle();
              if (!retryError && retryData) {
                store.rooms.set(roomId, retryNext);
                return retryNext;
              }
              continue;
            }
          }
          return current;
        }

        const { data, error } = await supabase
          .from("game_rooms")
          .update({
            state: next,
            version: next.version,
            updated_at: new Date().toISOString(),
          })
          .eq("id", roomId)
          .eq("version", current.version)
          .select("version")
          .maybeSingle();

        if (!error && data) {
          store.rooms.set(roomId, next);
          return next;
        }
        // Cache was stale or concurrent update collided -> clear cache and retry
        store.rooms.delete(roomId);
      }

      // Fallback unconditional upsert if concurrent updates conflicted
      const current = await fetchSupabaseRoom(roomId);
      const next = applyGameAction(current, action);
      const { error: upsertError } = await supabase.from("game_rooms").upsert({
        id: roomId,
        state: next,
        version: next.version,
        updated_at: new Date().toISOString(),
      });
      if (upsertError) {
        if (upsertError.code === "PGRST205") {
          throw new Error(
            "Таблиця game_rooms не знайдена в Supabase. Виконайте supabase/schema.sql у SQL Editor."
          );
        }
        throw new Error(upsertError.message);
      }
      store.rooms.set(roomId, next);
      return next;
    }

    const current = await getRoomState(roomId);
    const next = applyGameAction(current, action);
    if (next !== current) {
      store.rooms.set(roomId, next);
      saveToDisk();
      notifyLocalListeners(roomId, next);
    }
    return next;
  });
}
