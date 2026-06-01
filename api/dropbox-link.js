// Serverless proxy para generar/recuperar un Dropbox public share link.
// Mantiene el token en el servidor y cachea la respuesta 24 h en el CDN.
//
// Configure en Vercel: Settings → Environment Variables
//   DROPBOX_REFRESH_TOKEN    (Recomendado: Token de refresco de OAuth2)
//   DROPBOX_APP_KEY          (Recomendado: App Key de Dropbox)
//   DROPBOX_APP_SECRET       (Recomendado: App Secret de Dropbox)
//   DROPBOX_ACCESS_TOKEN     (Fallback/Legacy: Token estático)
//   DROPBOX_TEAM_MEMBER_ID   (Opcional, para espacios de equipo Business)

async function getAccessToken() {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;

  if (refreshToken && appKey && appSecret) {
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: appKey,
        client_secret: appSecret,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.statusText} (${await response.text()})`);
    }
    const data = await response.json();
    return data.access_token;
  }

  const staticToken = process.env.DROPBOX_ACCESS_TOKEN;
  if (staticToken) {
    return staticToken;
  }

  throw new Error('No Dropbox credentials configured. Provide DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, and DROPBOX_APP_SECRET, or DROPBOX_ACCESS_TOKEN.');
}

export default async function handler(req, res) {
  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    res.status(500).json({ error: 'Dropbox authentication failed', detail: err.message });
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
