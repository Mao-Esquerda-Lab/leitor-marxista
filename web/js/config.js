/* Configuração da versão web (GitHub Pages).
 *
 * O site marxists.org não permite leitura direta pelo navegador (CORS), então os textos
 * são buscados por um proxy. Veja proxy/README.md para publicar o seu (grátis, 5 minutos)
 * e cole a URL abaixo. Sem ele, o app tenta os proxies públicos de reserva (menos estáveis).
 */
window.LM_CONFIG = {
  proxy: '', // ex.: 'https://leitor-marxista.SEU-USUARIO.workers.dev'
  proxiesReserva: [
    'https://corsproxy.io/?url={url}',
    'https://api.allorigins.win/raw?url={url}',
  ],
};

/* Idioma: escolha salva (botão PT/EN no topo) ou, na primeira visita, o idioma do navegador. */
window.APP_CONFIG = (() => {
  let salvo = null;
  try { salvo = localStorage.getItem('lm-idioma'); } catch (e) { /* ignora */ }
  const lang = (salvo === 'pt' || salvo === 'en') ? salvo : (/^en/i.test(navigator.language || '') ? 'en' : 'pt');
  return { lang };
})();
