const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function objectKey(request) {
  const pathname = new URL(request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  if (
    parts.length < 2 ||
    !["official", "sample"].includes(parts[0]) ||
    parts.some((part) => part === "." || part === "..") ||
    !parts.at(-1).toLowerCase().endsWith(".webp")
  ) {
    return null;
  }
  try {
    return parts.map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

function responseHeaders(object) {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": IMMUTABLE_CACHE,
    "Content-Type": object?.httpMetadata?.contentType || "image/webp",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (object?.httpEtag) headers.set("ETag", object.httpEtag);
  return headers;
}

export default {
  async fetch(request, env, context) {
    const key = objectKey(request);
    if (!key) return new Response("Not found", { status: 404 });

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const object = await env.CARD_IMAGES.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    const response = new Response(request.method === "HEAD" ? null : object.body, {
      status: 200,
      headers: responseHeaders(object),
    });
    if (request.method === "GET") context.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};
