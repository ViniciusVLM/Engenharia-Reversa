import { get, post, put } from '../api.js';
import {
  h, limpar, fmt, icone, cabecalho, abas, tabela, etiqueta, campo, lerForm, acao, toast, modal, formularioModal, confirmar, kpi, hojeIso,
} from '../ui.js';

const ABAS = [{ id: 'colaboradores', rotulo: 'Colaboradores' }, { id: 'folha', rotulo: 'Folha de pagamento' }, { id: 'simulador', rotulo: 'Simulador de salário' }];
const VINCULOS = [['clt', 'CLT'], ['aprendiz', 'Jovem aprendiz'], ['estagiario', 'Estagiário']];

export async function inicio(alvo, ctx) {
  const aba = ctx.query.aba ?? 'colaboradores';
  alvo.append(
    cabecalho('RH', {
      sub: 'Colaboradores CLT, jovens aprendizes e estagiários, com folha integrada ao Financeiro.',
      acoes: [h('a', { class: 'btn primario', href: '#/rh/colaboradores/novo' }, icone('novo'), 'Admitir colaborador')],
    }),
    abas('#/rh', ABAS, aba),
  );
  if (aba === 'folha') return folhas(alvo);
  if (aba === 'simulador') return simulador(alvo);
  return colaboradores(alvo, ctx);
}

async function colaboradores(alvo, { query }) {
  const status = query.status ?? 'ativo';
  const vinculo = query.vinculo ?? '';
  const [lista, alertas] = await Promise.all([get('/api/rh/colaboradores', { status: status === 'todos' ? '' : status, vinculo }), get('/api/rh/alertas')]);
  const navegar = (m) => {
    const q = new URLSearchParams({ aba: 'colaboradores', status, vinculo, ...m });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    location.hash = `#/rh?${q}`;
  };
  const fStatus = campo({ rotulo: 'Situação', nome: 'status', tipo: 'select', valor: status, vazioRotulo: null, opcoes: [['ativo', 'Ativos'], ['desligado', 'Desligados'], ['todos', 'Todos']] });
  fStatus.querySelector('select').addEventListener('change', (e) => navegar({ status: e.target.value }));
  const fVinculo = campo({ rotulo: 'Vínculo', nome: 'vinculo', tipo: 'select', valor: vinculo, vazioRotulo: 'Todos', opcoes: VINCULOS });
  fVinculo.querySelector('select').addEventListener('change', (e) => navegar({ vinculo: e.target.value }));

  alvo.append(
    alertas.length
      ? h('div', { class: 'aviso-caixa atencao', style: { marginBottom: '16px' } },
          h('b', null, 'Contratos de aprendizagem/estágio terminando: '),
          alertas.map((a, i) => [i ? ' · ' : '', h('a', { href: `#/rh/colaboradores/${a.id}` }, a.nome), ` (${a.dias < 0 ? 'vencido' : `${a.dias} dias`})`]))
      : null,
    h('div', { class: 'filtros' }, fStatus, fVinculo),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      aoClicar: (c) => (location.hash = `#/rh/colaboradores/${c.id}`),
      vazioTexto: 'Nenhum colaborador no filtro.',
      colunas: [
        { titulo: 'Nome', valor: (c) => h('div', null, h('div', { class: 'principal-txt' }, c.nome), h('div', { class: 'fraco' }, c.cargo ?? '')) },
        { titulo: 'Vínculo', valor: (c) => etiqueta(c.vinculo) },
        { titulo: 'Departamento', valor: (c) => c.departamento_nome ?? '—' },
        { titulo: 'Admissão', valor: (c) => fmt.data(c.admissao) },
        { titulo: 'Fim do contrato', valor: (c) => (c.fim_contrato ? fmt.data(c.fim_contrato) : '—') },
        { titulo: 'Salário / bolsa', num: true, valor: (c) => fmt.moeda(c.salario) },
        { titulo: 'Situação', valor: (c) => etiqueta(c.status) },
      ],
    })),
  );
}

function camposColaborador(c = {}, departamentos) {
  const fimContrato = campo({ rotulo: 'Fim do contrato', nome: 'fim_contrato', tipo: 'date', valor: c.fim_contrato, ajuda: 'Obrigatório para aprendiz e estágio (máx. 2 anos).' });
  const instituicao = campo({ rotulo: 'Instituição de ensino / entidade formadora', nome: 'instituicao', valor: c.instituicao });
  const vinculo = campo({ rotulo: 'Vínculo', nome: 'vinculo', tipo: 'select', opcoes: VINCULOS, valor: c.vinculo ?? 'clt', vazioRotulo: null, obrigatorio: true });
  const sincronizar = () => {
    const v = vinculo.querySelector('select').value;
    fimContrato.classList.toggle('oculto', v === 'clt');
    instituicao.classList.toggle('oculto', v === 'clt');
  };
  vinculo.querySelector('select').addEventListener('change', sincronizar);
  sincronizar();
  return [
    campo({ rotulo: 'Nome completo', nome: 'nome', valor: c.nome, obrigatorio: true, largo: true }),
    vinculo,
    campo({ rotulo: 'Cargo', nome: 'cargo', valor: c.cargo }),
    campo({ rotulo: 'Departamento', nome: 'departamento_id', tipo: 'select', valor: c.departamento_id, opcoes: departamentos.map((d) => [d.id, d.nome]) }),
    campo({ rotulo: 'Salário / bolsa (R$)', nome: 'salario', tipo: 'moeda', valor: c.salario, obrigatorio: true }),
    campo({ rotulo: 'Dependentes (IR)', nome: 'dependentes', tipo: 'number', valor: c.dependentes ?? 0, attrs: { min: '0' } }),
    campo({ rotulo: 'Admissão', nome: 'admissao', tipo: 'date', valor: c.admissao ?? hojeIso(), obrigatorio: true }),
    fimContrato,
    instituicao,
    campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', valor: c.email }),
    campo({ rotulo: 'Telefone', nome: 'telefone', valor: c.telefone }),
    campo({ rotulo: 'CPF', nome: 'cpf', valor: c.cpf, ajuda: 'Dado pessoal: preencha só em ambiente seguro.' }),
  ];
}

export async function novoColaborador(alvo) {
  const departamentos = await get('/api/departamentos');
  const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() }, camposColaborador({}, departamentos));
  const salvar = h('button', { class: 'btn primario', type: 'button' }, 'Admitir');
  salvar.onclick = async () => {
    const r = await acao(salvar, () => post('/api/rh/colaboradores', lerForm(form)), 'Colaborador admitido.');
    if (r) location.hash = `#/rh/colaboradores/${r.id}`;
  };
  alvo.append(
    cabecalho('Admitir colaborador', { trilha: [{ rotulo: 'RH', href: '#/rh' }] }),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' }, form,
      h('div', { class: 'form-acoes' }, h('a', { class: 'btn', href: '#/rh' }, 'Cancelar'), salvar))),
  );
}

export async function colaborador(alvo, { params, recarregar }) {
  const [c, departamentos] = await Promise.all([get(`/api/rh/colaboradores/${params[0]}`), get('/api/departamentos')]);
  const editar = () => formularioModal({
    titulo: `Editar ${c.nome}`, largo: true, campos: camposColaborador(c, departamentos), rotulo: 'Salvar',
    enviar: async (v) => { await put(`/api/rh/colaboradores/${c.id}`, v); toast('Dados atualizados.'); recarregar(); },
  });
  const desligar = () => formularioModal({
    titulo: `Desligar ${c.nome}`,
    campos: [
      campo({ rotulo: 'Data do desligamento', nome: 'data', tipo: 'date', valor: hojeIso(), obrigatorio: true }),
      h('p', { class: 'fraco campo largo' }, 'A próxima folha calcula o salário proporcional até esta data. Verbas rescisórias não são calculadas nesta versão.'),
    ],
    rotulo: 'Confirmar desligamento',
    enviar: async (v) => { await post(`/api/rh/colaboradores/${c.id}/desligar`, v); toast('Desligamento registrado.'); recarregar(); },
  });
  const diasFim = c.fim_contrato ? Math.round((Date.parse(c.fim_contrato) - Date.parse(hojeIso())) / 86400000) : null;

  alvo.append(
    cabecalho(c.nome, {
      trilha: [{ rotulo: 'RH', href: '#/rh' }],
      sub: [c.cargo, c.departamento_nome].filter(Boolean).join(' · '),
      acoes: c.status === 'ativo' ? [h('button', { class: 'btn perigo', onclick: desligar }, 'Desligar'), h('button', { class: 'btn primario', onclick: editar }, 'Editar')] : null,
    }),
    c.status === 'ativo' && diasFim !== null && diasFim <= 60
      ? h('div', { class: 'aviso-caixa atencao', style: { marginBottom: '16px' } },
          diasFim < 0 ? 'O contrato já terminou. Efetive (mude o vínculo para CLT) ou registre o desligamento.' : `O contrato termina em ${diasFim} dias (${fmt.data(c.fim_contrato)}). Planeje a efetivação ou o encerramento.`)
      : null,
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo' }, h('dl', { class: 'dl' },
      h('div', null, h('dt', null, 'Situação'), h('dd', null, etiqueta(c.status), c.desligamento ? ` em ${fmt.data(c.desligamento)}` : '')),
      h('div', null, h('dt', null, 'Vínculo'), h('dd', null, etiqueta(c.vinculo))),
      h('div', null, h('dt', null, c.vinculo === 'estagiario' ? 'Bolsa' : 'Salário'), h('dd', null, fmt.moeda(c.salario))),
      h('div', null, h('dt', null, 'Admissão'), h('dd', null, fmt.data(c.admissao))),
      c.fim_contrato ? h('div', null, h('dt', null, 'Fim do contrato'), h('dd', null, fmt.data(c.fim_contrato))) : null,
      c.instituicao ? h('div', null, h('dt', null, c.vinculo === 'aprendiz' ? 'Entidade formadora' : 'Instituição de ensino'), h('dd', null, c.instituicao)) : null,
      h('div', null, h('dt', null, 'Dependentes'), h('dd', null, c.dependentes)),
      c.email ? h('div', null, h('dt', null, 'E-mail'), h('dd', null, c.email)) : null,
      c.cpf ? h('div', null, h('dt', null, 'CPF'), h('dd', null, `***.${c.cpf.replace(/\D/g, '').slice(3, 6)}.***-**`)) : null,
      c.origem_card_id ? h('div', null, h('dt', null, 'Origem'), h('dd', null, '⚡ Admitido por processo')) : null,
    ))),
    h('div', { class: 'cartao', style: { marginTop: '16px' } },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Holerites')),
      tabela({
        linhas: c.holerites,
        aoClicar: (x) => (location.hash = `#/rh/folha/${x.competencia}`),
        vazioTexto: 'Ainda não entrou em nenhuma folha.',
        colunas: [
          { titulo: 'Competência', valor: (x) => fmt.competencia(x.competencia) },
          { titulo: 'Bruto', num: true, valor: (x) => fmt.moeda(x.salario) },
          { titulo: 'INSS', num: true, valor: (x) => fmt.moeda(x.inss) },
          { titulo: 'IRRF', num: true, valor: (x) => fmt.moeda(x.irrf) },
          { titulo: 'Líquido', num: true, valor: (x) => h('b', null, fmt.moeda(x.liquido)) },
          { titulo: 'FGTS', num: true, valor: (x) => fmt.moeda(x.fgts) },
          { titulo: 'Folha', valor: (x) => etiqueta(x.status) },
        ],
      })),
  );
}

async function folhas(alvo) {
  const lista = await get('/api/rh/folhas');
  const comp = h('input', { class: 'entrada', type: 'month', value: hojeIso().slice(0, 7), 'aria-label': 'Competência' });
  alvo.append(
    h('div', { class: 'filtros' },
      h('label', { class: 'campo' }, h('span', null, 'Abrir competência'), comp),
      h('button', { class: 'btn primario', style: { alignSelf: 'end' }, onclick: () => comp.value && (location.hash = `#/rh/folha/${comp.value}`) }, 'Abrir folha')),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      aoClicar: (f) => (location.hash = `#/rh/folha/${f.competencia}`),
      vazioTexto: 'Nenhuma folha calculada ainda.',
      colunas: [
        { titulo: 'Competência', valor: (f) => h('span', { class: 'principal-txt' }, fmt.competencia(f.competencia)) },
        { titulo: 'Bruto', num: true, valor: (f) => fmt.moeda(f.bruto) },
        { titulo: 'INSS', num: true, valor: (f) => fmt.moeda(f.inss) },
        { titulo: 'IRRF', num: true, valor: (f) => fmt.moeda(f.irrf) },
        { titulo: 'Líquido', num: true, valor: (f) => fmt.moeda(f.liquido) },
        { titulo: 'FGTS', num: true, valor: (f) => fmt.moeda(f.fgts) },
        { titulo: 'Situação', valor: (f) => etiqueta(f.status) },
      ],
    })),
  );
}

export async function folha(alvo, { params, recarregar }) {
  const comp = params[0];
  const f = await get(`/api/rh/folhas/${comp}`);
  const acoes = [];
  if (f.status !== 'fechada') {
    const calcular = h('button', { class: 'btn' }, f.status === 'nao_calculada' ? 'Calcular folha' : 'Recalcular');
    calcular.onclick = async () => (await acao(calcular, () => post(`/api/rh/folhas/${comp}/calcular`), 'Folha calculada.')) && recarregar();
    acoes.push(calcular);
  }
  if (f.status === 'aberta') {
    const fechar = h('button', { class: 'btn primario' }, 'Fechar e lançar no Financeiro');
    fechar.onclick = async () => {
      if (!(await confirmar(`Fechar a folha de ${fmt.competencia(comp)}? Serão lançadas contas a pagar de salários (${fmt.moeda(f.liquido)}), FGTS, INSS e IRRF.`))) return;
      if (await acao(fechar, () => post(`/api/rh/folhas/${comp}/fechar`), 'Folha fechada e lançada no Financeiro.')) recarregar();
    };
    acoes.push(fechar);
  }
  if (f.status === 'fechada') {
    const reabrir = h('button', { class: 'btn' }, 'Reabrir');
    reabrir.onclick = async () => {
      if (!(await confirmar('Reabrir a folha? As contas a pagar geradas (ainda não pagas) serão canceladas.'))) return;
      if (await acao(reabrir, () => post(`/api/rh/folhas/${comp}/reabrir`), 'Folha reaberta.')) recarregar();
    };
    acoes.push(reabrir);
  }

  alvo.append(
    cabecalho(`Folha de ${fmt.competencia(comp)}`, { trilha: [{ rotulo: 'RH', href: '#/rh?aba=folha' }], sub: h('span', null, 'Situação: ', etiqueta(f.status)), acoes }),
  );
  if (f.status === 'nao_calculada') {
    alvo.append(h('div', { class: 'cartao' }, h('div', { class: 'vazio' }, h('strong', null, 'Folha ainda não calculada'), h('p', null, 'Calcule para gerar os holerites de todos os colaboradores ativos na competência.'))));
    return;
  }
  alvo.append(
    h('div', { class: 'grade grade-4', style: { marginBottom: '16px' } },
      kpi({ rotulo: 'Salários e bolsas (bruto)', valor: fmt.moeda(f.bruto), detalhe: `${f.itens.length} colaborador(es)` }),
      kpi({ rotulo: 'Líquido a pagar', valor: fmt.moeda(f.liquido) }),
      kpi({ rotulo: 'INSS + IRRF retidos', valor: fmt.moeda(f.inss + f.irrf) }),
      kpi({ rotulo: 'FGTS (encargo)', valor: fmt.moeda(f.fgts) }),
    ),
    h('div', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Holerites'), h('span', { class: 'fraco' }, 'Clique para ver a memória de cálculo')),
      tabela({
        linhas: f.itens,
        aoClicar: abrirHolerite,
        rodape: ['Totais', '', fmt.moeda(f.bruto), fmt.moeda(f.inss), fmt.moeda(f.irrf), fmt.moeda(f.liquido), fmt.moeda(f.fgts)],
        colunas: [
          { titulo: 'Colaborador', valor: (i) => h('div', null, h('div', { class: 'principal-txt' }, i.nome), h('div', { class: 'fraco' }, i.cargo ?? '')) },
          { titulo: 'Vínculo', valor: (i) => [etiqueta(i.vinculo), i.memoria.diasTrabalhados < 30 ? h('span', { class: 'fraco' }, ` ${i.memoria.diasTrabalhados} dias`) : null] },
          { titulo: 'Bruto', num: true, valor: (i) => fmt.moeda(i.salario) },
          { titulo: 'INSS', num: true, valor: (i) => fmt.moeda(i.inss) },
          { titulo: 'IRRF', num: true, valor: (i) => fmt.moeda(i.irrf) },
          { titulo: 'Líquido', num: true, valor: (i) => h('b', null, fmt.moeda(i.liquido)) },
          { titulo: 'FGTS', num: true, valor: (i) => fmt.moeda(i.fgts) },
        ],
      })),
    f.titulos.length
      ? h('div', { class: 'cartao', style: { marginTop: '16px' } },
          h('div', { class: 'cartao-topo' }, h('h2', null, 'Lançamentos no Financeiro'), h('a', { href: '#/financeiro?aba=pagar&status=todos' }, 'Abrir')),
          tabela({
            linhas: f.titulos,
            colunas: [
              { titulo: 'Descrição', valor: (t) => t.descricao },
              { titulo: 'Vencimento', valor: (t) => fmt.data(t.vencimento) },
              { titulo: 'Valor', num: true, valor: (t) => fmt.moeda(t.valor) },
              { titulo: 'Situação', valor: (t) => etiqueta(t.status) },
            ],
          }))
      : null,
  );
}

function memoriaDeCalculo(r) {
  const m = r.memoria;
  const linhas = [
    ['Salário / bolsa do mês', r.salario, ''],
    ...m.inss.faixas.map((f) => [`INSS faixa ${fmt.pct(f.aliquota)} sobre ${fmt.moeda(f.base)}`, -f.valor, 'fraco']),
    m.vinculo === 'estagiario' ? ['INSS (não incide sobre bolsa de estágio)', 0, 'fraco'] : ['INSS total', -r.inss, ''],
    [`Base do IR (dedução ${m.irrf.deducaoUsada === 'simplificada' ? 'simplificada' : 'legal: INSS + dependentes'} de ${fmt.moeda(m.irrf.deducao)})`, m.irrf.base, 'fraco'],
    [`IR pela tabela (${fmt.pct(m.irrf.aliquota)} − ${fmt.moeda(m.irrf.deducaoFaixa)})`, -m.irrf.impostoTabela, 'fraco'],
    m.irrf.reducao ? ['Redução do IR (Lei 15.270/2025)', m.irrf.reducao, 'fraco'] : null,
    ['IRRF retido', -r.irrf, ''],
  ].filter(Boolean);
  return h('div', { class: 'pilha' },
    h('table', { class: 'tabela holerite' }, h('tbody', null,
      linhas.map(([rot, v, cls]) => h('tr', { class: cls }, h('td', null, rot), h('td', { class: 'num' }, fmt.moeda(v)))),
      h('tr', null, h('td', null, h('b', null, 'Líquido')), h('td', { class: 'num' }, h('b', null, fmt.moeda(r.liquido)))),
      h('tr', { class: 'fraco' }, h('td', null, `FGTS depositado pela empresa (${fmt.pct(m.fgts.aliquota)})`), h('td', { class: 'num' }, fmt.moeda(r.fgts))),
    )),
    h('p', { class: 'fraco' }, `Tabelas de ${m.tabela}. Valores de referência: confira com a contabilidade antes de usar em produção.`),
  );
}

function abrirHolerite(i) {
  modal({ titulo: `Holerite · ${i.nome}`, corpo: memoriaDeCalculo(i) });
}

async function simulador(alvo) {
  const resultado = h('div');
  const form = h('form', { class: 'form-grade', onsubmit: (e) => { e.preventDefault(); simular(); } },
    campo({ rotulo: 'Salário / bolsa (R$)', nome: 'salario', tipo: 'moeda', valor: 300000, obrigatorio: true }),
    campo({ rotulo: 'Vínculo', nome: 'vinculo', tipo: 'select', opcoes: VINCULOS, valor: 'clt', vazioRotulo: null }),
    campo({ rotulo: 'Dependentes', nome: 'dependentes', tipo: 'number', valor: 0, attrs: { min: '0' } }),
    campo({ rotulo: 'Competência', nome: 'competencia', tipo: 'month', valor: hojeIso().slice(0, 7) }),
    h('div', { class: 'campo', style: { justifyContent: 'end' } }, h('button', { class: 'btn primario', type: 'submit' }, 'Calcular')),
  );
  async function simular() {
    try {
      const r = await post('/api/rh/simular', lerForm(form));
      limpar(resultado, memoriaDeCalculo(r));
    } catch (e) {
      limpar(resultado, h('p', { class: 'erro-txt' }, e.message));
    }
  }
  alvo.append(h('div', { class: 'grade grade-2' },
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-topo' }, h('h2', null, 'Dados')), h('div', { class: 'cartao-corpo' }, form)),
    h('div', { class: 'cartao' }, h('div', { class: 'cartao-topo' }, h('h2', null, 'Resultado')), h('div', { class: 'cartao-corpo' }, resultado)),
  ));
  simular();
}
