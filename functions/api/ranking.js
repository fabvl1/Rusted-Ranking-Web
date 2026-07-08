// functions/api/ranking.js
//
// Cloudflare Pages Function (reemplaza a la función de Netlify).
// Netlify ejecuta sus funciones sobre AWS Lambda, y AWS bloquea a nivel
// de red el tráfico proveniente de Cuba (por las sanciones/embargo de
// EE.UU.). Cloudflare, en cambio, mantiene sus servicios gratuitos
// disponibles para usuarios de Cuba bajo las licencias generales de
// OFAC para comunicaciones/Internet — por eso movemos el "puente" hacia
// JSONBin acá.
//
// El Bin ID y la API Key siguen sin viajar nunca al navegador: se leen
// desde variables de entorno configuradas en el panel de Cloudflare
// Pages (Settings → Environment variables):
//
//   JSONBIN_ID   -> el ID del bin (el mismo que usa el admin al publicar)
//   JSONBIN_KEY  -> la API key de JSONBin (X-Master-Key)
//
// Esta función responde a GET /api/ranking (por la ruta del archivo:
// functions/api/ranking.js).

export async function onRequestGet(context) {
  const { env } = context;
  const binId = env.JSONBIN_ID;
  const apiKey = env.JSONBIN_KEY;

  if (!binId) {
    return new Response(
      JSON.stringify({ error: 'Falta configurar la variable de entorno JSONBIN_ID en Cloudflare Pages.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Master-Key'] = apiKey;

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { headers });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `JSONBin respondió HTTP ${res.status}` }),
        { status: res.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const json = await res.json();

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'No se pudo contactar a JSONBin: ' + err.message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
