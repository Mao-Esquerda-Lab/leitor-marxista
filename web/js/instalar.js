/* Aviso (toast) orientando a salvar o site como app: Android (Chrome) e iOS (Safari). */
(() => {
  const T = IDIOMAS[APP_CONFIG.lang].t;
  const CHAVE = 'lm.instalar-dispensado';
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const lido = () => { try { return localStorage.getItem(CHAVE) === '1'; } catch (e) { return false; } };
  const dispensar = () => { try { localStorage.setItem(CHAVE, '1'); } catch (e) { /* ignora */ } };
  if (instalado || lido() || !(ios || android)) return;

  let evento = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); evento = e; if (el) atualizar(); });
  addEventListener('appinstalled', () => { dispensar(); fechar(); });

  let el;
  const fechar = () => { if (el) { el.remove(); el = null; } };

  function atualizar() {
    const corpo = $c('.corpo');
    const botao = $c('.ok');
    if (ios) {
      const ic = '<span class="ic" aria-label="' + T.compartilhar + '">' +
        '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span>';
      corpo.innerHTML = '<strong>' + T.instTitulo + '</strong>' + T.instIos.replace('{ic}', ic);
      botao.hidden = true;
    } else if (evento) {
      corpo.innerHTML = '<strong>' + T.instTitulo + '</strong>' + T.instAndroid;
      botao.hidden = false;
    } else {
      corpo.innerHTML = '<strong>' + T.instTitulo + '</strong>' + T.instMenu;
      botao.hidden = true;
    }
  }
  const $c = s => el.querySelector(s);

  function mostrar() {
    el = document.createElement('div');
    el.id = 'instalar'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="corpo"></div><button class="ok" hidden>' + T.instalar + '</button><button class="x" aria-label="' + T.fechar + '">×</button>';
    document.body.appendChild(el);
    atualizar();
    $c('.x').onclick = () => { dispensar(); fechar(); };
    $c('.ok').onclick = async () => {
      if (!evento) return;
      evento.prompt();
      const r = await evento.userChoice.catch(() => ({}));
      evento = null; if (r.outcome === 'accepted') dispensar(); fechar();
    };
  }

  // Espera um pouco para não competir com a abertura do app.
  addEventListener('load', () => setTimeout(mostrar, 4000));
})();
