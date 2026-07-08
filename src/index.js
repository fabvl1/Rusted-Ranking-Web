// src/index.js
//
// Cloudflare Worker (con Static Assets) — reemplaza a la carpeta
// functions/ de Cloudflare Pages Functions. El flujo de "Workers
// Builds" que Cloudflare usa ahora al conectar un repo por Git no
// interpreta ese formato de Pages Functions; en cambio, espera un
// único Worker con un `fetch` handler. Este archivo hace de router:
//
//   GET  /api/ranking        -> lee el ranking desde JSONBin
//   POST /api/submit-result  -> guarda un reporte de resultado pendiente
//   cualquier otra ruta      -> sirve los archivos estáticos (public/index.html, etc.)
//
// Este Worker usa un Bin ID fijo de JSONBin y no depende de una
// API Key para hacer las lecturas/escrituras.

const MAX_PENDING = 500;
const MAX_NOTE_LEN = 200;
const JSONBIN_ID = '6a406783da38895dfe0960ee';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ranking' && request.method === 'GET') {
      return handleRanking();
    }
    if (url.pathname === '/api/submit-result' && request.method === 'POST') {
      return handleSubmitResult(request);
    }

    // Cualquier otra ruta: servir los archivos estáticos (index.html, etc.)
    return env.ASSETS.fetch(request);
  },
};

async function handleRanking() {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, { headers });
    if (!res.ok) return json({ error: `JSONBin respondió HTTP ${res.status}` }, res.status);
    const data = await res.json();
    return json(data, 200, true);
  } catch (err) {
    return json({ error: 'No se pudo contactar a JSONBin: ' + err.message }, 502);
  }
}

async function handleSubmitResult(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body inválido, se esperaba JSON.' }, 400);
  }

  const playerA = String(body.playerA || '').trim();
  const playerB = String(body.playerB || '').trim();
  const winner = String(body.winner || '').trim();
  const note = String(body.note || '').trim().slice(0, MAX_NOTE_LEN);

  if (!playerA || !playerB || playerA === playerB) {
    return json({ error: 'Elegí dos jugadores distintos.' }, 400);
  }
  if (winner !== playerA && winner !== playerB) {
    return json({ error: 'El ganador tiene que ser uno de los dos jugadores.' }, 400);
  }

  const headers = { 'Content-Type': 'application/json' };

  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, { headers });
    if (!getRes.ok) return json({ error: `No se pudo leer JSONBin (HTTP ${getRes.status})` }, 502);
    const getJson = await getRes.json();
    const record = getJson.record || {};

    const roster = record.roster || [];
    const names = new Set(roster.map((p) => p.name));
    if (!names.has(playerA) || !names.has(playerB)) {
      return json({ error: 'Uno de los jugadores no existe en el ranking.' }, 400);
    }

    record.pending = record.pending || [];
    record.pending.push({
      id: crypto.randomUUID(),
      playerA,
      playerB,
      winner,
      note,
      submittedAt: Date.now(),
      status: 'pending',
    });
    if (record.pending.length > MAX_PENDING) {
      record.pending = record.pending.slice(record.pending.length - MAX_PENDING);
    }

    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(record),
    });
    if (!putRes.ok) return json({ error: `No se pudo guardar en JSONBin (HTTP ${putRes.status})` }, 502);

    return json({ ok: true });
  } catch (err) {
    return json({ error: 'Error de red: ' + err.message }, 502);
  }
}

function json(obj, status = 200, noStore = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (noStore) headers['Cache-Control'] = 'no-store';
  return new Response(JSON.stringify(obj), { status, headers });
}
