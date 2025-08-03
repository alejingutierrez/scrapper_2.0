import { get } from '@vercel/edge-config';

export default async function handler(req, res) {
  try {
    const greeting = await get('greeting');
    res.status(200).json(greeting);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
