import fetch from 'node-fetch';

// ``SCRAPER_API_URL`` must be provided when running on Vercel. Locally we fall
// back to the development server on ``localhost``.
const BACKEND_URL =
  process.env.SCRAPER_API_URL ||
  (process.env.VERCEL ? undefined : 'http://localhost:8000');

export default async function handler(req, res) {
  if (!BACKEND_URL) {
    res.status(200).json({
      status: 'error',
      message:
        'SCRAPER_API_URL not configured. Please set this environment variable in your Vercel project settings.',
    });
    return;
  }

  // Reconstruct target URL by stripping the ``/api`` prefix from the incoming
  // path and preserving query parameters.
  const reqUrl = new URL(req.url, 'http://localhost');
  const target = new URL(reqUrl.pathname.replace(/^\/api/, '') + reqUrl.search, BACKEND_URL);

  const headers = { ...req.headers };
  // Drop hop-by-hop headers which can cause ``fetch`` to reject the request or
  // forward incorrect values to the backend service.  ``fetch`` will populate
  // the right ``Host`` header based on the target URL.
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  delete headers['accept-encoding'];

  const headers = { ...req.headers };
  // Drop hop-by-hop headers which can cause ``fetch`` to reject the request or
  // forward incorrect values to the backend service.  ``fetch`` will populate
  // the right ``Host`` header based on the target URL.
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];

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
