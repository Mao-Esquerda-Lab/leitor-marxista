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
