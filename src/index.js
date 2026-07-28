// src/index.js
//
// Cloudflare Worker (con Static Assets) — reemplaza a la carpeta
// functions/ de Cloudflare Pages Functions. El flujo de "Workers
// Builds" que Cloudflare usa ahora al conectar un repo por Git no
// interpreta ese formato de Pages Functions; en cambio, espera un
// único Worker con un `fetch` handler. Este archivo hace de router:
//
//   GET  /api/ranking        -> lee el ranking desde GitHub Gist (público)
//   POST /api/report-user    -> guarda un reporte pendiente en el Gist de reportes
//   POST /api/submit-result  -> alias legacy de /api/report-user
//   cualquier otra ruta      -> sirve los archivos estáticos (public/index.html, etc.)
//
// Variables de entorno (opcional, en wrangler.jsonc / Cloudflare dashboard):
//   GITHUB_GIST_ID      — ID del Gist público con el ranking (obligatorio)
//   GITHUB_REPORTS_GIST_ID — ID del Gist de reportes (opcional, para POST)
//   GITHUB_TOKEN         — Token GitHub con scope gist (solo para escritura)

const MAX_REPORTS = 500;
const MAX_NOTE_LEN = 200;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ranking' && request.method === 'GET') {
      return handleRanking(env);
    }
    if ((url.pathname === '/api/report-user' || url.pathname === '/api/submit-result') && request.method === 'POST') {
      return handleSubmitResult(request, env);
    }

    // Cualquier otra ruta: servir los archivos estáticos (index.html, etc.)
    return env.ASSETS.fetch(request);
  },
};

async function readGist(gistId, token) {
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;

  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`GitHub Gist respondió HTTP ${res.status}`);

  const data = await res.json();
  const files = data.files || {};
  const jsonFile = Object.values(files).find(f => f.filename && f.filename.endsWith('.json'));
  if (!jsonFile) throw new Error('No se encontró archivo .json en el Gist');
  return JSON.parse(jsonFile.content);
}

async function updateGist(gistId, token, content) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const getRes = await fetch(`https://api.github.com/gists/${gistId}`, { headers, cache: 'no-store' });
  if (!getRes.ok) throw new Error(`No se pudo leer Gist (HTTP ${getRes.status})`);
  const data = await getRes.json();
  const files = data.files || {};
  const filename = Object.keys(files).find(f => f.endsWith('.json')) || 'data.json';

  const body = { files: { [filename]: { content: JSON.stringify(content, null, 2) } } };
  const putRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error(`No se pudo guardar en Gist (HTTP ${putRes.status})`);
  return await putRes.json();
}

const DEFAULT_GIST_ID = '8634a68273543e12ecefc85b03506c12';
const DEFAULT_REPORTS_GIST_ID = '2314c838396a6758fecf1fd3c5396459';

async function handleRanking(env) {
  const gistId = env.GITHUB_GIST_ID || DEFAULT_GIST_ID;

  try {
    const data = await readGist(gistId, env.GITHUB_TOKEN);
    return json(data, 200, true);
  } catch (err) {
    return json({ error: 'No se pudo leer el Gist: ' + err.message }, 502);
  }
}

async function handleSubmitResult(request, env) {
  const gistId = env.GITHUB_REPORTS_GIST_ID || DEFAULT_REPORTS_GIST_ID;
  const token = env.GITHUB_TOKEN;
  if (!token) return json({ error: 'GITHUB_TOKEN no está configurado en el Worker (necesario para guardar reportes)' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Body inválido, se esperaba JSON.' }, 400); }

  const playerA = String(body.playerA || '').trim();
  const playerB = String(body.playerB || '').trim();
  const winner = String(body.winner || '').trim();
  const note = String(body.note || '').trim().slice(0, MAX_NOTE_LEN);

  if (!playerA || !playerB || playerA === playerB) return json({ error: 'Elegí dos jugadores distintos.' }, 400);
  if (winner !== playerA && winner !== playerB) return json({ error: 'El ganador tiene que ser uno de los dos jugadores.' }, 400);

  try {
    const rankingGistId = env.GITHUB_GIST_ID || DEFAULT_GIST_ID;

    const record = await readGist(rankingGistId, token);
    const roster = record.roster || [];
    const names = new Set(roster.map(p => p.name));
    if (!names.has(playerA) || !names.has(playerB)) {
      return json({ error: 'Uno de los jugadores no existe en el ranking.' }, 400);
    }

    let reportsData;
    try { reportsData = await readGist(gistId, token); } catch { reportsData = { reports: [] }; }

    reportsData.reports = Array.isArray(reportsData.reports) ? reportsData.reports : [];
    reportsData.reports.push({
      id: crypto.randomUUID(), playerA, playerB, winner, note,
      submittedAt: Date.now(), status: 'pending',
    });
    if (reportsData.reports.length > MAX_REPORTS) {
      reportsData.reports = reportsData.reports.slice(reportsData.reports.length - MAX_REPORTS);
    }

    await updateGist(gistId, token, reportsData);
    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Error: ' + err.message }, 502);
  }
}

function json(obj, status = 200, noStore = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (noStore) headers['Cache-Control'] = 'no-store';
  return new Response(JSON.stringify(obj), { status, headers });
}
