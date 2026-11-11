'use strict';
/* Leitor Marxista — lê a seção em português do Arquivo Marxista na Internet (marxists.org). */

const ORIGEM = 'https://www.marxists.org/portugues/';
const NATIVO = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
// Versão web: o marxists.org não libera CORS, então os textos passam por um proxy (ver js/config.js).
const CONFIG = window.LM_CONFIG || {};
const PIX_CODIGO = '00020126580014BR.GOV.BCB.PIX01362c20f9f8-d517-4cb0-952f-a544ff2750435204000053039865802BR5924Osorio Lopes Feijo Filho6009SAO PAULO62140510L6iN9201SS6304C25B';

/* ------------------------------------------------------------ utilidades */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const simples = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const guardar = (k, v) => { try { localStorage.setItem('lm.' + k, JSON.stringify(v)); } catch (e) { /* cheio */ } };
const ler = (k, d) => { try { const v = localStorage.getItem('lm.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const imagem = c => ORIGEM + c;
const rotaLer = (p, a) => '#/ler?p=' + encodeURIComponent(p) + (a ? '&a=' + encodeURIComponent(a) : '');
const ehPdf = p => /\.pdf(#|$)/i.test(p);

function aviso(msg) {
  const el = $('#aviso');
  el.textContent = msg; el.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (el.hidden = true), 2600);
}

function abrirExterno(url) {
  const B = NATIVO && Capacitor.Plugins && Capacitor.Plugins.Browser;
  if (B) B.open({ url }); else window.open(url, '_blank', 'noopener');
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch (e) {
    const t = document.createElement('textarea');
    t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}

/* ------------------------------------------------- cache de textos (offline) */
const cacheTextos = (() => {
  let p;
  const abrir = () => p || (p = new Promise((ok, erro) => {
    const r = indexedDB.open('leitor-marxista', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('paginas');
    r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
  }));
  const tx = async (modo, f) => {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction('paginas', modo); const req = f(t.objectStore('paginas'));
      t.oncomplete = () => ok(req && req.result); t.onerror = () => erro(t.error);
    });
  };
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => null),
    set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}),
  };
})();

/* --------------------------------------------------------------- rede */
// Proxies tentados em ordem. O próprio (Cloudflare Worker) vem primeiro; os públicos são reserva.
function proxiesDisponiveis(url) {
  const lista = [];
  if (CONFIG.proxy) lista.push(CONFIG.proxy.replace(/\/+$/, '') + '/?u=' + encodeURIComponent(url));
  for (const f of (CONFIG.proxiesReserva || [])) lista.push(f.replace('{url}', encodeURIComponent(url)));
  return lista;
}

async function baixar(caminho) {
  const url = ORIGEM + caminho;
  const H = NATIVO && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp;
  if (H) {
    const r = await H.get({ url, responseType: 'arraybuffer' });
    if (r.status >= 400) throw new Error('HTTP ' + r.status);
    if (typeof r.data !== 'string') return new TextEncoder().encode(JSON.stringify(r.data));
    try {
      const bin = atob(r.data); const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    } catch (e) { return new TextEncoder().encode(r.data); }
  }
  let ultimo;
  for (const alvo of proxiesDisponiveis(url)) {
    try {
      const r = await fetch(alvo);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length < 50) throw new Error('resposta vazia');
      return b;
    } catch (e) { ultimo = e; }
  }
  throw ultimo || new Error('Nenhum proxy configurado');
}

function decodificar(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
}

/* ------------------------------------------------------------ catálogo */
let CAT = null;
const AUTOR = {};
let indiceObras = null;

async function carregarCatalogo() {
  if (CAT) return CAT;
  const r = await fetch('data/catalog.json');
  CAT = await r.json();
  for (const a of CAT.authors) AUTOR[a.id] = a;
  return CAT;
}

function obrasIndice() {
  if (indiceObras) return indiceObras;
  indiceObras = [];
  for (const a of CAT.authors) for (const w of a.works) indiceObras.push({ s: simples(w[0]), w, a });
  return indiceObras;
}

const autorDoCaminho = p => AUTOR[p.split('/')[0]];

/* -------------------------------------------- limpeza da página do site */
function limparPagina(html, caminho) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = new URL(ORIGEM + caminho);
  const corpo = doc.body;
  let titulo = (doc.querySelector('h1') || {}).textContent || doc.title || caminho;
  titulo = titulo.replace(/\s+/g, ' ').replace(/\(\d+\*?\)/g, '').trim();

  $$('script,style,link,meta,iframe,form,input,button,select,noscript,object,embed,.toplink,.toplink-centro,img.logo,img.logodic,nav', corpo).forEach(e => e.remove());
  // links "Início da página", "voltar ao índice", etc.
  $$('a', corpo).forEach(a => {
    const t = simples(a.textContent.trim());
    if (/^(inicio da pagina|topo|voltar|voltar ao (topo|indice|inicio)|seja um voluntario!?)$/.test(t)) {
      const p = a.closest('p'); (p && p.textContent.trim().length < 60 ? p : a).remove();
    }
  });
  $$('font,center,big,small', corpo).forEach(e => e.replaceWith(...e.childNodes));
  $$('*', corpo).forEach(e => {
    for (const at of [...e.attributes]) {
      const n = at.name.toLowerCase();
      if (n.startsWith('on') || ['style', 'align', 'bgcolor', 'color', 'face', 'size', 'background', 'border', 'cellpadding', 'cellspacing', 'valign', 'target'].includes(n)) e.removeAttribute(at.name);
      if ((n === 'width' || n === 'height') && e.tagName !== 'IMG') e.removeAttribute(at.name);
    }
    if (e.tagName === 'IMG') e.removeAttribute('height');
  });

  $$('a[href]', corpo).forEach(a => {
    const href = a.getAttribute('href').trim();
    let u;
    try { u = new URL(href, base); } catch (e) { a.removeAttribute('href'); return; }
    if (u.protocol === 'mailto:') return;
    if (u.origin + u.pathname === base.origin + base.pathname) {
      if (u.hash) { a.dataset.ancora = decodeURIComponent(u.hash.slice(1)); a.setAttribute('href', '#'); }
      return;
    }
    let pth = u.pathname;
    if (pth.endsWith('/')) pth += 'index.htm';
    if (/(^|\.)marxists\.org$/.test(u.hostname) && pth.startsWith('/portugues/') && /\.html?$/i.test(pth)) {
      const cam = decodeURI(pth.slice('/portugues/'.length));
      const m = cam.match(/^([^/]+)\/index\.htm$/);
      if (m && AUTOR[m[1]]) { a.setAttribute('href', '#/autor/' + encodeURIComponent(m[1])); return; }
      a.setAttribute('href', rotaLer(cam, u.hash.slice(1)));
    } else {
      a.dataset.externo = u.href; a.setAttribute('href', '#');
      a.classList.add(/\.pdf$/i.test(pth) ? 'pdf' : 'externo');
    }
  });

  $$('img[src]', corpo).forEach(img => {
    try {
      const u = new URL(img.getAttribute('src'), base);
      img.src = (NATIVO || !/marxists\.org$/.test(u.hostname)) ? u.href : '/mia' + u.pathname;
      img.loading = 'lazy';
    } catch (e) { img.remove(); }
  });

  return { titulo, html: corpo.innerHTML };
}

/* -------------------------------------------------------- aparência */
const FONTES = [
  { id: 'serif', nome: 'Serifada', css: 'Georgia, "Noto Serif", "Droid Serif", serif' },
  { id: 'sans', nome: 'Sem serifa', css: 'Roboto, system-ui, "Segoe UI", sans-serif' },
  { id: 'livro', nome: 'Livro', css: '"Palatino Linotype", "Book Antiqua", Palatino, "Noto Serif", serif' },
  { id: 'cond', nome: 'Condensada', css: '"sans-serif-condensed", "Roboto Condensed", "Arial Narrow", sans-serif' },
  { id: 'mono', nome: 'Máquina de escrever', css: '"Courier New", "Droid Sans Mono", "Cutive Mono", monospace' },
  { id: 'casual', nome: 'Casual', css: 'casual, "Comic Sans MS", "Coming Soon", cursive' },
];
const TEMAS = [
  { id: 'claro', nome: 'Claro', fundo: '#fbfaf7', texto: '#1d1b19', link: '#b3121d', barra: '#9a0007' },
  { id: 'sepia', nome: 'Sépia', fundo: '#f4ecd8', texto: '#3b2f22', link: '#9c2a12', barra: '#7a1d0e' },
  { id: 'cinza', nome: 'Cinza', fundo: '#d9d9d6', texto: '#202020', link: '#8e0d16', barra: '#5c0a10' },
  { id: 'escuro', nome: 'Escuro', fundo: '#1c1c1e', texto: '#dedede', link: '#ff8a80', barra: '#3a0b0b' },
  { id: 'preto', nome: 'Preto', fundo: '#000000', texto: '#c9c9c9', link: '#ff6e6e', barra: '#000000' },
  { id: 'vermelho', nome: 'Vermelho', fundo: '#4a0808', texto: '#fbe9d0', link: '#ffcc00', barra: '#2e0404' },
];
const PADRAO = { fonte: 'serif', tam: 19, entrelinha: 1.6, margem: 18, alinhar: 'left', tema: 'claro', cores: null };
let AP = Object.assign({}, PADRAO, ler('aparencia', {}));

function coresAtuais() {
  const t = TEMAS.find(t => t.id === AP.tema) || TEMAS[0];
  return AP.tema === 'personalizado' && AP.cores ? Object.assign({}, t, AP.cores, { barra: '#7a0006' }) : t;
}

function aplicarAparencia() {
  const r = document.documentElement.style;
  const c = coresAtuais();
  r.setProperty('--fundo', c.fundo); r.setProperty('--texto', c.texto); r.setProperty('--link', c.link); r.setProperty('--barra', c.barra);
  r.setProperty('--fonte', (FONTES.find(f => f.id === AP.fonte) || FONTES[0]).css);
  r.setProperty('--tam', AP.tam + 'px'); r.setProperty('--entrelinha', AP.entrelinha);
  r.setProperty('--margem', AP.margem + 'px'); r.setProperty('--alinhar', AP.alinhar);
  document.querySelector('meta[name=theme-color]').content = c.barra;
  document.documentElement.style.colorScheme = ['escuro', 'preto', 'vermelho'].includes(AP.tema) ? 'dark' : 'light';
  guardar('aparencia', AP);
  sincronizarPainel();
}

function montarPainel() {
  $('#fontes').innerHTML = FONTES.map(f => `<button class="opcao" data-fonte="${f.id}" style="font-family:${esc(f.css)}">${f.nome}</button>`).join('');
  $('#temas-cor').innerHTML = TEMAS.map(t => `<button class="opcao cor" data-tema="${t.id}" title="${t.nome}" aria-label="${t.nome}" style="background:${t.fundo};color:${t.texto}">Aa</button>`).join('');
  const p = $('#painel');
  p.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fonte) AP.fonte = b.dataset.fonte;
    if (b.dataset.tema) { AP.tema = b.dataset.tema; AP.cores = null; }
    if (b.dataset.alinhar) AP.alinhar = b.dataset.alinhar;
    if (b.dataset.passo) AP.tam = Math.min(34, Math.max(13, AP.tam + Number(b.dataset.d)));
    if (b.id === 'restaurar') AP = Object.assign({}, PADRAO);
    aplicarAparencia();
  });
  $('#tamanho').oninput = e => { AP.tam = +e.target.value; aplicarAparencia(); };
  $('#entrelinha').oninput = e => { AP.entrelinha = +e.target.value; aplicarAparencia(); };
  $('#margem').oninput = e => { AP.margem = +e.target.value; aplicarAparencia(); };
  for (const k of ['texto', 'fundo', 'link']) {
    $('#cor-' + k).oninput = e => {
      const c = coresAtuais();
      AP.cores = { fundo: c.fundo, texto: c.texto, link: c.link, [k]: e.target.value };
      AP.tema = 'personalizado'; aplicarAparencia();
    };
  }
  $('#btn-aparencia').onclick = () => abrirPainel(true);
  $('#painel-fundo').onclick = () => abrirPainel(false);
}

function sincronizarPainel() {
  const c = coresAtuais();
  $('#tamanho').value = AP.tam; $('#v-tamanho').textContent = AP.tam + ' px';
  $('#entrelinha').value = AP.entrelinha; $('#v-entrelinha').textContent = Number(AP.entrelinha).toFixed(1);
  $('#margem').value = AP.margem; $('#v-margem').textContent = AP.margem + ' px';
  $('#cor-texto').value = c.texto; $('#cor-fundo').value = c.fundo; $('#cor-link').value = c.link;
  $$('#painel [data-fonte]').forEach(b => b.classList.toggle('ativa', b.dataset.fonte === AP.fonte));
  $$('#painel [data-tema]').forEach(b => b.classList.toggle('ativa', b.dataset.tema === AP.tema));
  $$('#painel [data-alinhar]').forEach(b => b.classList.toggle('ativa', b.dataset.alinhar === AP.alinhar));
}

function abrirPainel(abrir) { $('#painel').hidden = !abrir; $('#painel-fundo').hidden = !abrir; }

/* ------------------------------------------- favoritos, histórico, progresso */
const pessoal = {
  favs: () => ler('favoritos', []),
  hist: () => ler('historico', []),
  pos: () => ler('posicoes', {}),
  ehFav: p => pessoal.favs().some(f => f.p === p),
  alternarFav(item) {
    let f = pessoal.favs();
    if (f.some(x => x.p === item.p)) f = f.filter(x => x.p !== item.p); else f.unshift(item);
    guardar('favoritos', f); return pessoal.ehFav(item.p);
  },
  registrar(item) {
    const h = pessoal.hist().filter(x => x.p !== item.p);
    h.unshift(Object.assign(item, { quando: Date.now() }));
    guardar('historico', h.slice(0, 60));
  },
  salvarPos(p, frac) {
    const m = pessoal.pos(); m[p] = Math.round(frac * 1000) / 1000;
    const ks = Object.keys(m); if (ks.length > 400) delete m[ks[0]];
    guardar('posicoes', m);
  },
};

/* --------------------------------------------------------- componentes */
function itemObra(w, autor, mostrarAutor) {
  const [titulo, p, data] = w;
  const pdf = ehPdf(p);
  const href = pdf ? '#' : rotaLer(p);
  const ext = pdf ? ` data-externo="${esc(ORIGEM + p)}"` : '';
  const sub = mostrarAutor && autor ? `<span class="s">${esc(autor.name)}</span>` : '';
  return `<li><a class="item" href="${href}"${ext}>${data ? `<span class="data">${esc(data)}</span>` : ''}<span class="txt"><span class="t">${esc(titulo)}</span>${sub}</span>${pdf ? '<span class="selo">PDF</span>' : ''}</a></li>`;
}

function avatar(a) {
  const ini = esc((a.name || '?').trim()[0]);
  return a.avatar ? `<img class="avatar" loading="lazy" alt="" src="${imagem(a.avatar)}" onerror="this.outerHTML='<span class=&quot;avatar vazio&quot;>${ini}</span>'">` : `<span class="avatar vazio">${ini}</span>`;
}

function itemAutor(a) {
  return `<li><a class="item" href="#/autor/${encodeURIComponent(a.id)}">${avatar(a)}<span class="txt"><span class="t">${esc(a.name)}</span><span class="s">${esc([a.years || a.dates, a.country !== 'Outros' ? a.country : ''].filter(Boolean).join(' · '))}</span></span><span class="n">${a.works.length || ''}</span></a></li>`;
}

function itemLeitura(x, prog) {
  const a = autorDoCaminho(x.p);
  const pr = prog != null ? `<div class="barra-prog"><div style="width:${Math.round(prog * 100)}%"></div></div>` : '';
  return `<li><a class="item" href="${rotaLer(x.p)}"><span class="txt"><span class="t">${esc(x.titulo)}</span><span class="s">${esc(a ? a.name : '')}</span>${pr}</span></a></li>`;
}

const BANDEIRAS = {
  'Brasil': '🇧🇷', 'Portugal': '🇵🇹', 'Rússia / URSS': '☭', 'Alemanha': '🇩🇪', 'França': '🇫🇷', 'Itália': '🇮🇹', 'Espanha': '🇪🇸',
  'Reino Unido': '🇬🇧', 'Irlanda': '🇮🇪', 'Estados Unidos': '🇺🇸', 'Canadá': '🇨🇦', 'Cuba': '🇨🇺', 'México': '🇲🇽', 'Argentina': '🇦🇷',
  'Chile': '🇨🇱', 'Peru': '🇵🇪', 'Bolívia': '🇧🇴', 'Colômbia': '🇨🇴', 'Venezuela': '🇻🇪', 'Uruguai': '🇺🇾', 'Paraguai': '🇵🇾',
  'Nicarágua': '🇳🇮', 'El Salvador': '🇸🇻', 'Guatemala': '🇬🇹', 'Haiti': '🇭🇹', 'China': '🇨🇳', 'Vietnã': '🇻🇳', 'Coreia': '🇰🇵',
  'Japão': '🇯🇵', 'Índia': '🇮🇳', 'Filipinas': '🇵🇭', 'Indonésia': '🇮🇩', 'Polônia': '🇵🇱', 'Hungria': '🇭🇺', 'Tchecoslováquia': '🇨🇿',
  'Bulgária': '🇧🇬', 'Romênia': '🇷🇴', 'Iugoslávia': '🇷🇸', 'Albânia': '🇦🇱', 'Grécia': '🇬🇷', 'Áustria': '🇦🇹', 'Suíça': '🇨🇭',
  'Bélgica': '🇧🇪', 'Holanda': '🇳🇱', 'Suécia': '🇸🇪', 'Noruega': '🇳🇴', 'Dinamarca': '🇩🇰', 'Finlândia': '🇫🇮', 'Ucrânia': '🇺🇦',
  'Geórgia': '🇬🇪', 'Países Bálticos': '🇱🇻', 'Angola': '🇦🇴', 'Moçambique': '🇲🇿', 'Guiné-Bissau / Cabo Verde': '🇬🇼',
  'África do Sul': '🇿🇦', 'Burkina Faso': '🇧🇫', 'Gana': '🇬🇭', 'Congo': '🇨🇩', 'Egito': '🇪🇬', 'Argélia': '🇩🇿', 'Palestina': '🇵🇸',
  'Irã': '🇮🇷', 'Iraque': '🇮🇶', 'Turquia': '🇹🇷', 'Martinica / Caribe': '🇯🇲', 'Outros': '🌍',
};

function campoBusca(placeholder, valor = '') {
  return `<div class="busca"><input type="search" id="filtro" placeholder="${esc(placeholder)}" value="${esc(valor)}" autocomplete="off" enterkeyhint="search"></div>`;
}

function aoDigitar(fn) {
  const i = $('#filtro'); if (!i) return;
  let t; i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => fn(i.value), 120); });
}

function resultadosBusca(q) {
  const termos = simples(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return '';
  const casa = s => termos.every(t => s.includes(t));
  const autores = CAT.authors.filter(a => casa(simples(a.name + ' ' + a.full))).slice(0, 30);
  const temas = CAT.themes.filter(t => casa(simples(t.title)));
  const figs = CAT.figures.filter(f => casa(simples(f.name))).slice(0, 30);
  const obras = obrasIndice().filter(o => casa(o.s + ' ' + simples(o.a.name))).slice(0, 80);
  let h = '';
  if (autores.length) h += `<h2 class="secao">Autores</h2><ul class="lista">${autores.map(itemAutor).join('')}</ul>`;
  if (temas.length) h += `<h2 class="secao">Temas</h2><ul class="lista">${temas.map(itemTema).join('')}</ul>`;
  if (obras.length) h += `<h2 class="secao">Textos</h2><ul class="lista">${obras.map(o => itemObra(o.w, o.a, true)).join('')}</ul>`;
  if (figs.length) h += `<h2 class="secao">Dicionário político</h2><ul class="lista">${figs.map(itemFigura).join('')}</ul>`;
  return h || `<p class="vazio-msg">Nada encontrado para “${esc(q)}”.</p>`;
}

/* --------------------------------------------------------------- telas */
const conteudo = () => $('#conteudo');

function topo(titulo, { voltar = true, fav = null } = {}) {
  $('#titulo').textContent = titulo;
  $('#voltar').hidden = !voltar; $('#logo').hidden = voltar;
  const bf = $('#btn-fav');
  bf.hidden = !fav;
  if (fav) {
    bf.classList.toggle('ativo', pessoal.ehFav(fav.p));
    bf.onclick = () => { const on = pessoal.alternarFav(fav); bf.classList.toggle('ativo', on); aviso(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos'); };
  }
}

function telaInicio() {
  topo('Leitor Marxista', { voltar: false });
  const hist = pessoal.hist(), favs = pessoal.favs(), pos = pessoal.pos();
  const ult = hist[0];
  const nPaises = new Set(CAT.authors.map(a => a.country)).size;
  const nObras = CAT.authors.reduce((s, a) => s + a.works.length, 0);
  conteudo().innerHTML = `<div class="pagina">
    <div class="capa"><img src="img/emblema.svg" alt=""><div><h2>Leitor Marxista</h2><p>${nObras.toLocaleString('pt-BR')} textos de ${CAT.authors.length} autores, do Arquivo Marxista na Internet.</p></div></div>
    ${campoBusca('Buscar autor, texto, tema…')}
    <div id="resultado"></div>
    <div id="inicio-corpo">
      ${ult ? `<h2 class="secao">Continuar lendo</h2><ul class="lista">${itemLeitura(ult, pos[ult.p] || 0)}</ul>` : ''}
      <h2 class="secao">Explorar</h2>
      <div class="atalhos">
        <a href="#/autores"><b>${CAT.authors.length}</b><span>Autores</span></a>
        <a href="#/paises"><b>${nPaises}</b><span>Países</span></a>
        <a href="#/temas"><b>${CAT.themes.length}</b><span>Temas</span></a>
        <a href="#/figuras"><b>${CAT.figures.filter(f => f.person).length}</b><span>Figuras históricas</span></a>
      </div>
      ${favs.length ? `<h2 class="secao">Favoritos</h2><ul class="lista">${favs.slice(0, 5).map(x => itemLeitura(x)).join('')}</ul>${favs.length > 5 ? '<p><a href="#/lista/favoritos">Ver todos os favoritos</a></p>' : ''}` : ''}
      ${hist.length > 1 ? `<h2 class="secao">Lidos recentemente</h2><ul class="lista">${hist.slice(1, 6).map(x => itemLeitura(x, pos[x.p] || 0)).join('')}</ul>${hist.length > 6 ? '<p><a href="#/lista/historico">Ver histórico completo</a></p>' : ''}` : ''}
      <p class="creditos">Os textos vêm do <b>Arquivo Marxista na Internet</b> (marxists.org), mantido por voluntários. Catálogo atualizado em ${esc(CAT.generated)}. Os textos lidos ficam guardados no aparelho para leitura sem internet.</p>
    </div></div>`;
  aoDigitar(q => {
    $('#resultado').innerHTML = resultadosBusca(q);
    $('#inicio-corpo').hidden = !!q.trim();
  });
}

function telaLista({ arg }) {
  const fav = arg === 'favoritos';
  topo(fav ? 'Favoritos' : 'Histórico');
  const itens = fav ? pessoal.favs() : pessoal.hist(); const pos = pessoal.pos();
  conteudo().innerHTML = `<div class="pagina"><ul class="lista" style="margin-top:8px">${itens.map(x => itemLeitura(x, fav ? null : pos[x.p] || 0)).join('') || '<li class="vazio-msg">Vazio</li>'}</ul></div>`;
}

function telaAutores() {
  topo('Autores', { voltar: false });
  const render = q => {
    const t = simples(q);
    const lista = CAT.authors.filter(a => !t || simples(a.name + ' ' + a.full + ' ' + a.country).includes(t));
    let h = '', letra = '';
    for (const a of lista) {
      const l = simples(a.name)[0].toUpperCase();
      if (l !== letra) { if (letra) h += '</ul>'; letra = l; h += `<h2 class="secao">${esc(l)}</h2><ul class="lista">`; }
      h += itemAutor(a);
    }
    $('#resultado').innerHTML = lista.length ? h + '</ul>' : '<p class="vazio-msg">Nenhum autor encontrado.</p>';
  };
  conteudo().innerHTML = `<div class="pagina">${campoBusca('Filtrar autores')}<div id="resultado"></div></div>`;
  render(''); aoDigitar(render);
}

function telaAutor({ arg }) {
  const a = AUTOR[arg];
  if (!a) return telaErro('Autor não encontrado.');
  topo(a.name.split(',')[0]);
  const secoes = a.sections.map((nome, i) => ({ nome, obras: a.works.filter(w => w[3] === i) })).filter(s => s.obras.length);
  conteudo().innerHTML = `<div class="pagina">
    <div class="autor-topo">
      ${a.photo ? `<img src="${imagem(a.photo)}" alt="" onerror="this.remove()">` : ''}
      <div><h2>${esc(a.full || a.name)}</h2><div class="datas">${esc(a.dates || a.years)}</div>
      <a class="chip" href="#/pais/${encodeURIComponent(a.country)}">${BANDEIRAS[a.country] || '🌍'} ${esc(a.country === 'Outros' ? 'País não identificado' : a.country)}</a></div>
    </div>
    ${a.bio ? `<p class="bio curta" id="bio">${esc(a.bio)}</p><button class="link-btn" id="mais-bio">Ler mais</button>` : ''}
    ${a.bioPath ? ` · <a class="link-btn" href="${rotaLer(a.bioPath)}">Biografia completa</a>` : ''}
    ${secoes.map(s => `<h2 class="secao">${esc(s.nome || 'Obras')} (${s.obras.length})</h2><ul class="lista">${s.obras.map(w => itemObra(w, a)).join('')}</ul>`).join('')}
    ${!a.works.length ? `<p class="vazio-msg">Este autor não tem lista de textos no formato esperado.<br><br><a class="botao" href="${rotaLer(a.id + '/index.htm')}">Abrir página do autor</a></p>` : ''}
  </div>`;
  const mb = $('#mais-bio');
  if (mb) mb.onclick = () => { const b = $('#bio'); b.classList.toggle('curta'); mb.textContent = b.classList.contains('curta') ? 'Ler mais' : 'Ler menos'; };
}

function telaPaises() {
  topo('Países', { voltar: false });
  const cont = {};
  for (const a of CAT.authors) cont[a.country] = (cont[a.country] || 0) + 1;
  const lista = Object.entries(cont).sort((x, y) => (x[0] === 'Outros') - (y[0] === 'Outros') || y[1] - x[1]);
  conteudo().innerHTML = `<div class="pagina"><p class="creditos" style="margin:10px 4px">País de origem ou de atuação de cada autor, identificado pela biografia.</p><ul class="lista">${lista.map(([p, n]) =>
    `<li><a class="item" href="#/pais/${encodeURIComponent(p)}"><span class="bandeira">${BANDEIRAS[p] || '🌍'}</span><span class="txt"><span class="t">${esc(p === 'Outros' ? 'Não identificado' : p)}</span></span><span class="n">${n} autor${n > 1 ? 'es' : ''}</span></a></li>`).join('')}</ul></div>`;
}

function telaPais({ arg }) {
  topo(arg === 'Outros' ? 'País não identificado' : arg);
  const lista = CAT.authors.filter(a => a.country === arg);
  conteudo().innerHTML = `<div class="pagina"><ul class="lista" style="margin-top:8px">${lista.map(itemAutor).join('')}</ul></div>`;
}

function itemTema(t) {
  const n = t.groups.reduce((s, g) => s + g.works.length, 0);
  return `<li><a class="item" href="#/tema/${encodeURIComponent(t.id)}"><span class="txt"><span class="t">${esc(t.title)}</span></span><span class="n">${n} textos</span></a></li>`;
}

function telaTemas() {
  topo('Temas', { voltar: false });
  conteudo().innerHTML = `<div class="pagina"><ul class="lista" style="margin-top:8px">${CAT.themes.map(itemTema).join('')}</ul></div>`;
}

function telaTema({ arg }) {
  const t = CAT.themes.find(x => x.id === arg);
  if (!t) return telaErro('Tema não encontrado.');
  topo(t.title);
  conteudo().innerHTML = `<div class="pagina">${t.groups.map(g => `<h2 class="secao">${esc(g.name || t.title)}</h2><ul class="lista">${g.works.map(w => itemObra(w, autorDoCaminho(w[1]), !g.name)).join('')}</ul>`).join('')}</div>`;
}

function itemFigura(f) {
  return `<li><a class="item" href="${rotaLer(f.path)}"><span class="txt"><span class="t">${esc(f.name)}</span></span>${f.author ? '<span class="selo">TEM OBRAS</span>' : ''}</a></li>`;
}

function telaFiguras() {
  topo('Figuras históricas', { voltar: false });
  let letra = ler('figLetra', 'A'), soPessoas = ler('figPessoas', true), q = '';
  const letras = [...new Set(CAT.figures.map(f => simples(f.name)[0].toUpperCase()))].filter(l => /[A-Z]/.test(l)).sort();
  const render = () => {
    const t = simples(q);
    let lista = CAT.figures.filter(f => (!soPessoas || f.person));
    lista = t ? lista.filter(f => simples(f.name).includes(t)).slice(0, 300) : lista.filter(f => simples(f.name)[0].toUpperCase() === letra);
    $$('.letras button').forEach(b => b.classList.toggle('ativa', !t && b.dataset.l === letra));
    $('#resultado').innerHTML = lista.length ? `<ul class="lista">${lista.map(itemFigura).join('')}</ul>` : '<p class="vazio-msg">Nada encontrado.</p>';
  };
  conteudo().innerHTML = `<div class="pagina">${campoBusca('Buscar no dicionário político')}
    <label class="creditos" style="display:flex;gap:8px;align-items:center;margin:0 4px 10px"><input type="checkbox" id="so-pessoas" ${soPessoas ? 'checked' : ''}> Mostrar só pessoas (ocultar conceitos e organizações)</label>
    <div class="letras">${letras.map(l => `<button data-l="${l}">${l}</button>`).join('')}</div><div id="resultado"></div></div>`;
  $('.letras').onclick = e => { const b = e.target.closest('button'); if (!b) return; letra = b.dataset.l; guardar('figLetra', letra); q = ''; $('#filtro').value = ''; render(); };
  $('#so-pessoas').onchange = e => { soPessoas = e.target.checked; guardar('figPessoas', soPessoas); render(); };
  render(); aoDigitar(v => { q = v; render(); });
}

function telaApoie() {
  topo('Apoie', { voltar: false });
  conteudo().innerHTML = `<div class="pagina apoie">
    <img class="emblema" src="img/emblema.svg" alt="">
    <h2>Apoie o nosso trabalho</h2>
    <p>Este aplicativo é gratuito e feito de forma independente. Se ele é útil para você, considere contribuir com qualquer valor via Pix. Sua ajuda mantém o projeto vivo.</p>
    <div class="qr"><img src="img/pix.png" alt="QR Code Pix"></div>
    <p><button class="botao" id="copiar-pix">Copiar código Pix (copia e cola)</button></p>
    <p style="font-size:14px">No app do seu banco, escolha <b>Pix → Pix Copia e Cola</b> e cole o código. Se estiver em outro aparelho, escaneie o QR Code acima.</p>
    <details><summary class="creditos" style="cursor:pointer">Ver código</summary><div class="pix-codigo">${esc(PIX_CODIGO)}</div></details>
    <p class="creditos">Os textos pertencem ao Arquivo Marxista na Internet (marxists.org) e seus tradutores. Apoie também o MIA sendo voluntário: marxists.org/portugues.</p>
  </div>`;
  $('#copiar-pix').onclick = async () => aviso(await copiar(PIX_CODIGO) ? 'Código Pix copiado! Agora cole no app do banco.' : 'Não foi possível copiar.');
}

function telaErro(msg) {
  topo('Ops');
  conteudo().innerHTML = `<div class="pagina erro"><p>${esc(msg)}</p><a class="botao" href="#/">Ir para o início</a></div>`;
}

let leituraAtual = null;

async function telaLer({ params }, token) {
  const p = params.p;
  if (!p) return telaErro('Texto não informado.');
  const autor = autorDoCaminho(p);
  topo(autor ? autor.name.split(',')[0] : 'Leitura');
  document.body.classList.add('lendo');
  conteudo().innerHTML = '<div class="carregando">Carregando texto…</div>';
  let pag = await cacheTextos.get(p);
  if (!pag) {
    try {
      pag = limparPagina(decodificar(await baixar(p)), p);
      cacheTextos.set(p, pag);
    } catch (e) {
      if (token !== rota.token) return;
      conteudo().innerHTML = `<div class="pagina erro"><p>Não foi possível carregar o texto. Verifique sua conexão com a internet.</p>
        <p><button class="botao" id="tentar">Tentar de novo</button></p><p><a href="#" data-externo="${esc(ORIGEM + p)}">Abrir no navegador</a></p></div>`;
      $('#tentar').onclick = rotear;
      return;
    }
  }
  if (token !== rota.token) return;
  const item = { p, titulo: pag.titulo };
  leituraAtual = p;
  topo(pag.titulo, { fav: item });
  conteudo().innerHTML = `<article class="leitor">${pag.html}</article>
    <div class="rodape-leitor">Fonte: <a href="#" data-externo="${esc(ORIGEM + p)}">marxists.org/portugues/${esc(p)}</a>${autor ? `<br><br><a class="botao secundario" href="#/autor/${encodeURIComponent(autor.id)}">Mais textos de ${esc(autor.name.split(',').reverse().join(' ').trim())}</a>` : ''}</div>`;
  pessoal.registrar(item);
  requestAnimationFrame(() => {
    if (params.a) irParaAncora(params.a);
    else {
      const f = pessoal.pos()[p];
      if (f) window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight));
    }
    atualizarProgresso();
  });
}

function irParaAncora(id) {
  const alvo = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
  if (!alvo) return;
  const y = alvo.getBoundingClientRect().top + scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topo')) - 70;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  const bloco = alvo.closest('p,li,h1,h2,h3,h4,td,div') || alvo;
  bloco.classList.remove('destaque-ancora'); void bloco.offsetWidth; bloco.classList.add('destaque-ancora');
}

function atualizarProgresso() {
  const barra = $('#progresso div');
  if (!document.body.classList.contains('lendo')) { barra.style.width = '0'; return; }
  const max = document.documentElement.scrollHeight - innerHeight;
  const f = max > 0 ? Math.min(1, scrollY / max) : 1;
  barra.style.width = (f * 100) + '%';
  clearTimeout(atualizarProgresso.t);
  atualizarProgresso.t = setTimeout(() => leituraAtual && pessoal.salvarPos(leituraAtual, f), 400);
}

/* --------------------------------------------------------------- rotas */
const TELAS = {
  '': telaInicio, autores: telaAutores, autor: telaAutor, paises: telaPaises, pais: telaPais,
  temas: telaTemas, tema: telaTema, figuras: telaFiguras, apoie: telaApoie, ler: telaLer, lista: telaLista,
};
const ABA = { '': 'inicio', autores: 'autores', autor: 'autores', paises: 'paises', pais: 'paises', temas: 'temas', tema: 'temas', figuras: 'figuras', apoie: 'apoie' };
const rota = { token: 0, anterior: null, rolagem: {} };

async function rotear() {
  if (rota.anterior && !rota.anterior.startsWith('#/ler')) rota.rolagem[rota.anterior] = scrollY;
  const hash = location.hash || '#/';
  rota.anterior = hash;
  const [cam, q] = hash.slice(1).split('?');
  const partes = cam.split('/').filter(Boolean);
  const nome = partes[0] || '';
  const arg = partes.slice(1).map(decodeURIComponent).join('/');
  const params = Object.fromEntries(new URLSearchParams(q || ''));
  const token = ++rota.token;
  document.body.classList.remove('lendo', 'mostrar-abas');
  leituraAtual = null; abrirPainel(false);
  $$('#abas a').forEach(a => a.classList.toggle('ativa', a.dataset.aba === ABA[nome]));
  const tela = TELAS[nome];
  if (!tela) return telaErro('Página não encontrada.');
  await tela({ arg, params }, token);
  if (nome !== 'ler' && token === rota.token) window.scrollTo(0, rota.rolagem[hash] || 0);
  atualizarProgresso();
}

const pilha = [];
function anotarNavegacao() {
  const h = location.hash || '#/';
  if (pilha.length > 1 && pilha[pilha.length - 2] === h) pilha.pop();
  else if (pilha[pilha.length - 1] !== h) pilha.push(h);
}
function voltar() {
  if (pilha.length > 1) history.back(); else location.hash = '#/';
}

/* -------------------------------------------------------------- início */
async function iniciar() {
  montarPainel(); aplicarAparencia();
  $('#voltar').onclick = voltar;

  conteudo().addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && a.dataset.ancora) { e.preventDefault(); irParaAncora(a.dataset.ancora); return; }
    if (a && a.dataset.externo) { e.preventDefault(); abrirExterno(a.dataset.externo); return; }
    if (!a && document.body.classList.contains('lendo') && !e.target.closest('button,input,summary')) document.body.classList.toggle('mostrar-abas');
  });
  addEventListener('scroll', atualizarProgresso, { passive: true });
  addEventListener('hashchange', () => { anotarNavegacao(); rotear(); });

  if ('serviceWorker' in navigator && !NATIVO) navigator.serviceWorker.register('sw.js').catch(() => {});

  conteudo().innerHTML = '<div class="carregando">Abrindo a biblioteca…</div>';
  try { await carregarCatalogo(); } catch (e) { return telaErro('Não foi possível abrir o catálogo de textos.'); }
  anotarNavegacao();
  rotear();
}

iniciar();
