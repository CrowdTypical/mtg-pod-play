import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Serverless proxy for Archidekt API requests.
 * Avoids CORS issues and is more reliable than rewrite rules.
 *
 * Client calls: /api/archidekt/decks/123/
 * Proxy fetches: https://archidekt.com/api/decks/123/
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // Build the target URL from the path segments.
  const segments = Array.isArray(req.query.path)
    ? req.query.path
    : [req.query.path];
  const path = segments.join('/');

  // Forward query string (e.g. ?recursive=true)
  const queryString = req.url?.includes('?')
    ? req.url.substring(req.url.indexOf('?'))
    : '';

  const targetUrl = `https://archidekt.com/api/${path}${queryString}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MTG-Pod-Play/1.0',
      },
    });

    // Set CORS headers so the browser allows the response.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (!response.ok) {
      res.status(response.status).json({
        error: `Archidekt returned ${response.status}`,
        details: await response.text().catch(() => null),
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