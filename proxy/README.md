# Proxy CORS (Cloudflare Workers)

O marxists.org não permite que páginas de outros sites leiam seus textos pelo navegador (CORS).
Este Worker repassa **apenas** `https://www.marxists.org/*` e adiciona os cabeçalhos necessários.
É grátis (100 mil requisições/dia).

## Publicar

Pelo painel (sem instalar nada):
1. Crie uma conta em <https://dash.cloudflare.com> → **Workers & Pages → Create → Hello World**.
2. Dê o nome `leitor-marxista`, clique **Deploy**, depois **Edit code**.
3. Apague o código e cole o conteúdo de `worker.js`. **Deploy**.
4. Copie a URL (`https://leitor-marxista.<usuario>.workers.dev`) e cole em `web/js/config.js`, no campo `proxy`.

Ou pela linha de comando: `cd proxy && npx wrangler deploy`.

Teste: `https://SEU-WORKER.workers.dev/?u=https%3A%2F%2Fwww.marxists.org%2Fportugues%2Fabramo%2F1987%2F11%2F24.htm`
