// Posrednik za klepet v aplikaciji Rokomet Celje (Cloudflare Worker).
// Sprejme vprašanje samo od prijavljenega uporabnika aplikacije (Firebase), omeji število vprašanj na dan
// in pokliče odprtokodni model v Cloudflare Workers AI. Navodila za namestitev: NAVODILA.md.
//
// Povezave (Settings → Bindings):  AI = Workers AI (obvezno),  CHAT_KV = KV namespace (neobvezno, za dnevno omejitev).
// Spremenljivke (Settings → Variables, neobvezno):  MODEL, DAILY_LIMIT, ALLOWED_ORIGINS.

const PROJECT_ID = 'rokomet-celje';
const DEFAULT_ORIGINS = ['https://isvrljuga.github.io'];
const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_DAILY_LIMIT = 30;
const MAX_CONTEXT = 40000, MAX_QUESTION = 1000, MAX_HISTORY = 6;

const SYSTEM = `Si analitik rokometnega kluba ŽRK Celje. Odgovarjaš v slovenščini, kratko in jasno.
Odgovarjaj samo iz razdelka PODATKI spodaj. Številk ne izmišljuj in jih ne računaj na novo, ampak jih prepiši iz podatkov.
Če odgovora v podatkih ni, to povej. Ko primerjaš igralke ali tekme, lahko uporabiš kratko tabelo.
Pomen kod: G gol, 7m sedemmetrovka, A asistenca, DA/DN aktivno/neaktivno dobljena žoga, NA/NN aktivna/neaktivna napaka,
POA/PON naš prekršek v obrambi (aktiven/neaktiven), PNA/PNN pridobljen prekršek v napadu, krivda = krivda za prejeti gol.
Index je seštevek uteži akcij; index/tekmo deli index s tekmami, v katerih je igralka igrala;
% časa = igralni čas / možni čas ((360 − izključitve) / 6 na tekmo); index na čas = index / delež časa.`;

let jwks = null, jwksUntil = 0;
async function googleKeys() {
  if (jwks && Date.now() < jwksUntil) return jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('keys');
  jwks = (await r.json()).keys;
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwksUntil = Date.now() + (m ? Number(m[1]) * 1000 : 3600000);
  return jwks;
}
function b64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
}
// Preveri Firebase ID žeton (RS256, izdajatelj in občinstvo projekta rokomet-celje, veljavnost).
async function verifyToken(token) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) throw new Error('token');
  const dec = x => JSON.parse(new TextDecoder().decode(b64url(x)));
  const header = dec(h), claims = dec(p), now = Date.now() / 1000;
  if (header.alg !== 'RS256' || claims.aud !== PROJECT_ID || claims.iss !== `https://securetoken.google.com/${PROJECT_ID}`
    || !claims.sub || !(claims.exp > now) || claims.iat > now + 300) throw new Error('claims');
  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`))) throw new Error('signature');
  return claims;
}

export default {
  async fetch(req, env) {
    const origins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(x => x.trim()) : DEFAULT_ORIGINS;
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Posrednik sprejema samo vprašanja iz aplikacije.' }, 405);
    if (!origins.includes(origin)) return json({ error: 'Vprašanja so dovoljena samo iz aplikacije.' }, 403);

    let user;
    try { user = await verifyToken((req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')); }
    catch { return json({ error: 'Za klepet se prijavi v aplikacijo.' }, 401); }

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Neveljavna zahteva.' }, 400); }
    const question = String(body.question || '').trim().slice(0, MAX_QUESTION);
    const context = String(body.context || '').slice(0, MAX_CONTEXT);
    if (!question) return json({ error: 'Vpiši vprašanje.' }, 400);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-MAX_HISTORY)
      .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

    // Dnevna omejitev na uporabnika (če je povezan KV namespace CHAT_KV).
    let left = null;
    if (env.CHAT_KV) {
      const limit = Number(env.DAILY_LIMIT) || DEFAULT_DAILY_LIMIT, key = `${user.sub}:${new Date().toISOString().slice(0, 10)}`;
      const used = Number(await env.CHAT_KV.get(key)) || 0;
      if (used >= limit) return json({ error: `Danes si porabil vseh ${limit} vprašanj. Poskusi znova jutri.` }, 429);
      await env.CHAT_KV.put(key, String(used + 1), { expirationTtl: 172800 });
      left = limit - used - 1;
    }

    try {
      const r = await env.AI.run(env.MODEL || DEFAULT_MODEL, {
        messages: [{ role: 'system', content: `${SYSTEM}\n\nPODATKI:\n${context}` }, ...history, { role: 'user', content: question }],
        max_tokens: 900, temperature: 0.2,
      });
      const answer = r?.response ?? r?.choices?.[0]?.message?.content ?? '';
      if (!answer) return json({ error: 'Model ni vrnil odgovora.' }, 502);
      return json({ answer, left });
    } catch (e) {
      console.error(e);
      return json({ error: 'Model trenutno ni dosegljiv. Poskusi čez nekaj minut.' }, 502);
    }
  },
};
