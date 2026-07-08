// functions/api/submit-result.js
//
// Permite que un jugador reporte el resultado de una partida 1v1 desde
// la página pública. El resultado NO se aplica al ranking: se guarda
// en record.pending para que el admin lo revise y decida si lo acepta
// o lo descarta desde el panel de administración.
//
// Igual que ranking.js, esta función es la única que conoce la API Key
// de escritura de JSONBin (variable de entorno JSONBIN_KEY) — nunca
// viaja al navegador.

const MAX_PENDING = 500;
const MAX_NOTE_LEN = 200;

export async function onRequestPost(context) {
  const { env, request } = context;
  const binId = env.JSONBIN_ID;
  const apiKey = env.JSONBIN_KEY;

  if (!binId || !apiKey) {
    return json({ error: 'El servidor no tiene configurado JSONBIN_ID / JSONBIN_KEY.' }, 500);
  }

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

  const headers = { 'Content-Type': 'application/json', 'X-Master-Key': apiKey };

  try {
    // 1. Leer el estado actual (para no pisar cambios de otros).
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { headers });
    if (!getRes.ok) return json({ error: `No se pudo leer JSONBin (HTTP ${getRes.status})` }, 502);
    const getJson = await getRes.json();
    const record = getJson.record || {};

    const roster = record.roster || [];
    const names = new Set(roster.map((p) => p.name));
    if (!names.has(playerA) || !names.has(playerB)) {
      return json({ error: 'Uno de los jugadores no existe en el ranking.' }, 400);
    }

    // 2. Agregar el reporte a la cola de pendientes.
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

    // 3. Guardar de nuevo el documento completo (JSONBin no soporta
    //    parches parciales — pero como acabamos de leer el último
    //    estado, no perdemos cambios que haya hecho el admin mientras
    //    tanto).
    const putRes = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
