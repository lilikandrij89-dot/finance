import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function normalizeSupabaseUrl(url?: string): string {
  if (!url) return "";
  return url.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function isSupabaseConfigured(): boolean {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("your-project-id") &&
      !key.includes("your-supabase-anon-key")
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(
      normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        realtime: {
          params: {
            eventsPerSecond: 20,
          },
        },
      }
    );
  }
  return cachedClient;
}
