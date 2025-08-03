/**
 * This is a Pages Function that acts as a smart router.
 * It proxies requests to the correct backend service based on the URL path.
 */

// Helper function to make authenticated requests to the Supabase API
async function fetchFromSupabase(context, path, params = '') {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = context.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables not set.');
  }

  // Construct the full URL for the Supabase REST API
  const supabaseUrl = `${SUPABASE_URL}/rest/v1/${path}${params}`;

  // Make the fetch request with the required headers for Supabase
  const response = await fetch(supabaseUrl, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Supabase API Error: ${errorText}`);
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json();
}


// Helper function to create a JSON response for the browser
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// Main function that runs on every request
export async function onRequest(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const { pathname } = url;

    // --- Route 1: Handle API requests for the portfolio ---
    if (pathname.startsWith('/api/projects')) {
        const projectId = url.searchParams.get('id');
        const showcased = url.searchParams.get('showcased') === 'true';
        
        let data;

        if (projectId) {
            const results = await fetchFromSupabase(context, 'project_data', `?select=*&id=eq.${projectId}`);
            data = results.length > 0 ? results[0] : null;
            if (!data) return jsonResponse({ error: 'Project not found' }, 404);
        } else if (showcased) {
            data = await fetchFromSupabase(context, 'project_data', '?select=*&is_showcased=eq.true&order=display_order.asc&limit=3');
        } else {
            data = await fetchFromSupabase(context, 'project_data', '?select=*&order=display_order.asc');
        }
        
        return jsonResponse(data);
    }

    // --- Route 2: Proxy /puspajak-gen/* and related routes to the Vercel Flask App ---
     const flaskPrefix = '/puspajak-gen';
    const cleanFlaskPaths = ['/login-puspajak', '/generate-puspajak', '/history-puspajak', '/logout-puspajak']; // Paths Flask might redirect to

    const isPrefixedRequest = pathname.startsWith(flaskPrefix);
    const isCleanRedirect = cleanFlaskPaths.some(p => pathname.startsWith(p));

    if (isPrefixedRequest || isCleanRedirect) {
        const vercelHost = "pupajak-generator.vercel.app";
        let pathForVercel;

        if (isPrefixedRequest) {
            // It's a direct request like /puspajak-gen/login. Strip the prefix.
            pathForVercel = pathname.replace(flaskPrefix, '') || '/';
        } else {
            // It's a redirect to a clean path like /login. Use it as is.
            pathForVercel = pathname;
        }

        const newUrl = new URL(`https://${vercelHost}${pathForVercel}${url.search}`);
        const newRequest = new Request(newUrl, request);
        newRequest.headers.set('Host', vercelHost);
        
        return fetch(newRequest);
    }

    // --- Route 3: Proxy CMS requests to your Render backend ---
    if (pathname.startsWith('/cms')) {
      const backendHost = "nana-porto-cms.onrender.com";
      const newUrl = new URL(`https://${backendHost}${pathname}${url.search}`);
      const newRequest = new Request(newUrl, request);
      newRequest.headers.set('Host', backendHost);
      return fetch(newRequest);
    }

    // --- Fallback: If no routes matched, serve the static portfolio files ---
    return await context.next();

  } catch (e) {
    // If any error occurs, return a JSON response with the error details
    console.error("Middleware Crash:", e);
    return jsonResponse({
        error: "Worker script crashed",
        message: e.message,
        stack: e.stack,
    }, 500);
  }
}


"https://icebergchart-explainer.vercel.app/"