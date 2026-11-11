# Leitor Marxista

Leitor dos textos do [Arquivo Marxista na Internet (português)](https://www.marxists.org/portugues/).
Esta é a versão **web/PWA** do app Android, para funcionar também no iPhone/iPad.

- `web/` — o app (HTML/CSS/JS puro, sem build), em **português e inglês** (botão PT/EN no topo; na primeira visita usa o idioma do navegador). Catálogos em `web/data/catalog-pt.json` e `catalog-en.json`. Publicado no GitHub Pages pelo workflow `.github/workflows/pages.yml`.
- `proxy/` — Cloudflare Worker que libera o acesso aos textos (o site de origem não tem CORS).

## Publicar

1. **Pages:** em *Settings → Pages → Source*, escolha **GitHub Actions**. Faça merge na `main`; o site sai em `https://<usuario>.github.io/leitor-marxista/`.
2. **Proxy:** siga `proxy/README.md` e coloque a URL em `web/js/config.js`.

## Instalar no iPhone

Abra o endereço no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.

## Testar localmente

```
cd web && python3 -m http.server 8000
```
