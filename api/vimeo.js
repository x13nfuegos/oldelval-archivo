// Vercel serverless proxy for the Vimeo API.
// Keeps the Vimeo access token on the server side.
//
// Configure in Vercel: Settings → Environment Variables
//   VIMEO_TOKEN  (Production + Preview)

export default async function handler(req, res) {
  const token = process.env.VIMEO_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'VIMEO_TOKEN not configured' });
    return;
  }

  const { query = '', page = '1', per_page = '50', sort = 'date', direction = 'desc' } = req.query || {};
  const params = new URLSearchParams({
    per_page: String(per_page),
    page: String(page),
    query: String(query),
    sort: String(sort),
    direction: String(direction),
    fields: 'uri,name,description,duration,created_time,pictures,stats',
  });

  try {
    const r = await fetch('https://api.vimeo.com/me/videos?' + params.toString(), {
      headers: { Authorization: 'bearer ' + token },
    });
    const body = await r.text();
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    res.status(r.status).setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: 'Upstream error', detail: String(e) });
  }
}
