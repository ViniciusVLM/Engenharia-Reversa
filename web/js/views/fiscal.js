import { get, post } from '../api.js';
import {
  h, limpar, fmt, icone, cabecalho, abas, tabela, etiqueta, campo, lerForm, editorItens, acao, confirmar, kpi, hojeIso,
} from '../ui.js';

const ABAS = [{ id: 'notas', rotulo: 'Notas fiscais' }, { id: 'apuracao', rotulo: 'Apuração de tributos' }];

export async function inicio(alvo, ctx) {
  const aba = ctx.query.aba ?? 'notas';
  alvo.append(
    cabecalho('Fiscal', {
      sub: 'Notas de entrada (vindas do recebimento de compras) e de saída (vendas), com ICMS, IPI, PIS e COFINS.',
      acoes: [h('a', { class: 'btn primario', href: '#/fiscal/notas/nova' }, icone('novo'), 'Emitir NF de venda')],
    }),
    h('div', { class: 'aviso-caixa', style: { marginBottom: '16px' } },
      'Emissão simulada: as notas e chaves de acesso são geradas localmente, sem transmissão à SEFAZ. O cálculo é simplificado (sem ST, DIFAL ou IBS/CBS).'),
    abas('#/fiscal', ABAS, aba),
  );
  return aba === 'apuracao' ? apuracao(alvo, ctx) : notas(alvo, ctx);
}

async function notas(alvo, { query }) {
  const tipo = query.tipo ?? '';
  const competencia = query.competencia ?? '';
  const lista = await get('/api/fiscal/notas', { tipo, competencia });
  const navegar = (m) => {
    const q = new URLSearchParams({ aba: 'notas', tipo, competencia, ...m });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    location.hash = `#/fiscal?${q}`;
  };
  const fTipo = campo({ rotulo: 'Tipo', nome: 'tipo', tipo: 'select', valor: tipo, vazioRotulo: 'Entradas e saídas', opcoes: [['entrada', 'Entradas'], ['saida', 'Saídas']] });
  fTipo.querySelector('select').addEventListener('change', (e) => navegar({ tipo: e.target.value }));
  const fComp = campo({ rotulo: 'Competência', nome: 'competencia', tipo: 'month', valor: competencia });
  fComp.querySelector('input').addEventListener('change', (e) => navegar({ competencia: e.target.value }));

  const validas = lista.filter((n) => n.status === 'emitida');
  const soma = (t) => validas.filter((n) => n.tipo === t).reduce((s, n) => s + n.valor_total, 0);
  alvo.append(
    h('div', { class: 'filtros' }, fTipo, fComp),
    h('div', { class: 'grade grade-2', style: { marginBottom: '16px' } },
      kpi({ rotulo: 'Total de saídas (vendas)', valor: fmt.moeda(soma('saida')) }),
      kpi({ rotulo: 'Total de entradas (compras)', valor: fmt.moeda(soma('entrada')) }),
    ),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      aoClicar: (n) => (location.hash = `#/fiscal/notas/${n.id}`),
      vazioTexto: 'Nenhuma nota no filtro.',
      colunas: [
        { titulo: 'Emissão', valor: (n) => fmt.data(n.emissao) },
        { titulo: 'Tipo', valor: (n) => etiqueta(n.tipo) },
        { titulo: 'Número', valor: (n) => h('span', { class: 'principal-txt' }, `${n.numero}/${n.serie}`) },
        { titulo: 'Parceiro', valor: (n) => n.parceiro_nome },
        { titulo: 'CFOP', valor: (n) => n.cfop },
        { titulo: 'ICMS', num: true, valor: (n) => fmt.moeda(n.valor_icms) },
        { titulo: 'Total', num: true, valor: (n) => fmt.moeda(n.valor_total) },
        { titulo: 'Situação', valor: (n) => etiqueta(n.status) },
      ],
    })),
  );
}

async function apuracao(alvo, { query, recarregar }) {
  const competencia = query.competencia ?? hojeIso().slice(0, 7);
  const a = await get('/api/fiscal/apuracao', { competencia });
  const fComp = campo({ rotulo: 'Competência', nome: 'competencia', tipo: 'month', valor: competencia });
  fComp.querySelector('input').addEventListener('change', (e) => e.target.value && (location.hash = `#/fiscal?aba=apuracao&competencia=${e.target.value}`));

  const encerrado = competencia < hojeIso().slice(0, 7);
  const gerar = h('button', { class: 'btn primario', disabled: !!a.gerada || !encerrado }, a.gerada ? 'Guias já geradas' : 'Fechar apuração e gerar guias');
  gerar.onclick = async () => {
    if (!(await confirmar(`Fechar a apuração de ${fmt.competencia(competencia)}? Serão lançadas ${fmt.moeda(a.totalRecolher)} em guias a pagar no Financeiro e as notas do mês não poderão mais ser canceladas.`))) return;
    if (await acao(gerar, () => post(`/api/fiscal/apuracao/${competencia}/gerar`), 'Apuração fechada e guias lançadas.')) recarregar();
  };

  alvo.append(
    h('div', { class: 'filtros' }, fComp, h('div', { style: { marginLeft: 'auto', alignSelf: 'end' } }, gerar)),
    !encerrado && !a.gerada ? h('p', { class: 'fraco', style: { marginBottom: '12px' } }, 'A apuração só pode ser fechada depois que o mês terminar. Até lá, os valores abaixo são uma prévia.') : null,
    a.gerada ? h('div', { class: 'aviso-caixa', style: { marginBottom: '12px' } }, `Apuração fechada em ${fmt.dataHora(a.gerada)}. As guias estão em Financeiro → Contas a pagar.`) : null,
    h('div', { class: 'grade grade-3', style: { marginBottom: '16px' } },
      kpi({ rotulo: 'Faturamento (saídas)', valor: fmt.moeda(a.faturamento), detalhe: `${a.notasSaida} nota(s)` }),
      kpi({ rotulo: 'Compras (entradas)', valor: fmt.moeda(a.compras), detalhe: `${a.notasEntrada} nota(s)` }),
      kpi({ rotulo: 'Total a recolher', valor: fmt.moeda(a.totalRecolher) }),
    ),
    h('div', { class: 'cartao' }, tabela({
      linhas: a.tributos,
      rodape: ['Total', fmt.moeda(a.tributos.reduce((s, t) => s + t.debitos, 0)), fmt.moeda(a.tributos.reduce((s, t) => s + t.creditos, 0)), '', fmt.moeda(a.totalRecolher), ''],
      colunas: [
        { titulo: 'Tributo', valor: (t) => h('b', null, t.tributo.toUpperCase()) },
        { titulo: 'Débitos (saídas)', num: true, valor: (t) => fmt.moeda(t.debitos) },
        { titulo: 'Créditos (entradas)', num: true, valor: (t) => fmt.moeda(t.creditos) },
        { titulo: 'Crédito do mês anterior', num: true, valor: (t) => fmt.moeda(t.credorAnterior) },
        { titulo: 'A recolher', num: true, valor: (t) => h('b', null, fmt.moeda(t.aRecolher)) },
        { titulo: 'Crédito a transportar', num: true, valor: (t) => (t.credorTransportar ? h('span', { class: 'ok-txt' }, fmt.moeda(t.credorTransportar)) : '—') },
      ],
    })),
  );
}

export async function novaNota(alvo) {
  const [clientes, produtos] = await Promise.all([get('/api/parceiros', { tipo: 'cliente' }), get('/api/produtos')]);
  const previa = h('div');
  let espera;
  const atualizarPrevia = () => {
    clearTimeout(espera);
    espera = setTimeout(async () => {
      const cliente = form.querySelector('[name=parceiro_id]').value;
      const lista = itens.valor({ silencioso: true });
      if (!cliente || !lista.length) return limpar(previa, h('p', { class: 'fraco' }, 'Escolha o cliente e os itens para ver os impostos.'));
      try {
        const s = await post('/api/fiscal/notas/simular', {
          tipo: 'saida', parceiro_id: cliente, itens: lista.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.preco })),
        });
        const t = s.totais;
        limpar(previa,
          h('div', { class: 'fraco', style: { marginBottom: '8px' } }, `CFOP ${s.cfop} · ${s.natureza}${s.interestadual ? ` · interestadual (${s.parceiro.uf}) — ICMS 12%` : ''}`),
          h('ul', { class: 'lista-simples', style: { margin: '0 -18px' } },
            [['Produtos', t.valorProdutos], ['ICMS', t.valorIcms], ['IPI', t.valorIpi], ['PIS', t.valorPis], ['COFINS', t.valorCofins]]
              .map(([r, v]) => h('li', null, h('span', { class: 'mudo' }, r), h('span', { class: 'num' }, fmt.moeda(v)))),
            h('li', null, h('b', null, 'Total da nota'), h('b', { class: 'num' }, fmt.moeda(t.valorTotal))),
          ));
      } catch (e) {
        limpar(previa, h('p', { class: 'erro-txt' }, e.message));
      }
    }, 250);
  };

  const itens = editorItens({ produtos, comPreco: true, precoPadrao: 'preco', aoMudar: atualizarPrevia });
  const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault(), onchange: atualizarPrevia },
    campo({ rotulo: 'Cliente', nome: 'parceiro_id', tipo: 'select', obrigatorio: true, opcoes: clientes.map((c) => [c.id, `${c.nome} (${c.uf})`]) }),
    campo({ rotulo: 'Condição de pagamento (dias)', nome: 'condicao', valor: '30', ajuda: 'Ex.: 0 (à vista), 30/60' }),
    campo({ rotulo: 'Emissão', nome: 'emissao', tipo: 'date', valor: hojeIso() }),
  );
  const emitir = h('button', { class: 'btn primario', type: 'button' }, 'Emitir nota');
  emitir.onclick = async () => {
    const n = await acao(emitir, () => post('/api/fiscal/notas/saida', {
      ...lerForm(form),
      itens: itens.valor().map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.preco })),
    }), 'Nota emitida. Estoque baixado e contas a receber lançadas.');
    if (n) location.hash = `#/fiscal/notas/${n.id}`;
  };

  alvo.append(
    cabecalho('Emitir NF de venda', { trilha: [{ rotulo: 'Fiscal', href: '#/fiscal' }] }),
    h('div', { class: 'grade grade-lado' },
      h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' }, form, h('h3', null, 'Itens'), itens.el)),
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Prévia dos tributos')),
        h('div', { class: 'cartao-corpo pilha' }, previa, h('div', { class: 'form-acoes' }, h('a', { class: 'btn', href: '#/fiscal' }, 'Cancelar'), emitir))),
    ),
  );
  atualizarPrevia();
}

export async function nota(alvo, { params, recarregar }) {
  const n = await get(`/api/fiscal/notas/${params[0]}`);
  const acoes = [];
  if (n.tipo === 'saida' && n.status === 'emitida') {
    const cancelar = h('button', { class: 'btn perigo' }, 'Cancelar nota');
    cancelar.onclick = async () => {
      if (!(await confirmar('Cancelar a nota? O estoque volta e as contas a receber em aberto são canceladas.', { perigo: true, rotulo: 'Cancelar nota' }))) return;
      if (await acao(cancelar, () => post(`/api/fiscal/notas/${n.id}/cancelar`), 'Nota cancelada.')) recarregar();
    };
    acoes.push(cancelar);
  }
  const chave = n.chave.replace(/(\d{4})/g, '$1 ').trim();
  alvo.append(
    cabecalho(`NF ${n.numero}/${n.serie} — ${n.tipo === 'entrada' ? 'entrada' : 'saída'}`, { trilha: [{ rotulo: 'Fiscal', href: '#/fiscal' }], acoes }),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' },
      h('dl', { class: 'dl' },
        h('div', null, h('dt', null, 'Situação'), h('dd', null, etiqueta(n.status))),
        h('div', null, h('dt', null, n.tipo === 'entrada' ? 'Emitente (fornecedor)' : 'Destinatário (cliente)'), h('dd', null, `${n.parceiro_nome} — ${n.parceiro_uf}`)),
        h('div', null, h('dt', null, 'CNPJ'), h('dd', null, n.parceiro_documento ?? '—')),
        h('div', null, h('dt', null, 'Emissão'), h('dd', null, fmt.data(n.emissao))),
        h('div', null, h('dt', null, 'CFOP / natureza'), h('dd', null, `${n.cfop} — ${n.natureza}`)),
        h('div', null, h('dt', null, 'Condição'), h('dd', null, `${n.condicao} dias`)),
        n.pedido_id ? h('div', null, h('dt', null, 'Pedido de compra'), h('dd', null, h('a', { href: `#/compras/pedidos/${n.pedido_id}` }, n.pedido_numero))) : null,
      ),
      h('div', null, h('div', { class: 'fraco' }, 'Chave de acesso (simulada)'), h('code', { style: { fontSize: '13px', wordBreak: 'break-all' } }, chave)),
    )),
    h('div', { class: 'cartao', style: { marginTop: '16px' } },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Itens e tributos')),
      tabela({
        linhas: n.itens,
        colunas: [
          { titulo: 'Produto', valor: (i) => h('div', null, h('div', { class: 'principal-txt' }, i.descricao), h('div', { class: 'fraco' }, `${i.codigo} · NCM ${i.ncm ?? '—'}`)) },
          { titulo: 'Qtd.', num: true, valor: (i) => `${fmt.numero(i.quantidade)} ${i.unidade}` },
          { titulo: 'Unitário', num: true, valor: (i) => fmt.moeda(i.valor_unitario) },
          { titulo: 'Total', num: true, valor: (i) => fmt.moeda(i.valor_total) },
          { titulo: 'ICMS', num: true, valor: (i) => `${fmt.moeda(i.valor_icms)} (${fmt.pct(i.aliq_icms)})` },
          { titulo: 'IPI', num: true, valor: (i) => `${fmt.moeda(i.valor_ipi)} (${fmt.pct(i.aliq_ipi)})` },
          { titulo: 'PIS', num: true, valor: (i) => fmt.moeda(i.valor_pis) },
          { titulo: 'COFINS', num: true, valor: (i) => fmt.moeda(i.valor_cofins) },
        ],
      }),
      h('div', { class: 'cartao-corpo' }, h('div', { class: 'grade grade-3' },
        ...[['Produtos', n.valor_produtos], ['ICMS', n.valor_icms], ['IPI', n.valor_ipi], ['PIS', n.valor_pis], ['COFINS', n.valor_cofins], ['Total da nota', n.valor_total]]
          .map(([r, v]) => h('div', null, h('div', { class: 'fraco' }, r), h('b', { style: { fontSize: r === 'Total da nota' ? '20px' : '15px' } }, fmt.moeda(v)))))),
    ),
    h('div', { class: 'cartao', style: { marginTop: '16px' } },
      h('div', { class: 'cartao-topo' }, h('h2', null, n.tipo === 'entrada' ? 'Contas a pagar geradas' : 'Contas a receber geradas'),
        h('a', { href: `#/financeiro?aba=${n.tipo === 'entrada' ? 'pagar' : 'receber'}&status=todos` }, 'Abrir no Financeiro')),
      tabela({
        linhas: n.titulos,
        colunas: [
          { titulo: 'Parcela', valor: (t) => t.parcela },
          { titulo: 'Vencimento', valor: (t) => fmt.data(t.vencimento) },
          { titulo: 'Valor', num: true, valor: (t) => fmt.moeda(t.valor) },
          { titulo: 'Situação', valor: (t) => etiqueta(t.status) },
        ],
      })),
  );
}
