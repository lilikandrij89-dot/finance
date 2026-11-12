import { NextRequest, NextResponse } from "next/server";
import { getRoomState } from "@/lib/server-store";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId") || "default-room";
  const sinceParam = req.nextUrl.searchParams.get("sinceVersion");
  const state = await getRoomState(roomId);
  if (sinceParam !== null && Number(sinceParam) === state.version) {
    return NextResponse.json({
      unchanged: true,
      version: state.version,
      mode: isSupabaseConfigured() ? "supabase" : "local-sse",
      serverNow: Date.now(),
    });
  }
  return NextResponse.json({
    state,
    mode: isSupabaseConfigured() ? "supabase" : "local-sse",
    serverNow: Date.now(),
  });
}
