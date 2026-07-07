/**
 * Cloudflare Pages Function
 * Acts as a smart reverse proxy.
 *
 * Routes:
 *  - /api/*            -> Self-hosted CMS API
 *  - /cms/*            -> Self-hosted CMS
 *  - /puspajak-gen/*   -> Vercel Flask app
 *  - other             -> Static portfolio
 */

// Helper function to create JSON responses
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function normalizeArrayField(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== null && item !== undefined).map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsedValue = JSON.parse(trimmed);
      if (Array.isArray(parsedValue)) {
        return parsedValue.filter((item) => item !== null && item !== undefined).map((item) => String(item).trim()).filter(Boolean);
      }
      if (parsedValue !== null && parsedValue !== undefined) {
        return [String(parsedValue).trim()].filter(Boolean);
      }
    } catch (error) {
      // Fall back to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizePayload(item));
  }

  if (payload && typeof payload === "object") {
    const normalized = {};

    for (const [key, value] of Object.entries(payload)) {
      if (key === "technologies") {
        normalized[key] = normalizeArrayField(value);
      } else {
        normalized[key] = normalizePayload(value);
      }
    }

    return normalized;
  }

  return payload;
}

export async function onRequest(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const { pathname } = url;

    //
    // ============================================================
    // Route 1 : Portfolio API -> Self-hosted CMS
    // ============================================================
    //

    if (pathname.startsWith("/api/")) {
      const backendHost = "cms.nanamulyanamaghfur.website";

      const headers = new Headers(request.headers);
      headers.set("Host", backendHost);

      const proxyRequest = new Request(
        `https://${backendHost}${pathname}${url.search}`,
        {
          method: request.method,
          headers,
          body:
            request.method === "GET" || request.method === "HEAD"
              ? undefined
              : request.body,
          redirect: "manual",
        }
      );

      const backendResponse = await fetch(proxyRequest);
      const contentType = backendResponse.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const responseText = await backendResponse.text();

        try {
          const parsedBody = JSON.parse(responseText);
          const normalizedBody = normalizePayload(parsedBody);

          const responseHeaders = new Headers(backendResponse.headers);
          responseHeaders.set("Content-Type", "application/json");
          responseHeaders.set("Access-Control-Allow-Origin", "*");

          return new Response(JSON.stringify(normalizedBody), {
            status: backendResponse.status,
            headers: responseHeaders,
          });
        } catch (error) {
          const responseHeaders = new Headers(backendResponse.headers);
          responseHeaders.set("Content-Type", contentType || "application/json");
          responseHeaders.set("Access-Control-Allow-Origin", "*");

          return new Response(responseText, {
            status: backendResponse.status,
            headers: responseHeaders,
          });
        }
      }

      return backendResponse;
    }

    //
    // ============================================================
    // Route 2 : Puspajak Generator -> Vercel
    // ============================================================
    //

    const flaskPrefix = "/puspajak-gen";

    const cleanFlaskPaths = [
      "/login-puspajak",
      "/generate-puspajak",
      "/history-puspajak",
      "/logout-puspajak",
    ];

    const isPrefixedRequest = pathname.startsWith(flaskPrefix);

    const isCleanRedirect = cleanFlaskPaths.some((p) =>
      pathname.startsWith(p)
    );

    if (isPrefixedRequest || isCleanRedirect) {
      const vercelHost = "pupajak-generator.vercel.app";

      let pathForVercel;

      if (isPrefixedRequest) {
        pathForVercel = pathname.replace(flaskPrefix, "") || "/";
      } else {
        pathForVercel = pathname;
      }

      const headers = new Headers(request.headers);
      headers.set("Host", vercelHost);

      const proxyRequest = new Request(
        `https://${vercelHost}${pathForVercel}${url.search}`,
        {
          method: request.method,
          headers,
          body:
            request.method === "GET" || request.method === "HEAD"
              ? undefined
              : request.body,
          redirect: "manual",
        }
      );

      return fetch(proxyRequest);
    }

    //
    // ============================================================
    // Route 3 : CMS
    // ============================================================
    //

    if (pathname.startsWith("/cms")) {
      const backendHost = "cms.nanamulyanamaghfur.website";

      // Remove /cms before forwarding
      const backendPath =
        pathname.replace(/^\/cms/, "") || "/";

      const headers = new Headers(request.headers);

      headers.set("Host", backendHost);

      headers.set("X-Forwarded-Prefix", "/cms");

      const proxyRequest = new Request(
        `https://${backendHost}${backendPath}${url.search}`,
        {
          method: request.method,
          headers,
          body:
            request.method === "GET" || request.method === "HEAD"
              ? undefined
              : request.body,
          redirect: "manual",
        }
      );

      return fetch(proxyRequest);
    }

    //
    // ============================================================
    // Static Portfolio
    // ============================================================
    //

    return context.next();
  } catch (e) {
    console.error("Middleware Crash:", e);

    return jsonResponse(
      {
        error: "Worker crashed",
        message: e.message,
        stack: e.stack,
      },
      500
    );
  }
}