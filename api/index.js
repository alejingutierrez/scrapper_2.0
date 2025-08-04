import fetch from 'node-fetch';

// Determine backend URL. When running on Vercel the URL must be provided via
// ``SCRAPER_API_URL``. For local development we fall back to the typical
// ``localhost`` address so developers can run the backend separately without
// extra configuration.
const BACKEND_URL =
  process.env.SCRAPER_API_URL ||
  (process.env.VERCEL ? undefined : 'http://localhost:8000');

export default async function handler(req, res) {
  // If no backend URL is available (for instance on Vercel without the
  // environment variable configured) return a friendly health‑check response
  // instead of a 500 error.
  if (!BACKEND_URL) {
    res.status(200).json({
      status: 'ok',
      message:
        'SCRAPER_API_URL not configured. Please set this environment variable in your Vercel project settings.',
    });
    return;
  }

  // Build the target URL by removing the ``/api`` prefix from the incoming
  // request and forwarding any query string to the backend service.
  const reqUrl = new URL(req.url, 'http://localhost');
  const target = new URL(reqUrl.pathname.replace(/^\/api/, '') + reqUrl.search, BACKEND_URL);

  const headers = { ...req.headers };
  // ``host`` (and a few hop-by-hop headers) should not be forwarded when
  // proxying requests. Setting them to ``undefined`` can result in invalid
  // values being sent which in turn breaks the connection. Instead explicitly
  // remove them so ``fetch`` generates the appropriate headers for the target
  // backend.
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  delete headers['accept-encoding'];

  const init = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    init.headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(target, init);
    const contentType = response.headers.get('content-type') || '';
    res.status(response.status);
    if (contentType.includes('application/json')) {
      const data = await response.json();
      res.json(data);
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error) {
    // When the backend is unreachable we still return HTTP 200 so the frontend
    // can surface a clear message instead of failing the request entirely.
    res
      .status(200)
      .json({ status: 'error', message: 'Unable to reach backend', detail: error.message });
  }
}
