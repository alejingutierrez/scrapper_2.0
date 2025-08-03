const BACKEND_URL = process.env.SCRAPER_API_URL || 'http://localhost:8000';

export default async function handler(req, res) {
  const target = `${BACKEND_URL}/`;

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
    res.status(500).json({ error: error.message });
  }
}
