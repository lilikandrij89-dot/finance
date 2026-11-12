import { NextRequest, NextResponse } from "next/server";
import { dispatchRoomAction } from "@/lib/server-store";
import { GameAction } from "@/types/game";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { roomId?: string; action: GameAction };
    const roomId = body.roomId || "default-room";
    if (!body.action || typeof body.action.type !== "string") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const state = await dispatchRoomAction(roomId, body.action);
    return NextResponse.json({ state, serverNow: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
