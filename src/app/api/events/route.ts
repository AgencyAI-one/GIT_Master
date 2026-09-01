import { requireApiSession } from "@/lib/http";
import { subscribeToBoardChanges } from "@/lib/live-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function eventData(event: string, value: unknown, id?: string) {
  const eventId = id?.replace(/[\r\n]/g, "");
  return encoder.encode(`${eventId ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

export async function GET(request: Request) {
  try {
    requireApiSession(request);
  } catch {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const resources: { heartbeat?: ReturnType<typeof setInterval>; unsubscribe: () => void } = {
        unsubscribe: () => {},
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (resources.heartbeat) clearInterval(resources.heartbeat);
        resources.unsubscribe();
        request.signal.removeEventListener("abort", close);
        try { controller.close(); } catch {}
      };
      const send = (event: string, value: unknown, id?: string) => {
        if (closed) return;
        try { controller.enqueue(eventData(event, value, id)); } catch { close(); }
      };
      resources.unsubscribe = subscribeToBoardChanges(
        (event) => send("board_changed", event, event.deliveryId),
        {
          replayAfterDeliveryId: request.headers.get("last-event-id") || undefined,
          replayRecentMs: 60_000,
        },
      );
      resources.heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch { close(); }
      }, 25_000);
      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });
      send("ready", { connected: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
