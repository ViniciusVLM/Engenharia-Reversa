import { get, post } from '../api.js';
import {
  h, fmt, icone, cabecalho, abas, tabela, etiqueta, campo, kpi, acao, toast, formularioModal, confirmar, hojeIso,
} from '../ui.js';
import { graficoSaldo } from '../grafico.js';

const ABAS = [
  { id: 'pagar', rotulo: 'Contas a pagar' },
  { id: 'receber', rotulo: 'Contas a receber' },
  { id: 'fluxo', rotulo: 'Fluxo de caixa' },
  { id: 'contas', rotulo: 'Contas bancárias' },
];
const CATEGORIAS = [['compras', 'Compras'], ['vendas', 'Vendas'], ['folha', 'Folha'], ['impostos', 'Impostos'], ['servicos', 'Serviços'], ['aluguel', 'Aluguel'], ['outros', 'Outros']];
const ROTULO_CAT = Object.fromEntries(CATEGORIAS);

export async function inicio(alvo, ctx) {
  const aba = ctx.query.aba ?? 'pagar';
  const resumo = await get('/api/financeiro/resumo');
  alvo.append(
    cabecalho('Financeiro', {
      sub: 'Títulos gerados por notas, folha e apuração aparecem aqui automaticamente.',
      acoes: aba === 'pagar' || aba === 'receber'
        ? [h('button', { class: 'btn primario', onclick: () => novoTitulo(aba, ctx.recarregar) }, icone('novo'), aba === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber')]
        : null,
    }),
    h('div', { class: 'grade grade-4', style: { marginBottom: '16px' } },
      kpi({ rotulo: 'Saldo em contas', valor: fmt.moeda(resumo.saldo) }),
      kpi({ rotulo: 'A receber em 30 dias', valor: fmt.moeda(resumo.receber30), detalhe: resumo.receberVencido ? `+ ${fmt.moeda(resumo.receberVencido)} em atraso` : null }),
      kpi({ rotulo: 'A pagar em 30 dias', valor: fmt.moeda(resumo.pagar30) }),
      kpi({ rotulo: 'Pagamentos vencidos', valor: fmt.moeda(resumo.pagarVencido), alerta: resumo.pagarVencido > 0 }),
    ),
    abas('#/financeiro', ABAS, aba),
  );
  if (aba === 'fluxo') return fluxo(alvo);
  if (aba === 'contas') return contas(alvo, ctx);
  return titulos(alvo, aba, ctx);
}

async function titulos(alvo, tipo, { query, recarregar }) {
  const status = query.status ?? 'aberto';
  const busca = query.busca ?? '';
  const [lista, contasBancarias] = await Promise.all([
    get('/api/financeiro/titulos', { tipo, status: status === 'todos' ? '' : status, busca }),
    get('/api/financeiro/contas'),
  ]);

  const navegar = (mudanca) => {
    const q = new URLSearchParams({ aba: tipo, status, busca, ...mudanca });
    if (!q.get('busca')) q.delete('busca');
    location.hash = `#/financeiro?${q}`;
  };
  const filtroStatus = campo({ rotulo: 'Situação', nome: 'status', tipo: 'select', valor: status, vazioRotulo: null,
    opcoes: [['aberto', 'Em aberto'], ['vencido', 'Vencidos'], ['pago', tipo === 'pagar' ? 'Pagos' : 'Recebidos'], ['cancelado', 'Cancelados'], ['todos', 'Todos']] });
  filtroStatus.querySelector('select').addEventListener('change', (e) => navegar({ status: e.target.value }));
  const campoBusca = h('input', { class: 'entrada', type: 'search', placeholder: 'Descrição ou parceiro', value: busca, 'aria-label': 'Buscar' });
  campoBusca.addEventListener('change', () => navegar({ busca: campoBusca.value.trim() }));

  const baixar = (t) => formularioModal({
    titulo: tipo === 'pagar' ? 'Registrar pagamento' : 'Registrar recebimento',
    campos: [
      h('p', { class: 'campo largo' }, h('b', null, t.descricao), ` · parcela ${t.parcela} · vence ${fmt.data(t.vencimento)}`),
      campo({ rotulo: 'Conta', nome: 'conta_id', tipo: 'select', obrigatorio: true, valor: contasBancarias[0]?.id, opcoes: contasBancarias.map((c) => [c.id, `${c.nome} (${fmt.moeda(c.saldo)})`]) }),
      campo({ rotulo: 'Data', nome: 'data', tipo: 'date', valor: hojeIso(), obrigatorio: true }),
      campo({ rotulo: 'Valor (R$)', nome: 'valor', tipo: 'moeda', valor: t.valor, ajuda: 'Altere se houve juros ou desconto.' }),
    ],
    rotulo: 'Confirmar baixa',
    enviar: async (v) => { await post(`/api/financeiro/titulos/${t.id}/baixar`, v); toast('Baixa registrada.'); recarregar(); },
  });
  const estornar = async (t, botao) => {
    if (!(await confirmar(`Estornar a baixa de "${t.descricao}"? O movimento bancário será removido.`))) return;
    if (await acao(botao, () => post(`/api/financeiro/titulos/${t.id}/estornar`), 'Baixa estornada.')) recarregar();
  };
  const cancelar = async (t, botao) => {
    if (!(await confirmar(`Cancelar o título "${t.descricao}"?`, { perigo: true, rotulo: 'Cancelar título' }))) return;
    if (await acao(botao, () => post(`/api/financeiro/titulos/${t.id}/cancelar`), 'Título cancelado.')) recarregar();
  };

  const total = lista.filter((t) => t.status !== 'cancelado').reduce((s, t) => s + (t.status === 'pago' ? t.valor_pago : t.valor), 0);
  const origemLink = (t) => {
    if (t.origem === 'nota') return h('a', { href: `#/fiscal/notas/${t.origem_id}` }, 'Nota fiscal');
    if (t.origem === 'folha') return h('a', { href: '#/rh?aba=folha' }, 'Folha');
    if (t.origem === 'apuracao') return h('a', { href: '#/fiscal?aba=apuracao' }, 'Apuração');
    if (t.origem === 'card') return h('span', null, '⚡ Processo');
    return h('span', { class: 'fraco' }, 'Manual');
  };

  alvo.append(
    h('div', { class: 'filtros' }, filtroStatus, h('label', { class: 'campo busca' }, h('span', null, 'Buscar'), campoBusca)),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      vazioTexto: 'Nenhum título nesta situação.',
      rodape: ['Total', '', '', '', '', fmt.moeda(total), '', ''],
      colunas: [
        { titulo: 'Vencimento', valor: (t) => h('span', { class: t.vencido ? 'erro-txt' : '' }, fmt.data(t.vencimento)) },
        { titulo: 'Descrição', valor: (t) => h('div', null, h('div', { class: 'principal-txt' }, t.descricao), t.parceiro_nome ? h('div', { class: 'fraco' }, t.parceiro_nome) : null) },
        { titulo: 'Categoria', valor: (t) => ROTULO_CAT[t.categoria] ?? t.categoria },
        { titulo: 'Origem', valor: origemLink },
        { titulo: 'Parcela', valor: (t) => t.parcela },
        { titulo: 'Valor', num: true, valor: (t) => fmt.moeda(t.status === 'pago' ? t.valor_pago : t.valor) },
        { titulo: 'Situação', valor: (t) => t.vencido ? etiqueta('vencido') : t.status === 'pago' ? etiqueta('pago', `${tipo === 'pagar' ? 'Pago' : 'Recebido'} ${fmt.data(t.pago_em)}`) : etiqueta(t.status) },
        { titulo: '', valor: (t) => {
          const caixa = h('div', { class: 'acoes-linha' });
          if (t.status === 'aberto') {
            caixa.append(h('button', { class: 'btn pequeno primario', onclick: () => baixar(t) }, tipo === 'pagar' ? 'Pagar' : 'Receber'));
            if (t.origem === 'manual') { const b = h('button', { class: 'btn pequeno fantasma' }, 'Cancelar'); b.onclick = () => cancelar(t, b); caixa.append(b); }
          }
          if (t.status === 'pago') { const b = h('button', { class: 'btn pequeno' }, 'Estornar'); b.onclick = () => estornar(t, b); caixa.append(b); }
          return caixa;
        } },
      ],
    })),
  );
}

function novoTitulo(tipo, recarregar) {
  get('/api/parceiros', { tipo: tipo === 'pagar' ? 'fornecedor' : 'cliente' }).then((parceiros) => formularioModal({
    titulo: tipo === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber',
    campos: [
      campo({ rotulo: 'Descrição', nome: 'descricao', obrigatorio: true, largo: true }),
      campo({ rotulo: 'Valor (R$)', nome: 'valor', tipo: 'moeda', obrigatorio: true }),
      campo({ rotulo: 'Vencimento', nome: 'vencimento', tipo: 'date', obrigatorio: true, valor: hojeIso() }),
      campo({ rotulo: 'Categoria', nome: 'categoria', tipo: 'select', opcoes: CATEGORIAS, valor: 'outros', vazioRotulo: null }),
      campo({ rotulo: tipo === 'pagar' ? 'Fornecedor' : 'Cliente', nome: 'parceiro_id', tipo: 'select', opcoes: parceiros.map((p) => [p.id, p.nome]), vazioRotulo: 'Nenhum' }),
      campo({ rotulo: 'Parcelas mensais', nome: 'parcelas', tipo: 'number', valor: 1, attrs: { min: '1', max: '48' }, ajuda: 'Divide o valor em parcelas a cada 30 dias.' }),
    ],
    rotulo: 'Lançar',
    enviar: async (v) => { await post('/api/financeiro/titulos', { ...v, tipo }); toast('Título lançado.'); recarregar(); },
  }));
}

async function fluxo(alvo) {
  const f = await get('/api/financeiro/fluxo', { dias: 60 });
  const comMovimento = f.serie.filter((d) => d.entradas || d.saidas);
  alvo.append(
    f.atrasados.pagar || f.atrasados.receber
      ? h('div', { class: 'aviso-caixa atencao', style: { marginBottom: '16px' } },
          `Fora da projeção: ${fmt.moeda(f.atrasados.receber)} a receber em atraso e ${fmt.moeda(f.atrasados.pagar)} a pagar vencidos.`)
      : null,
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Saldo projetado — próximos 60 dias'),
        h('span', { class: 'mudo' }, `${fmt.moeda(f.saldoInicial)} hoje → ${fmt.moeda(f.saldoFinal)}`)),
      h('div', { class: 'cartao-corpo' }, graficoSaldo(f.serie, { altura: 240 }))),
    h('div', { class: 'cartao', style: { marginTop: '16px' } },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Dias com movimento previsto')),
      tabela({
        linhas: comMovimento,
        vazioTexto: 'Nenhum título em aberto no período.',
        colunas: [
          { titulo: 'Data', valor: (d) => fmt.data(d.data) },
          { titulo: 'Entradas', num: true, valor: (d) => (d.entradas ? h('span', { class: 'ok-txt' }, fmt.moeda(d.entradas)) : '—') },
          { titulo: 'Saídas', num: true, valor: (d) => (d.saidas ? h('span', { class: 'erro-txt' }, fmt.moeda(-d.saidas)) : '—') },
          { titulo: 'Saldo projetado', num: true, valor: (d) => h('b', { class: d.saldo < 0 ? 'erro-txt' : '' }, fmt.moeda(d.saldo)) },
        ],
      })),
  );
}

async function contas(alvo, { recarregar }) {
  const lista = await get('/api/financeiro/contas');
  const nova = () => formularioModal({
    titulo: 'Nova conta bancária',
    campos: [
      campo({ rotulo: 'Nome', nome: 'nome', obrigatorio: true }),
      campo({ rotulo: 'Banco', nome: 'banco' }),
      campo({ rotulo: 'Agência', nome: 'agencia' }),
      campo({ rotulo: 'Número', nome: 'numero' }),
      campo({ rotulo: 'Saldo inicial (R$)', nome: 'saldo_inicial', tipo: 'moeda' }),
    ],
    rotulo: 'Criar conta',
    enviar: async (v) => { await post('/api/financeiro/contas', v); toast('Conta criada.'); recarregar(); },
  });
  alvo.append(
    h('div', { class: 'filtros' }, h('button', { class: 'btn', onclick: nova }, icone('novo'), 'Nova conta')),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      aoClicar: (c) => (location.hash = `#/financeiro/contas/${c.id}`),
      rodape: ['Total', '', '', fmt.moeda(lista.reduce((s, c) => s + c.saldo, 0))],
      colunas: [
        { titulo: 'Conta', valor: (c) => h('span', { class: 'principal-txt' }, c.nome) },
        { titulo: 'Banco', valor: (c) => c.banco ?? '—' },
        { titulo: 'Agência / número', valor: (c) => [c.agencia, c.numero].filter(Boolean).join(' / ') || '—' },
        { titulo: 'Saldo atual', num: true, valor: (c) => h('b', null, fmt.moeda(c.saldo)) },
      ],
    })),
  );
}

export async function extrato(alvo, { params }) {
  const e = await get('/api/financeiro/extrato', { conta_id: params[0] });
  alvo.append(
    cabecalho(`Extrato · ${e.conta.nome}`, {
      trilha: [{ rotulo: 'Financeiro', href: '#/financeiro?aba=contas' }],
      sub: `Saldo inicial ${fmt.moeda(e.conta.saldo_inicial)} · saldo atual ${fmt.moeda(e.conta.saldo)}`,
    }),
    h('div', { class: 'cartao' }, tabela({
      linhas: e.movimentos,
      vazioTexto: 'Nenhum movimento nesta conta.',
      colunas: [
        { titulo: 'Data', valor: (m) => fmt.data(m.data) },
        { titulo: 'Descrição', valor: (m) => m.descricao },
        { titulo: 'Valor', num: true, valor: (m) => h('span', { class: m.valor < 0 ? 'erro-txt' : 'ok-txt' }, fmt.moeda(m.valor)) },
      ],
    })),
  );
}
