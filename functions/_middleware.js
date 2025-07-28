/**
 * This is a Pages Function that acts as a router.
 * It runs before any request is handled by your static site.
 */
export async function onRequest(context) {
  // Get the request's URL
  const url = new URL(context.request.url);

  // The public URL of your deployed backend on Render
  const backendHost = "nana-porto-cms.onrender.com";

  // Check if the path is for the CMS or the API
  if (url.pathname.startsWith('/cms') || url.pathname.startsWith('/api')) {
    
    // Create the new URL pointing to your Render backend
    const newUrl = new URL(`https://${backendHost}${url.pathname}${url.search}`);
    
    // Create a new request to proxy to the backend
    const newRequest = new Request(newUrl, context.request);
    
    // Set the Host header to match the backend's hostname to avoid errors
    newRequest.headers.set('Host', backendHost);

    // Fetch from the backend and return its response directly
    return fetch(newRequest);
  }

  // If the path is not for the CMS or API, continue to serve the
  // static file from your Cloudflare Pages project.
  // context.next() automatically handles this.
  return await context.next();
}