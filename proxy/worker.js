/* Proxy CORS mínimo para o Leitor Marxista (Cloudflare Workers).
 * Só repassa GET para https://www.marxists.org/portugues/... e devolve os bytes originais
 * (o app decodifica UTF-8 / Windows-1252 sozinho) com cabeçalhos CORS. */
const PERMITIDO = /^https:\/\/www\.marxists\.org\/portugues\//;

export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'GET') return new Response('Método não permitido', { status: 405, headers: cors });

    const alvo = new URL(req.url).searchParams.get('u') || '';
    if (!PERMITIDO.test(alvo)) return new Response('Endereço não permitido', { status: 400, headers: cors });

    const r = await fetch(alvo, { cf: { cacheEverything: true, cacheTtl: 86400 } });
    const h = new Headers(cors);
    h.set('Content-Type', r.headers.get('Content-Type') || 'text/html');
    h.set('Cache-Control', 'public, max-age=86400');
    return new Response(r.body, { status: r.status, headers: h });
  },
};
