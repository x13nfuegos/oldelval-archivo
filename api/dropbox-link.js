// Serverless proxy para generar/recuperar un Dropbox public share link.
// Mantiene el token en el servidor y cachea la respuesta 24 h en el CDN.
//
// Configure en Vercel: Settings → Environment Variables
//   DROPBOX_ACCESS_TOKEN     (Production + Preview)
//   DROPBOX_TEAM_MEMBER_ID   (opcional, para espacios de equipo Business)

export default async function handler(req, res) {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'DROPBOX_ACCESS_TOKEN not configured' });
    return;
  }

  const path = req.query.path;
  if (!path || !path.startsWith('/')) {
    res.status(400).json({ error: 'path param required (must start with /)' });
    return;
  }

  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };
  // Para cuentas Business con DROPBOX_TEAM_MEMBER_ID
  const memberId = process.env.DROPBOX_TEAM_MEMBER_ID;
  if (memberId) {
    headers['Dropbox-API-Select-User'] = memberId;
    headers['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', root: 'auto' });
  }

  try {
    // Intenta crear el link primero
    const createRes = await fetch(
      'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          path,
          settings: { audience: 'public', access: 'viewer' },
        }),
      }
    );
    const createBody = await createRes.json();

    if (createRes.ok && createBody.url) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.json({ url: createBody.url });
    }

    const tag = createBody.error?.['.tag'];

    if (tag === 'shared_link_already_exists') {
      // A veces Dropbox devuelve el link existente dentro del error
      const meta = createBody.error?.shared_link_already_exists;
      if (meta?.['.tag'] === 'metadata' && meta?.metadata?.url) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.json({ url: meta.metadata.url });
      }

      // Si no viene en el error, lo listamos
      const listRes = await fetch(
        'https://api.dropboxapi.com/2/sharing/list_shared_links',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ path, direct_only: true }),
        }
      );
      const listBody = await listRes.json();
      const existing = listBody.links?.[0]?.url;
      if (existing) {
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.json({ url: existing });
      }
    }

    res.status(502).json({ error: 'Could not get share link', tag, detail: createBody.error_summary });
  } catch (e) {
    res.status(502).json({ error: 'Upstream error', detail: String(e) });
  }
}
