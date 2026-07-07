/**
 * This is a Pages Function that acts as a smart router.
 * It proxies requests to the correct backend service based on the URL path.
 */

// PostgreSQL connection configuration
const { Pool } = require('pg');

// Create a connection pool for PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://user:pass@100.110.62.45:5433/postgres',
  ssl: false // Disable SSL for local development
});

// Helper function to execute SQL queries against PostgreSQL
async function queryDatabase(sql, params = []) {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error(`Database query failed: ${error.message}`);
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Helper function to fetch data from PostgreSQL (replaces fetchFromSupabase)
async function fetchFromPostgres(table, conditions = {}, options = {}) {
  const { schema = 'porto_cms', limit, orderBy, select = '*' } = options;

  // Build the SQL query based on parameters
  let query = `SELECT ${select} FROM ${schema}.${table}`;
  const params = [];

  // Add WHERE conditions
  if (Object.keys(conditions).length > 0) {
    const whereClauses = [];
    Object.entries(conditions).forEach(([key, value], index) => {
      whereClauses.push(`${key} = $${index + 1}`);
      params.push(value);
    });
    query += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  // Add ORDER BY
  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }

  // Add LIMIT
  if (limit) {
    query += ` LIMIT $${params.length + 1}`;
    params.push(limit);
  }

  return queryDatabase(query, params);
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
            const results = await fetchFromPostgres('project_data', { id: projectId }, { schema: 'porto_cms' });
            data = results.length > 0 ? results[0] : null;
            if (!data) return jsonResponse({ error: 'Project not found' }, 404);
        } else if (showcased) {
            data = await fetchFromPostgres('project_data', { is_showcased: true }, {
                schema: 'porto_cms',
                orderBy: 'display_order ASC',
                limit: 3
            });
        } else {
            data = await fetchFromPostgres('project_data', {}, {
                schema: 'porto_cms',
                orderBy: 'display_order ASC'
            });
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
      const backendHost = "cms.nanamulyanamaghfur.website";
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