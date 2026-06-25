import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Serverless proxy for Archidekt API requests.
 * Avoids CORS issues by fetching server-side.
 *
 * Client calls: /api/archidekt-proxy?path=decks/123/
 * Proxy fetches: https://archidekt.com/api/decks/123/
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Get the Archidekt API path from query parameter
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!path) {
    res.status(400).json({ error: 'Missing "path" query parameter.' });
    return;
  }

  const targetUrl = `https://archidekt.com/api/${path}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MTG-Pod-Play/1.0',
      },
    });

    if (!response.ok) {
      res.status(response.status).json({
        error: `Archidekt returned ${response.status}`,
      });
      return;
    }

    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(data);
  } catch (err) {
    console.error('Archidekt proxy error:', err);
    res.status(502).json({
      error: 'Failed to reach Archidekt. The service may be down.',
    });
  }
}