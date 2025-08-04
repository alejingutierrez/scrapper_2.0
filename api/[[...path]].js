import axios from 'axios';
import http from 'http';
import https from 'https';

// ``SCRAPER_API_URL`` must be provided when running on Vercel. Locally we fall
// back to the development server on ``localhost``.
const BACKEND_URL =
  process.env.SCRAPER_API_URL ||
  (process.env.VERCEL ? undefined : 'http://localhost:8000');

export default async function handler(req, res) {
  const { path = [] } = req.query;

  if (!BACKEND_URL) {
    res.status(200).json({
      status: 'error',
      message:
        'SCRAPER_API_URL not configured. Please set this environment variable in your Vercel project settings.',
    });
    return;
  }

  const target = `${BACKEND_URL}/${Array.isArray(path) ? path.join('/') : path}`;

  const agent = BACKEND_URL.startsWith('https')
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });

  const headers = { ...req.headers };
  // Drop hop-by-hop headers which can cause ``fetch`` to reject the request or
  // forward incorrect values to the backend service.  ``fetch`` will populate
  // the right ``Host`` header based on the target URL.
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
