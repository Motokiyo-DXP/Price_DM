import { createAuthServerSupabaseClient } from "@/lib/supabase-auth";
import { loadShoppingListData } from "@/lib/shopping-list-data";
import { parseShoppingAccess } from "@/lib/shopping-share-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Server-sent snapshots: no public Realtime topics, JWT owner IDs, or bookmark
// DELETE payloads. Re-authorize every second, including existing connections.
export async function GET(request: Request) {
  const access = parseShoppingAccess(new URL(request.url).searchParams);
  if (!access) return new Response(null, { status: 400 });
  const supabase = await createAuthServerSupabaseClient();
  if (!supabase) return new Response(null, { status: 503 });
  const encoder = new TextEncoder();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { stopped = true; clearTimeout(timer); };
  const stream = new ReadableStream({
    start(controller) {
      let previous = "";
      let pricesLoadedAt = 0;
      const started = Date.now();
      const send = (event: string, data: unknown) => {
        if (!stopped) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => { if (!stopped) { stop(); controller.close(); } };
      request.signal.addEventListener("abort", close, { once: true });
      const tick = async () => {
        try {
          const { data: ids, error } = await supabase.rpc("read_shopping_list", access);
          if (stopped) return;
          if (error || !ids) {
            if (error?.code === "42501" || !error && !ids) send("unavailable", null);
            close(); return;
          }
          const signature = JSON.stringify(ids);
          if (previous !== signature || Date.now() - pricesLoadedAt >= 30_000) {
            const snapshot = await loadShoppingListData(supabase, ids);
            // Recheck before publishing a potentially slow price/image fetch.
            const check = await supabase.rpc("read_shopping_list", access);
            if (check.error) {
              if (check.error.code === "42501") send("unavailable", null);
              close(); return;
            }
            if (JSON.stringify(check.data) !== signature) { previous = ""; }
            else { send("snapshot", snapshot); previous = signature; pricesLoadedAt = Date.now(); }
          } else send("verified", null);
          // Reconnect periodically to refresh auth cookies and fit bounded runtimes.
          if (Date.now() - started >= 50_000) { close(); return; }
          if (!stopped) timer = setTimeout(() => void tick(), 1_000);
        } catch { close(); }
      };
      void tick();
    },
    cancel: stop,
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no", "Referrer-Policy": "no-referrer",
  } });
}
