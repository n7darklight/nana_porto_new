/**
 * This is a Pages Function that acts as a smart router.
 * It rewrites clean URLs to the appropriate backend service (Vercel, Render)
 * or serves static files, all without browser redirects.
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

    // --- Define the "clean" root paths that belong to your Flask app ---
    const cleanFlaskPaths = [
      '/', // The root path needs to be handled
      '/login',
      '/generate',
      '/history',
      '/logout'
    ];
    
    // --- Check if the request is for the Flask app ---
    // This is true if it's a clean path OR if it already has the blueprint prefix.
    const isCleanPath = cleanFlaskPaths.some(p => url.pathname === p || (p !== '/' && url.pathname.startsWith(p + '/')));
    const hasPrefix = url.pathname.startsWith('/puspajak-gen');
    
    // --- Route 1: Rewrite or Proxy requests to the Vercel-hosted Flask App ---
    if (isCleanPath || hasPrefix) {
      const vercelHost = "pupajak-generator.vercel.app";
      let newPath;

      if (hasPrefix) {
        // The path already has the prefix (e.g., from a form post), so we use it as-is.
        newPath = url.pathname;
      } else {
        // It's a clean path (e.g., from a user typing in the URL), so we add the prefix.
        newPath = `/puspajak-gen${url.pathname === '/' ? '/' : url.pathname}`;
      }
      
      const newUrl = new URL(`https://${vercelHost}${newPath}${url.search}`);
      
      // Create a new request object to proxy to the Vercel backend
      const newRequest = new Request(newUrl, request);
      newRequest.headers.set('Host', vercelHost);
      
      // Return the response from Vercel directly. The user's URL does not change.
      return fetch(newRequest);
    }

    // --- Route 2: Proxy API requests to Supabase ---
    if (url.pathname.startsWith('/api/projects')) {
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

    // --- Route 3: Proxy CMS requests to your Render backend ---
    if (url.pathname.startsWith('/cms')) {
      const backendHost = "nana-porto-cms.onrender.com"; // Your Render app URL
      const newUrl = new URL(`https://${backendHost}${url.pathname}${url.search}`);
      const newRequest = new Request(newUrl, request);
      newRequest.headers.set('Host', backendHost);
      return fetch(newRequest);
    }

    // --- Fallback: If no routes matched, serve the static site files ---
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
