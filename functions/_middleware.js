/**
 * This is a Pages Function that acts as a smart router.
 * It handles API requests directly for speed and proxies CMS requests.
 */

// We need a lightweight MongoDB client library.
// Cloudflare Pages automatically includes this when it sees the import.
import { MongoClient, ObjectId } from 'mongodb';

// Helper function to create a JSON response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// Main function that runs on every request
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // --- Route 1: Handle API requests directly from MongoDB ---
  if (url.pathname.startsWith('/api/')) {
    // Check if the MONGO_URI secret is set
    if (!env.MONGO_URI) {
      return jsonResponse({ error: 'Database not configured' }, 500);
    }

    // Connect to the database
    const client = new MongoClient(env.MONGO_URI);
    
    try {
      await client.connect();
      const projectsCollection = client.db('PortoCMS').collection('project_data');

      // API Endpoint: /api/projects/all
      if (url.pathname === '/api/projects/all') {
        const projects = await projectsCollection.find({}).sort("display_order", 1).toArray();
        return jsonResponse(projects);
      }

      // API Endpoint: /api/projects/showcased
      if (url.pathname === '/api/projects/showcased') {
        const projects = await projectsCollection.find({ "is_showcased": true }).sort("display_order", 1).limit(3).toArray();
        return jsonResponse(projects);
      }

      // API Endpoint: /api/projects/:id
      const match = url.pathname.match(/^\/api\/projects\/(.+)/);
      if (match) {
        const projectId = match[1];
        try {
            const project = await projectsCollection.findOne({ _id: new ObjectId(projectId) });
            if (project) {
                return jsonResponse(project);
            } else {
                return jsonResponse({ error: 'Project not found' }, 404);
            }
        } catch (e) {
            return jsonResponse({ error: 'Invalid project ID format' }, 400);
        }
      }
      
      return jsonResponse({ error: 'API route not found' }, 404);

    } catch (e) {
      console.error(e);
      return jsonResponse({ error: 'Database connection error' }, 500);
    } finally {
      await client.close();
    }
  }

  // --- Route 2: Proxy CMS requests to your Render backend ---
  if (url.pathname.startsWith('/cms')) {
    const backendHost = "nana-porto-cms.onrender.com"; // Your Render app URL
    const newUrl = new URL(`https://${backendHost}${url.pathname}${url.search}`);
    const newRequest = new Request(newUrl, request);
    newRequest.headers.set('Host', backendHost);
    return fetch(newRequest);
  }

  // --- Fallback: Serve the static site files ---
  return await context.next();
}