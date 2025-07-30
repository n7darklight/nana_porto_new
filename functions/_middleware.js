/**
 * This is a Pages Function that acts as a smart router.
 * It handles API requests by calling the Supabase auto-generated API.
 * This method has ZERO external dependencies and will not have build errors.
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
  // --- ADDED FOR DEBUGGING: Wrap everything in a try...catch ---
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    // --- Route 1: Handle API requests via Supabase ---
    if (url.pathname.startsWith('/api/projects')) {
      const projectId = url.searchParams.get('id');
      const showcased = url.searchParams.get('showcased') === 'true';
      
      let data;

      if (projectId) {
        // Fetch a single project by its ID
        const results = await fetchFromSupabase(context, 'project_data', `?select=*&id=eq.${projectId}`);
        data = results.length > 0 ? results[0] : null;
        if (!data) return jsonResponse({ error: 'Project not found' }, 404);

      } else if (showcased) {
        // Fetch top 3 showcased projects
        data = await fetchFromSupabase(context, 'project_data', '?select=*&is_showcased=eq.true&order=display_order.asc&limit=3');
      
      } else {
        // Fetch all projects
        data = await fetchFromSupabase(context, 'project_data', '?select=*&order=display_order.asc');
      }
      
      return jsonResponse(data);
    }

    // --- Route 2: Proxy CMS requests to your Render backend ---
    if (url.pathname.startsWith('/cms')) {
      const backendHost = "nana-porto-cms.onrender.com"; // Your Render app URL
      const newUrl = new URL(`https://${backendHost}${url.pathname}${url.search}`);
      const newRequest = new Request(newUrl, request);
      newRequest.headers.set('Host', backendHost);
      return fetch(newRequest);
    }

    // --- Route 3: Proxy /pupajak-gen to external Vercel app ---
    if (url.pathname.startsWith('/pupajak-gen')) {
      const vercelHost = "pupajak-generator.vercel.app";
      // Remove the "/pupajak-gen" prefix for the proxied request
      const vercelPath = url.pathname.replace(/^\/pupajak-gen/, '') || '/';
      const newUrl = new URL(`https://${vercelHost}${vercelPath}${url.search}`);
      const newRequest = new Request(newUrl, request);
      newRequest.headers.set('Host', vercelHost);
      return fetch(newRequest);
    }

    // --- Fallback: Serve the static site files ---
    return await context.next();

  } catch (e) {
    // If any error occurs, return a JSON response with the error details
    console.error(e);
    return jsonResponse({
        error: "Worker script crashed",
        message: e.message,
        stack: e.stack,
    }, 500);
  }
}
