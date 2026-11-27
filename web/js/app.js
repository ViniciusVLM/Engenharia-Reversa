import { sessao } from './api.js';
import { h, icone, limpar, carregando, erroView, modal } from './ui.js';

const MENU = [
  { id: 'painel', rotulo: 'Início', href: '#/', icone: 'painel', grupo: 'Geral' },
  { id: 'processos', rotulo: 'Processos', href: '#/processos', icone: 'processos', grupo: 'Geral' },
  { id: 'compras', rotulo: 'Compras', href: '#/compras', icone: 'compras', grupo: 'Módulos' },
  { id: 'financeiro', rotulo: 'Financeiro', href: '#/financeiro', icone: 'financeiro', grupo: 'Módulos' },
  { id: 'fiscal', rotulo: 'Fiscal', href: '#/fiscal', icone: 'fiscal', grupo: 'Módulos' },
  { id: 'rh', rotulo: 'RH', href: '#/rh', icone: 'rh', grupo: 'Módulos' },
  { id: 'cadastros', rotulo: 'Cadastros', href: '#/cadastros', icone: 'cadastros', grupo: 'Sistema' },
  { id: 'ajustes', rotulo: 'Ajustes', href: '#/ajustes', icone: 'ajustes', grupo: 'Sistema' },
];

const ROTAS = [
  [/^\/$/, 'painel', 'painel'],
  [/^\/processos$/, 'processos', 'lista'],
  [/^\/processos\/(\d+)$/, 'processos', 'quadro'],
  [/^\/processos\/(\d+)\/configurar$/, 'processos', 'configurar'],
  [/^\/compras$/, 'compras', 'inicio'],
  [/^\/compras\/solicitacoes\/nova$/, 'compras', 'novaSolicitacao'],
  [/^\/compras\/solicitacoes\/(\d+)$/, 'compras', 'solicitacao'],
  [/^\/compras\/pedidos\/novo$/, 'compras', 'novoPedido'],
  [/^\/compras\/pedidos\/(\d+)$/, 'compras', 'pedido'],
  [/^\/financeiro$/, 'financeiro', 'inicio'],
  [/^\/financeiro\/contas\/(\d+)$/, 'financeiro', 'extrato'],
  [/^\/fiscal$/, 'fiscal', 'inicio'],
  [/^\/fiscal\/notas\/nova$/, 'fiscal', 'novaNota'],
  [/^\/fiscal\/notas\/(\d+)$/, 'fiscal', 'nota'],
  [/^\/rh$/, 'rh', 'inicio'],
  [/^\/rh\/colaboradores\/novo$/, 'rh', 'novoColaborador'],
  [/^\/rh\/colaboradores\/(\d+)$/, 'rh', 'colaborador'],
  [/^\/rh\/folha\/(\d{4}-\d{2})$/, 'rh', 'folha'],
  [/^\/cadastros$/, 'cadastros', 'inicio'],
  [/^\/ajustes$/, 'ajustes', 'inicio'],
];

const raiz = document.getElementById('raiz');
let principal = null;
let geracao = 0;

export function aplicarTema() {
  let tema = 'auto';
  try { tema = localStorage.getItem('alicerce.tema') || 'auto'; } catch { /* sem storage */ }
  if (tema === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.dataset.tema = tema;
}

function lerHash() {
  const bruto = location.hash.replace(/^#/, '') || '/';
  const [caminho, qs] = bruto.split('?');
  return { caminho: caminho || '/', query: Object.fromEntries(new URLSearchParams(qs ?? '')) };
}

function montarLayout() {
  const grupos = [...new Set(MENU.map((m) => m.grupo))];
  const lateral = h('aside', { class: 'lateral' },
    h('a', { class: 'marca', href: '#/' }, h('img', { src: '/icons/icone.svg', alt: '' }), h('div', null, 'Alicerce', h('small', null, 'ERP + processos'))),
    h('nav', { class: 'nav', 'aria-label': 'Módulos' }, grupos.map((g) => [
      h('div', { class: 'nav-grupo' }, g),
      MENU.filter((m) => m.grupo === g).map((m) => h('a', { href: m.href, dataset: { modulo: m.id } }, icone(m.icone), m.rotulo)),
    ])),
    h('div', { class: 'lateral-rodape' }, sessao.usuario?.nome ?? '', h('br'),
      h('a', { href: '#/ajustes' }, 'Ajustes e sair')),
  );
  const inferior = h('nav', { class: 'barra-inferior', 'aria-label': 'Navegação' },
    ['painel', 'processos', 'compras', 'financeiro'].map((id) => {
      const m = MENU.find((x) => x.id === id);
      return h('a', { href: m.href, dataset: { modulo: m.id } }, icone(m.icone), m.rotulo);
    }),
    h('button', { type: 'button', dataset: { modulo: 'mais' }, onclick: abrirMais }, icone('mais'), 'Mais'),
  );
  principal = h('main', { class: 'principal', id: 'conteudo', tabindex: '-1' });
  limpar(raiz, h('div', { class: 'app' }, lateral, principal), inferior);
}

function abrirMais() {
  const m = modal({
    titulo: 'Módulos',
    corpo: h('nav', { class: 'nav' }, MENU.filter((x) => !['painel', 'processos', 'compras', 'financeiro'].includes(x.id))
      .map((x) => h('a', { href: x.href, onclick: () => m.fechar() }, icone(x.icone), x.rotulo))),
  });
}

function marcarAtivo(modulo) {
  for (const a of raiz.querySelectorAll('[data-modulo]')) {
    const ativo = a.dataset.modulo === modulo || (a.dataset.modulo === 'mais' && ['fiscal', 'rh', 'cadastros', 'ajustes'].includes(modulo));
    a.classList.toggle('ativo', ativo);
    if (a.tagName === 'A') a.toggleAttribute('aria-current', a.dataset.modulo === modulo);
  }
}

async function rotear() {
  const { caminho, query } = lerHash();
  const minha = ++geracao;

  if (!sessao.token) {
    principal = null;
    const { render } = await import('./views/login.js');
    return render(raiz);
  }
  if (caminho === '/login') { location.hash = '#/'; return; }
  if (!principal || !principal.isConnected) montarLayout();

  const rota = ROTAS.map(([re, mod, fn]) => ({ m: re.exec(caminho), mod, fn })).find((r) => r.m);
  if (!rota) {
    limpar(principal, erroView(new Error('Página não encontrada.')));
    return;
  }
  marcarAtivo(rota.mod === 'painel' ? 'painel' : rota.mod);
  limpar(principal, carregando());

  const alvo = h('div');
  try {
    const modulo = await import(`./views/${rota.mod}.js`);
    await modulo[rota.fn](alvo, { params: rota.m.slice(1), query, recarregar: rotear });
    if (minha !== geracao) return; // usuário já navegou para outra página
    limpar(principal, alvo);
    principal.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (minha !== geracao) return;
    console.error(e);
    limpar(principal, erroView(e, rotear));
  }
}

aplicarTema();
window.addEventListener('hashchange', rotear);
window.addEventListener('alicerce:sessao', () => { principal = null; rotear(); });
rotear();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* app funciona sem SW */ });
}
