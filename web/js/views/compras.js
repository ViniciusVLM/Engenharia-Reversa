import { get, post } from '../api.js';
import {
  h, fmt, icone, cabecalho, abas, tabela, etiqueta, campo, lerForm, editorItens, acao, toast, modal, formularioModal, hojeIso,
} from '../ui.js';

const ABAS = [{ id: 'solicitacoes', rotulo: 'Solicitações' }, { id: 'pedidos', rotulo: 'Pedidos de compra' }];

export async function inicio(alvo, { query }) {
  const aba = query.aba ?? 'solicitacoes';
  const status = query.status ?? '';
  const filtro = (opcoes) => {
    const sel = campo({ rotulo: 'Status', nome: 'status', tipo: 'select', valor: status, vazioRotulo: 'Todos os status', opcoes });
    sel.querySelector('select').addEventListener('change', (e) => { location.hash = `#/compras?aba=${aba}${e.target.value ? `&status=${e.target.value}` : ''}`; });
    return h('div', { class: 'filtros' }, sel);
  };

  let conteudo;
  if (aba === 'pedidos') {
    const pedidos = await get('/api/compras/pedidos', { status });
    conteudo = [
      filtro([['aberto', 'Aberto'], ['enviado', 'Enviado'], ['recebido', 'Recebido'], ['cancelado', 'Cancelado']]),
      h('div', { class: 'cartao' }, tabela({
        linhas: pedidos,
        aoClicar: (p) => (location.hash = `#/compras/pedidos/${p.id}`),
        vazioTexto: 'Nenhum pedido de compra.',
        colunas: [
          { titulo: 'Número', valor: (p) => h('span', { class: 'principal-txt' }, p.numero) },
          { titulo: 'Fornecedor', valor: (p) => p.fornecedor_nome },
          { titulo: 'Condição', valor: (p) => `${p.condicao} dias` },
          { titulo: 'Previsão', valor: (p) => h('span', { class: p.previsao < hojeIso() && ['aberto', 'enviado'].includes(p.status) ? 'erro-txt' : '' }, fmt.data(p.previsao)) },
          { titulo: 'Total', num: true, valor: (p) => fmt.moeda(p.total) },
          { titulo: 'Status', valor: (p) => etiqueta(p.status) },
        ],
      })),
    ];
  } else {
    const solicitacoes = await get('/api/compras/solicitacoes', { status });
    conteudo = [
      filtro([['pendente', 'Pendente'], ['aprovada', 'Aprovada'], ['reprovada', 'Reprovada'], ['atendida', 'Atendida']]),
      h('div', { class: 'cartao' }, tabela({
        linhas: solicitacoes,
        aoClicar: (s) => (location.hash = `#/compras/solicitacoes/${s.id}`),
        vazioTexto: 'Nenhuma solicitação.',
        colunas: [
          { titulo: 'Número', valor: (s) => h('span', { class: 'principal-txt' }, s.numero) },
          { titulo: 'Solicitante', valor: (s) => s.solicitante },
          { titulo: 'Departamento', valor: (s) => s.departamento_nome ?? '—' },
          { titulo: 'Itens', num: true, valor: (s) => s.itens },
          { titulo: 'Estimado', num: true, valor: (s) => fmt.moeda(s.estimado) },
          { titulo: 'Data', valor: (s) => fmt.data(s.criado_em) },
          { titulo: 'Status', valor: (s) => [etiqueta(s.status), s.origem_card_id ? h('span', { class: 'fraco', title: 'Criada por automação de processo' }, ' ⚡') : null] },
        ],
      })),
    ];
  }

  alvo.append(
    cabecalho('Compras', {
      sub: 'Solicitação → aprovação → pedido → recebimento. O recebimento gera a NF de entrada, o estoque e as contas a pagar.',
      acoes: [
        h('a', { class: 'btn', href: '#/compras/pedidos/novo' }, 'Pedido direto'),
        h('a', { class: 'btn primario', href: '#/compras/solicitacoes/nova' }, icone('novo'), 'Nova solicitação'),
      ],
    }),
    abas('#/compras', ABAS, aba),
    conteudo,
  );
}

export async function novaSolicitacao(alvo) {
  const [produtos, departamentos] = await Promise.all([get('/api/produtos'), get('/api/departamentos')]);
  const itens = editorItens({ produtos });
  const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() },
    campo({ rotulo: 'Solicitante', nome: 'solicitante', ajuda: 'Em branco = seu usuário' }),
    campo({ rotulo: 'Departamento', nome: 'departamento_id', tipo: 'select', opcoes: departamentos.map((d) => [d.id, d.nome]) }),
    campo({ rotulo: 'Justificativa', nome: 'justificativa', tipo: 'textarea', largo: true }),
  );
  const enviar = h('button', { class: 'btn primario', type: 'button' }, 'Enviar para aprovação');
  enviar.onclick = async () => {
    const s = await acao(enviar, () => post('/api/compras/solicitacoes', { ...lerForm(form), itens: itens.valor() }), 'Solicitação criada.');
    if (s) location.hash = `#/compras/solicitacoes/${s.id}`;
  };
  alvo.append(
    cabecalho('Nova solicitação de compra', { trilha: [{ rotulo: 'Compras', href: '#/compras' }] }),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' }, form, h('h3', null, 'Itens'), itens.el,
      h('div', { class: 'form-acoes' }, h('a', { class: 'btn', href: '#/compras' }, 'Cancelar'), enviar))),
  );
}

export async function solicitacao(alvo, { params, recarregar }) {
  const s = await get(`/api/compras/solicitacoes/${params[0]}`);
  const acoes = [];
  if (s.status === 'pendente') {
    const aprovar = h('button', { class: 'btn primario' }, 'Aprovar');
    aprovar.onclick = async () => (await acao(aprovar, () => post(`/api/compras/solicitacoes/${s.id}/aprovar`), 'Solicitação aprovada.')) && recarregar();
    acoes.push(
      h('button', { class: 'btn perigo', onclick: () => formularioModal({
        titulo: 'Reprovar solicitação',
        campos: [campo({ rotulo: 'Motivo', nome: 'motivo', tipo: 'textarea', obrigatorio: true, largo: true })],
        rotulo: 'Reprovar',
        enviar: async (v) => { await post(`/api/compras/solicitacoes/${s.id}/reprovar`, v); toast('Solicitação reprovada.'); recarregar(); },
      }) }, 'Reprovar'),
      aprovar,
    );
  }
  if (s.status === 'aprovada') acoes.push(h('button', { class: 'btn primario', onclick: () => gerarPedido(s, recarregar) }, 'Gerar pedido de compra'));
  if (s.pedido) acoes.push(h('a', { class: 'btn', href: `#/compras/pedidos/${s.pedido.id}` }, `Ver pedido ${s.pedido.numero}`));

  alvo.append(
    cabecalho(`Solicitação ${s.numero}`, { trilha: [{ rotulo: 'Compras', href: '#/compras' }], acoes }),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' },
      h('dl', { class: 'dl' },
        h('div', null, h('dt', null, 'Status'), h('dd', null, etiqueta(s.status))),
        h('div', null, h('dt', null, 'Solicitante'), h('dd', null, s.solicitante)),
        h('div', null, h('dt', null, 'Departamento'), h('dd', null, s.departamento_nome ?? '—')),
        h('div', null, h('dt', null, 'Criada em'), h('dd', null, fmt.dataHora(s.criado_em))),
        h('div', null, h('dt', null, 'Valor estimado'), h('dd', null, fmt.moeda(s.estimado))),
        s.decidido_em ? h('div', null, h('dt', null, s.status === 'reprovada' ? 'Reprovada por' : 'Aprovada por'), h('dd', null, `${s.decidido_por} · ${fmt.dataHora(s.decidido_em)}`)) : null,
        s.origem_card_id ? h('div', null, h('dt', null, 'Origem'), h('dd', null, '⚡ Automação de processo')) : null,
      ),
      s.justificativa ? h('div', null, h('div', { class: 'fraco' }, 'Justificativa'), h('p', null, s.justificativa)) : null,
      s.motivo ? h('div', { class: 'aviso-caixa erro' }, h('b', null, 'Motivo da reprovação: '), s.motivo) : null,
    )),
    h('div', { class: 'cartao', style: { marginTop: '16px' } },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Itens')),
      tabela({
        linhas: s.itens,
        colunas: [
          { titulo: 'Código', valor: (i) => i.codigo },
          { titulo: 'Produto', valor: (i) => i.descricao },
          { titulo: 'Qtd.', num: true, valor: (i) => `${fmt.numero(i.quantidade)} ${i.unidade}` },
          { titulo: 'Custo ref.', num: true, valor: (i) => fmt.moeda(i.custo) },
          { titulo: 'Estimado', num: true, valor: (i) => fmt.moeda(Math.round(i.quantidade * i.custo)) },
        ],
      })),
  );
}

async function gerarPedido(s, recarregar) {
  const [fornecedores, produtos] = await Promise.all([get('/api/parceiros', { tipo: 'fornecedor' }), get('/api/produtos')]);
  const itens = editorItens({ produtos, comPreco: true, itens: s.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco: i.custo })) });
  const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() },
    campo({ rotulo: 'Fornecedor', nome: 'fornecedor_id', tipo: 'select', obrigatorio: true, opcoes: fornecedores.map((f) => [f.id, `${f.nome} (${f.uf})`]) }),
    campo({ rotulo: 'Condição de pagamento (dias)', nome: 'condicao', valor: '30', ajuda: 'Ex.: 30, 30/60, 0/30/60' }),
    campo({ rotulo: 'Previsão de entrega', nome: 'previsao', tipo: 'date' }),
  );
  modal({
    titulo: `Pedido a partir de ${s.numero}`, largo: true,
    corpo: h('div', { class: 'pilha' }, form, h('h3', null, 'Itens e preços negociados'), itens.el),
    acoes: [{ rotulo: 'Cancelar' }, {
      rotulo: 'Criar pedido', classe: 'primario',
      executar: async () => {
        const p = await post(`/api/compras/solicitacoes/${s.id}/pedido`, { ...lerForm(form), itens: itens.valor() });
        toast(`Pedido ${p.numero} criado.`);
        location.hash = `#/compras/pedidos/${p.id}`;
      },
    }],
  });
}

export async function novoPedido(alvo) {
  const [fornecedores, produtos] = await Promise.all([get('/api/parceiros', { tipo: 'fornecedor' }), get('/api/produtos')]);
  const itens = editorItens({ produtos, comPreco: true });
  const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() },
    campo({ rotulo: 'Fornecedor', nome: 'fornecedor_id', tipo: 'select', obrigatorio: true, opcoes: fornecedores.map((f) => [f.id, `${f.nome} (${f.uf})`]) }),
    campo({ rotulo: 'Condição de pagamento (dias)', nome: 'condicao', valor: '30', ajuda: 'Ex.: 30, 30/60, 0/30/60' }),
    campo({ rotulo: 'Previsão de entrega', nome: 'previsao', tipo: 'date' }),
  );
  const criar = h('button', { class: 'btn primario', type: 'button' }, 'Criar pedido');
  criar.onclick = async () => {
    const p = await acao(criar, () => post('/api/compras/pedidos', { ...lerForm(form), itens: itens.valor() }), 'Pedido criado.');
    if (p) location.hash = `#/compras/pedidos/${p.id}`;
  };
  alvo.append(
    cabecalho('Pedido de compra direto', { trilha: [{ rotulo: 'Compras', href: '#/compras?aba=pedidos' }], sub: 'Sem solicitação prévia — use para compras recorrentes.' }),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' }, form, h('h3', null, 'Itens'), itens.el,
      h('div', { class: 'form-acoes' }, h('a', { class: 'btn', href: '#/compras?aba=pedidos' }, 'Cancelar'), criar))),
  );
}

export async function pedido(alvo, { params, recarregar }) {
  const p = await get(`/api/compras/pedidos/${params[0]}`);
  const acoes = [];
  if (['aberto', 'enviado'].includes(p.status)) {
    const cancelar = h('button', { class: 'btn perigo' }, 'Cancelar pedido');
    cancelar.onclick = async () => (await acao(cancelar, () => post(`/api/compras/pedidos/${p.id}/cancelar`), 'Pedido cancelado.')) && recarregar();
    acoes.push(cancelar);
  }
  if (p.status === 'aberto') {
    const enviar = h('button', { class: 'btn' }, 'Marcar como enviado');
    enviar.onclick = async () => (await acao(enviar, () => post(`/api/compras/pedidos/${p.id}/enviar`), 'Pedido enviado ao fornecedor.')) && recarregar();
    acoes.push(enviar);
  }
  if (['aberto', 'enviado'].includes(p.status)) {
    acoes.push(h('button', { class: 'btn primario', onclick: () => formularioModal({
      titulo: 'Registrar recebimento',
      campos: [
        h('div', { class: 'aviso-caixa campo largo' }, 'Ao confirmar: a NF de entrada é registrada no Fiscal, o estoque recebe os itens e as parcelas entram em Contas a pagar.'),
        campo({ rotulo: 'Número da NF do fornecedor', nome: 'numero_nf', tipo: 'number', ajuda: 'Em branco = numeração interna' }),
        campo({ rotulo: 'Data de emissão', nome: 'emissao', tipo: 'date', valor: hojeIso() }),
      ],
      rotulo: 'Confirmar recebimento',
      enviar: async (v) => { await post(`/api/compras/pedidos/${p.id}/receber`, v); toast('Recebido! NF, estoque e contas a pagar atualizados.'); recarregar(); },
    }) }, 'Registrar recebimento'));
  }

  alvo.append(
    cabecalho(`Pedido ${p.numero}`, { trilha: [{ rotulo: 'Compras', href: '#/compras?aba=pedidos' }], acoes }),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, h('dl', { class: 'dl' },
      h('div', null, h('dt', null, 'Status'), h('dd', null, etiqueta(p.status))),
      h('div', null, h('dt', null, 'Fornecedor'), h('dd', null, `${p.fornecedor_nome} (${p.fornecedor_uf})`)),
      h('div', null, h('dt', null, 'Condição'), h('dd', null, `${p.condicao} dias`)),
      h('div', null, h('dt', null, 'Previsão de entrega'), h('dd', null, fmt.data(p.previsao))),
      h('div', null, h('dt', null, 'Total'), h('dd', null, fmt.moeda(p.total))),
      p.solicitacao_id ? h('div', null, h('dt', null, 'Solicitação'), h('dd', null, h('a', { href: `#/compras/solicitacoes/${p.solicitacao_id}` }, p.solicitacao_numero))) : null,
      p.nota_id ? h('div', null, h('dt', null, 'NF de entrada'), h('dd', null, h('a', { href: `#/fiscal/notas/${p.nota_id}` }, `NF ${p.nota_numero}`))) : null,
      p.recebido_em ? h('div', null, h('dt', null, 'Recebido em'), h('dd', null, fmt.data(p.recebido_em))) : null,
    ))),
    h('div', { class: 'cartao', style: { marginTop: '16px' } },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Itens')),
      tabela({
        linhas: p.itens,
        rodape: ['', 'Total', '', '', fmt.moeda(p.total)],
        colunas: [
          { titulo: 'Código', valor: (i) => i.codigo },
          { titulo: 'Produto', valor: (i) => i.descricao },
          { titulo: 'Qtd.', num: true, valor: (i) => `${fmt.numero(i.quantidade)} ${i.unidade}` },
          { titulo: 'Preço unit.', num: true, valor: (i) => fmt.moeda(i.preco) },
          { titulo: 'Subtotal', num: true, valor: (i) => fmt.moeda(Math.round(i.quantidade * i.preco)) },
        ],
      })),
  );
}
