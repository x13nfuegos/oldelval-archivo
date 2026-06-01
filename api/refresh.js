// Dispara el workflow de GitHub Actions "update-data.yml" manualmente.
// Requiere un Personal Access Token (PAT) con scope "workflow".
//
// Configure en Vercel: Settings → Environment Variables
//   GITHUB_PAT    PAT con permiso "workflow" (o "actions:write")
//   GITHUB_REPO   (opcional) owner/repo — por defecto "xienfuegos/oldelval-archivo"

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.GITHUB_PAT;
  if (!token) {
    res.status(500).json({ error: 'GITHUB_PAT not configured' });
    return;
  }

  const repo = process.env.GITHUB_REPO || 'xienfuegos/oldelval-archivo';
  const workflow = 'update-data.yml';

  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'oldelval-archivo',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );

    if (r.status === 204) {
      res.json({ ok: true, message: 'Actualización iniciada. Los datos se actualizarán en ~2–3 min.' });
    } else {
      const body = await r.text();
      res.status(r.status).json({ ok: false, error: body });
    }
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
