import axios from 'axios';
import http from 'http';
import https from 'https';

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

  const target = `${BACKEND_URL}/`;

  const agent = BACKEND_URL.startsWith('https')
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });

  const headers = { ...req.headers };
  // ``host`` (and a few hop-by-hop headers) should not be forwarded when
  // proxying requests.  Setting them to ``undefined`` can result in invalid
  // values being sent which in turn breaks the connection.  Instead explicitly
  // remove them so ``fetch`` generates the appropriate headers for the target
  // backend.
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];

  try {
    const response = await axios({
      url: target,
      method: req.method,
      headers,
      data:
        req.method !== 'GET' && req.method !== 'HEAD'
          ? typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body)
          : undefined,
      httpAgent: agent,
      httpsAgent: agent,
      validateStatus: () => true,
    });

    const contentType = response.headers['content-type'] || '';
    res.status(response.status);
    if (contentType.includes('application/json')) {
      res.json(response.data);
    } else {
      res.send(response.data);
    }
  } catch (error) {
    // When the backend is unreachable we still return HTTP 200 so the frontend
    // can surface a clear message instead of failing the request entirely.
    res
      .status(200)
      .json({ status: 'error', message: 'Unable to reach backend', detail: error.message });
  }
}
