import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const { path, content, access = 'public' } = req.body || {};
    if (!path || !content) {
      res.status(400).json({ error: 'Missing path or content' });
      return;
    }
    const { url } = await put(path, content, { access, token: process.env.BLOB_READ_WRITE_TOKEN });
    res.status(200).json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
