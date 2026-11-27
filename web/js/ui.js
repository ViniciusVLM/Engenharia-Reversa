// Utilitários de interface: criação de elementos, formatação, modais, tabelas e formulários.

export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v; // apenas para SVG de ícones estáticos
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  adicionar(el, filhos);
  return el;
}

function adicionar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

export function limpar(el, ...filhos) {
  el.replaceChildren();
  adicionar(el, filhos);
  return el;
}

// ------------------------------------------------------------------ formatação

const fMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const fmt = {
  moeda: (centavos) => (centavos == null ? '—' : fMoeda.format(centavos / 100)),
  moedaCurta(centavos) {
    const r = centavos / 100;
    const abs = Math.abs(r);
    if (abs >= 1e6) return `R$ ${(r / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (abs >= 1e3) return `R$ ${(r / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return fMoeda.format(r);
  },
  numero: (n) => (n == null ? '—' : fNum.format(n)),
  pct: (n) => `${String(n).replace('.', ',')}%`,
  data(iso) {
    if (!iso) return '—';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  },
  dataHora(s) {
    if (!s) return '—';
    const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  },
  dataCurta(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
  },
  competencia(c) {
    if (!c) return '—';
    const [a, m] = c.split('-');
    return `${MESES[Number(m) - 1]}/${a}`;
  },
};

/** "1.234,56" ou "1234.56" → centavos */
export function lerMoeda(texto) {
  if (texto == null) return null;
  let s = String(texto).replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export const paraTextoMoeda = (centavos) =>
  centavos == null ? '' : (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const hojeIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// ------------------------------------------------------------------ ícones (traço simples)

const ICONES = {
  painel: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  processos: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  compras: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  financeiro: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  fiscal: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h8M9 17h6"/>',
  rh: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.2 4.4 2 5 4.9"/>',
  cadastros: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mais: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  novo: '<path d="M12 5v14M5 12h14"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  raio: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  config: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  cima: '<path d="m6 15 6-6 6 6"/>',
  baixo: '<path d="m6 9 6 6 6-6"/>',
};

export function icone(nome) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONES[nome] ?? '';
  return svg;
}

// ------------------------------------------------------------------ feedback

export function toast(mensagem, tipo = 'ok') {
  const el = h('div', { class: `toast ${tipo === 'erro' ? 'erro' : ''}`, role: tipo === 'erro' ? 'alert' : 'status' }, mensagem);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3500);
}

export const carregando = () => h('div', { class: 'carregando' }, h('div', { class: 'girando', 'aria-label': 'Carregando' }));

export function vazio(titulo, texto, acao) {
  return h('div', { class: 'vazio' }, h('strong', null, titulo), texto && h('p', null, texto), acao);
}

export function erroView(e, tentarNovamente) {
  return h('div', { class: 'cartao' }, h('div', { class: 'vazio' },
    h('strong', null, 'Não foi possível carregar'),
    h('p', null, e.message),
    tentarNovamente && h('button', { class: 'btn', onclick: tentarNovamente }, 'Tentar novamente'),
  ));
}

/** Executa uma ação assíncrona com botão travado e toast de erro. Devolve o resultado ou undefined. */
export async function acao(botao, fn, mensagemOk) {
  const texto = botao?.textContent;
  if (botao) { botao.disabled = true; }
  try {
    const r = await fn();
    if (mensagemOk) toast(mensagemOk);
    return r ?? true;
  } catch (e) {
    toast(e.message, 'erro');
    return undefined;
  } finally {
    if (botao) { botao.disabled = false; if (texto && !botao.textContent) botao.textContent = texto; }
  }
}

// ------------------------------------------------------------------ modais

export function modal({ titulo, corpo, acoes = [], largo = false, gaveta = false, aoFechar }) {
  const anterior = document.activeElement;
  const rodape = acoes.length ? h('div', { class: 'modal-rodape' }) : null;
  const caixa = h('div', { class: `modal ${largo ? 'largo' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof titulo === 'string' ? titulo : 'Janela' },
    h('div', { class: 'modal-topo' },
      typeof titulo === 'string' ? h('h2', null, titulo) : titulo,
      h('button', { class: 'btn fantasma pequeno', 'aria-label': 'Fechar', onclick: () => fechar() }, icone('fechar')),
    ),
    h('div', { class: 'modal-corpo' }, corpo),
    rodape,
  );
  const fundo = h('div', { class: `sobreposicao ${gaveta ? 'gaveta' : ''}`, onmousedown: (e) => e.target === fundo && fechar() }, caixa);
  const tecla = (e) => e.key === 'Escape' && fechar();

  function fechar() {
    fundo.remove();
    document.removeEventListener('keydown', tecla);
    anterior?.focus?.();
    aoFechar?.();
  }

  for (const a of acoes) {
    const b = h('button', { class: `btn ${a.classe ?? ''}`, type: 'button' }, a.rotulo);
    b.addEventListener('click', async () => {
      if (!a.executar) return fechar();
      const ok = await acao(b, a.executar);
      if (ok !== undefined && ok !== false) fechar();
    });
    rodape.append(b);
  }
  document.addEventListener('keydown', tecla);
  document.body.append(fundo);
  setTimeout(() => (caixa.querySelector('input, select, textarea') ?? caixa.querySelector('.modal-rodape .btn:last-child'))?.focus(), 30);
  return { fechar, caixa };
}

export function confirmar(mensagem, { titulo = 'Confirmar', rotulo = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let resposta = false;
    modal({
      titulo,
      corpo: h('p', null, mensagem),
      acoes: [
        { rotulo: 'Voltar' },
        { rotulo, classe: perigo ? 'perigo' : 'primario', executar: async () => { resposta = true; return true; } },
      ],
      aoFechar: () => resolve(resposta),
    });
  });
}

/** Abre um formulário em modal. `enviar(valores)` deve lançar erro para manter aberto. */
export function formularioModal({ titulo, campos, rotulo = 'Salvar', enviar, largo }) {
  const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() }, campos);
  return modal({
    titulo, largo, corpo: form,
    acoes: [{ rotulo: 'Cancelar' }, { rotulo, classe: 'primario', executar: () => enviar(lerForm(form)) }],
  });
}

// ------------------------------------------------------------------ estrutura de página

export function cabecalho(titulo, { sub, acoes, trilha } = {}) {
  return h('div', { class: 'cabecalho' },
    h('div', null,
      trilha && h('div', { class: 'trilha' }, trilha.map((t, i) => [i ? ' / ' : '', t.href ? h('a', { href: t.href }, t.rotulo) : t.rotulo])),
      h('h1', null, titulo),
      sub && h('p', { class: 'sub' }, sub),
    ),
    acoes && h('div', { class: 'acoes' }, acoes),
  );
}

export function abas(base, itens, ativa) {
  return h('nav', { class: 'abas', 'aria-label': 'Seções' },
    itens.map((i) => h('a', { href: `${base}?aba=${i.id}`, class: i.id === ativa ? 'ativo' : '', 'aria-current': i.id === ativa ? 'page' : null },
      i.rotulo, i.contador ? h('span', { class: 'contador' }, i.contador) : null)),
  );
}

export function kpi({ rotulo, valor, detalhe, alerta }) {
  return h('div', { class: `cartao kpi ${alerta ? 'alerta' : ''}` },
    h('div', { class: 'rotulo' }, rotulo), h('div', { class: 'valor' }, valor), detalhe && h('div', { class: 'detalhe' }, detalhe));
}

const STATUS = {
  pendente: ['aviso', 'Pendente'], aprovada: ['info', 'Aprovada'], reprovada: ['erro', 'Reprovada'], atendida: ['ok', 'Atendida'],
  aberto: ['info', 'Aberto'], enviado: ['acento', 'Enviado'], recebido: ['ok', 'Recebido'], cancelado: ['', 'Cancelado'],
  emitida: ['ok', 'Emitida'], cancelada: ['', 'Cancelada'],
  pago: ['ok', 'Pago'], vencido: ['erro', 'Vencido'],
  ativo: ['ok', 'Ativo'], desligado: ['', 'Desligado'],
  aberta: ['aviso', 'Aberta'], fechada: ['ok', 'Fechada'], nao_calculada: ['', 'Não calculada'],
  clt: ['info', 'CLT'], aprendiz: ['acento', 'Aprendiz'], estagiario: ['aviso', 'Estagiário'],
  entrada: ['info', 'Entrada'], saida: ['acento', 'Saída'],
  pagar: ['erro', 'A pagar'], receber: ['ok', 'A receber'],
};
export function etiqueta(status, texto) {
  const [tom, rotulo] = STATUS[status] ?? ['', status];
  return h('span', { class: `etiqueta ${tom}` }, texto ?? rotulo);
}

/**
 * Tabela responsiva. colunas: [{ titulo, valor: (linha) => Node|string, num?: bool, rodape?: string|Node }]
 */
export function tabela({ colunas, linhas, aoClicar, vazioTexto = 'Nenhum registro encontrado.', rodape }) {
  if (!linhas.length) return vazio(vazioTexto);
  return h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela responsiva' },
    h('thead', null, h('tr', null, colunas.map((c) => h('th', { class: c.num ? 'num' : '', scope: 'col' }, c.titulo)))),
    h('tbody', null, linhas.map((l) => h('tr', {
      class: aoClicar ? 'clicavel' : '',
      tabindex: aoClicar ? '0' : null,
      onclick: aoClicar ? (e) => { if (!e.target.closest('button, a')) aoClicar(l); } : null,
      onkeydown: aoClicar ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) aoClicar(l); } : null,
    }, colunas.map((c) => h('td', { class: c.num ? 'num' : '', 'data-rotulo': c.titulo }, c.valor(l)))))),
    rodape && h('tfoot', null, h('tr', null, colunas.map((c, i) => h('td', { class: c.num ? 'num' : '', 'data-rotulo': c.titulo }, rodape[i] ?? '')))),
  ));
}

// ------------------------------------------------------------------ formulários

/**
 * Campo de formulário. tipo: text | email | number | date | month | moeda | select | textarea | checkbox
 * opcoes para select: [[valor, rotulo], ...]
 */
export function campo({ rotulo, nome, tipo = 'text', valor, opcoes, obrigatorio, ajuda, largo, attrs = {}, vazioRotulo = 'Selecione...' }) {
  let entrada;
  if (tipo === 'select') {
    entrada = h('select', { class: 'entrada', name: nome, required: obrigatorio, ...attrs },
      vazioRotulo !== null ? h('option', { value: '' }, vazioRotulo) : null,
      (opcoes ?? []).map(([v, l]) => h('option', { value: v, selected: String(v) === String(valor ?? '') }, l)));
  } else if (tipo === 'textarea') {
    entrada = h('textarea', { class: 'entrada', name: nome, required: obrigatorio, ...attrs });
    entrada.value = valor ?? '';
  } else if (tipo === 'checkbox') {
    return h('label', { class: `checkbox ${largo ? 'campo largo' : ''}` },
      h('input', { type: 'checkbox', name: nome, checked: !!valor, ...attrs }), rotulo);
  } else if (tipo === 'moeda') {
    entrada = h('input', { class: 'entrada num', name: nome, inputmode: 'decimal', placeholder: '0,00', 'data-moeda': '1', required: obrigatorio, ...attrs });
    entrada.value = paraTextoMoeda(valor);
    entrada.style.textAlign = 'left';
  } else {
    entrada = h('input', { class: 'entrada', type: tipo, name: nome, required: obrigatorio, ...(tipo === 'number' ? { step: 'any' } : {}), ...attrs });
    entrada.value = valor ?? '';
  }
  return h('label', { class: `campo ${largo ? 'largo' : ''}` },
    h('span', null, rotulo, obrigatorio ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
    entrada, ajuda && h('small', { class: 'ajuda' }, ajuda));
}

export function lerForm(form) {
  const dados = {};
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.type === 'checkbox') { dados[el.name] = el.checked; continue; }
    const bruto = el.value.trim();
    if (el.dataset.moeda) {
      const c = lerMoeda(bruto);
      if (Number.isNaN(c)) throw new Error(`Valor inválido em "${el.closest('label')?.querySelector('span')?.textContent ?? el.name}".`);
      dados[el.name] = c;
    } else if (el.type === 'number') dados[el.name] = bruto === '' ? null : Number(bruto);
    else dados[el.name] = bruto === '' ? null : bruto;
  }
  return dados;
}

/**
 * Editor de itens (produto + quantidade [+ preço]). Usado em Compras e Fiscal.
 * Devolve { el, valor() } — valor() lê os itens já validados.
 */
export function editorItens({ produtos, itens = [], comPreco = false, precoPadrao = 'custo', aoMudar }) {
  const lista = h('div', { class: 'itens' });
  const opcoes = produtos.map((p) => [p.id, `${p.codigo} — ${p.descricao}${p.estoque != null ? ` (estoque ${fmt.numero(p.estoque)})` : ''}`]);

  function linha(item = {}) {
    const sel = campo({ rotulo: 'Produto', nome: 'produto_id', tipo: 'select', opcoes, valor: item.produto_id });
    const qtd = campo({ rotulo: 'Quantidade', nome: 'quantidade', tipo: 'number', valor: item.quantidade ?? 1, attrs: { min: '0', step: 'any' } });
    const preco = comPreco ? campo({ rotulo: 'Preço unit. (R$)', nome: 'preco', tipo: 'moeda', valor: item.preco }) : null;
    const remover = h('button', { type: 'button', class: 'btn fantasma', 'aria-label': 'Remover item', onclick: () => { l.remove(); aoMudar?.(); } }, icone('lixo'));
    const l = h('div', { class: `item-linha ${comPreco ? '' : 'sem-preco'}` }, sel, qtd, preco, remover);
    sel.querySelector('select').addEventListener('change', (e) => {
      const p = produtos.find((x) => String(x.id) === e.target.value);
      if (p && preco) preco.querySelector('input').value = paraTextoMoeda(p[precoPadrao]);
      aoMudar?.();
    });
    l.addEventListener('input', () => aoMudar?.());
    lista.append(l);
  }
  (itens.length ? itens : [{}]).forEach(linha);

  const el = h('div', { class: 'pilha' }, lista,
    h('button', { type: 'button', class: 'btn pequeno', onclick: () => { linha(); aoMudar?.(); } }, icone('novo'), 'Adicionar item'));

  return {
    el,
    valor({ silencioso = false } = {}) {
      const saida = [];
      for (const l of lista.children) {
        const produto_id = Number(l.querySelector('[name=produto_id]').value);
        const quantidade = Number(l.querySelector('[name=quantidade]').value);
        if (!produto_id) { if (silencioso) continue; throw new Error('Escolha o produto de todos os itens.'); }
        if (!(quantidade > 0)) { if (silencioso) continue; throw new Error('Quantidade deve ser maior que zero.'); }
        const item = { produto_id, quantidade };
        if (comPreco) {
          const c = lerMoeda(l.querySelector('[name=preco]').value);
          if (Number.isNaN(c)) { if (silencioso) continue; throw new Error('Preço inválido.'); }
          if (c != null) item.preco = c;
        }
        saida.push(item);
      }
      if (!saida.length && !silencioso) throw new Error('Inclua ao menos um item.');
      return saida;
    },
  };
}
