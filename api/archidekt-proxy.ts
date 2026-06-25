import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Serverless proxy for Archidekt API requests.
 * Avoids CORS issues by fetching server-side.
 *
 * Route: /api/archidekt/* → https://archidekt.com/api/*
 *
 * The full path is reconstructed from req.url.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // req.url will be something like "/api/archidekt/decks/123/?recursive=true"
  // Strip "/api/archidekt" prefix to get the Archidekt API path
  const url = req.url || '';
  const apiPath = url.replace(/^\/api\/archidekt/, '').split('?')[0];
  const queryString = url.includes('?') ? '?' + url.split('?')[1] : '';

  const targetUrl = `https://archidekt.com/api/${apiPath}${queryString}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MTG-Pod-Play/1.0',
      },
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

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