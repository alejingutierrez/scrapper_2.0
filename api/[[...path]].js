// ``SCRAPER_API_URL`` must be provided when running on Vercel. Locally we fall
// back to the development server on ``localhost``.
const BACKEND_URL =
  process.env.SCRAPER_API_URL ||
  (process.env.VERCEL ? undefined : 'http://localhost:8000');

export default async function handler(req, res) {
  const { path = [] } = req.query;

  if (!BACKEND_URL) {
    res
      .status(200)
      .json({ status: 'error', message: 'SCRAPER_API_URL not configured' });
    return;
  }

  const target = `${BACKEND_URL}/${Array.isArray(path) ? path.join('/') : path}`;

  const init = {
    method: req.method,
    headers: { ...req.headers, host: undefined },
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
