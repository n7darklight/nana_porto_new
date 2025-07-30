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
    const { pathname } = url;

    // --- Define paths for the Flask App ---
    const flaskPrefix = '/puspajak-gen';
    const cleanFlaskPaths = ['/login', '/generate', '/history', '/logout']; // Root '/' is handled separately

    let isFlaskRoute = false;
    let newPath = pathname; // Default to the original path

    // --- Determine if the request is for the Flask app and what the new path should be ---
    if (pathname === '/') {
        // Case 1: The request is for the absolute root of the domain.
        isFlaskRoute = true;
        newPath = `${flaskPrefix}/`; // Rewrite to the blueprint's root.
    } else if (pathname.startsWith(flaskPrefix)) {
        // Case 2: The request already has the prefix (e.g., from a form post).
        isFlaskRoute = true;
        // The path is already correct, so newPath remains unchanged.
    } else {
        // Case 3: Check if it's another clean path (e.g., /login, /generate).
        for (const p of cleanFlaskPaths) {
            if (pathname.startsWith(p)) {
                isFlaskRoute = true;
                newPath = `${flaskPrefix}${pathname}`; // Add the prefix.
                break;
            }
        }
    }
    
    // --- Route 1: If it's a Flask route, proxy it to Vercel ---
    if (isFlaskRoute) {
      const vercelHost = "pupajak-generator.vercel.app";
      const newUrl = new URL(`https://${vercelHost}${newPath}${url.search}`);
      
      const newRequest = new Request(newUrl, request);
      newRequest.headers.set('Host', vercelHost);
      
      return fetch(newRequest);
    }

    // --- Route 2: Proxy API requests to Supabase ---
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

    // --- Route 3: Proxy CMS requests to your Render backend ---
    if (pathname.startsWith('/cms')) {
      const backendHost = "nana-porto-cms.onrender.com"; // Your Render app URL
      const newUrl = new URL(`https://${backendHost}${pathname}${url.search}`);
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
