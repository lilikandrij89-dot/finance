import { NextRequest } from "next/server";
import { getRoomState, subscribeLocalRoom } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId") || "default-room";
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // stream closed
        }
      };

      const initial = await getRoomState(roomId);
      send(initial);

      cleanup = subscribeLocalRoom(roomId, (nextState) => {
        send(nextState);
      });

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // ignore
        }
      }, 15000);
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
