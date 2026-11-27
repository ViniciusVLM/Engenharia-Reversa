import { get, post, put, patch, del } from '../api.js';
import {
  h, limpar, fmt, icone, cabecalho, campo, lerForm, modal, formularioModal, confirmar, toast, acao, vazio, hojeIso,
} from '../ui.js';

const TIPOS = [
  ['texto', 'Texto curto'], ['texto_longo', 'Texto longo'], ['numero', 'Número'], ['moeda', 'Valor (R$)'], ['data', 'Data'],
  ['email', 'E-mail'], ['selecao', 'Lista de opções'], ['parceiro', 'Fornecedor / cliente'], ['produto', 'Produto'], ['departamento', 'Departamento'],
];
const ROTULO_TIPO = Object.fromEntries(TIPOS);

async function carregarReferencias() {
  const [produtos, parceiros, departamentos] = await Promise.all([get('/api/produtos'), get('/api/parceiros'), get('/api/departamentos')]);
  return {
    produtos, parceiros, departamentos,
    opcoes: {
      produto: produtos.map((p) => [p.id, `${p.codigo} — ${p.descricao}`]),
      parceiro: parceiros.map((p) => [p.id, p.nome]),
      departamento: departamentos.map((d) => [d.id, d.nome]),
    },
  };
}

function valorLegivel(c, valor, refs) {
  if (valor == null || valor === '') return '—';
  switch (c.tipo) {
    case 'moeda': return fmt.moeda(valor);
    case 'data': return fmt.data(valor);
    case 'numero': return fmt.numero(valor);
    case 'produto': case 'parceiro': case 'departamento':
      return refs.opcoes[c.tipo].find(([id]) => String(id) === String(valor))?.[1] ?? `#${valor}`;
    default: return String(valor);
  }
}

function campoDoPipe(c, valor, refs) {
  const base = { rotulo: c.rotulo, nome: `dado:${c.chave}`, valor, obrigatorio: !!c.obrigatorio };
  switch (c.tipo) {
    case 'texto_longo': return campo({ ...base, tipo: 'textarea', largo: true });
    case 'numero': return campo({ ...base, tipo: 'number' });
    case 'moeda': return campo({ ...base, tipo: 'moeda' });
    case 'data': return campo({ ...base, tipo: 'date' });
    case 'email': return campo({ ...base, tipo: 'email' });
    case 'selecao': return campo({ ...base, tipo: 'select', opcoes: c.opcoes.map((o) => [o, o]) });
    case 'produto': case 'parceiro': case 'departamento': return campo({ ...base, tipo: 'select', opcoes: refs.opcoes[c.tipo] });
    default: return campo(base);
  }
}

function separarDados(valores) {
  const dados = {};
  const resto = {};
  for (const [k, v] of Object.entries(valores)) {
    if (k.startsWith('dado:')) dados[k.slice(5)] = v;
    else resto[k] = v;
  }
  return { ...resto, dados };
}

const ROTAS_VINCULO = {
  solicitacao: (id) => `#/compras/solicitacoes/${id}`,
  colaborador: (id) => `#/rh/colaboradores/${id}`,
  titulo: () => '#/financeiro?aba=pagar',
};

// ------------------------------------------------------------------ lista de pipes

export async function lista(alvo) {
  const pipes = await get('/api/pipes');

  const novo = () => formularioModal({
    titulo: 'Novo processo',
    campos: [
      campo({ rotulo: 'Nome', nome: 'nome', obrigatorio: true, largo: true }),
      campo({ rotulo: 'Descrição', nome: 'descricao', tipo: 'textarea', largo: true }),
      campo({ rotulo: 'Fases (separadas por vírgula)', nome: 'fases', valor: 'Caixa de entrada, Em andamento, Concluído', largo: true, ajuda: 'A última fase marca o card como concluído. Dá para mudar depois.' }),
      campo({ rotulo: 'Cor', nome: 'cor', tipo: 'color', valor: '#4f46e5' }),
    ],
    rotulo: 'Criar processo',
    enviar: async (v) => {
      const pipe = await post('/api/pipes', { ...v, fases: (v.fases ?? '').split(',').map((s) => s.trim()).filter(Boolean) });
      location.hash = `#/processos/${pipe.id}/configurar`;
    },
  });

  alvo.append(
    cabecalho('Processos', {
      sub: 'Fluxos em kanban, com campos próprios e automações que conversam com Compras, RH e Financeiro.',
      acoes: [h('button', { class: 'btn primario', onclick: novo }, icone('novo'), 'Novo processo')],
    }),
    pipes.length
      ? h('div', { class: 'grade grade-3' }, pipes.map((p) => h('a', { class: 'cartao pipe-cartao', href: `#/processos/${p.id}`, style: { '--cor': p.cor } },
          h('h2', null, p.nome),
          h('p', { class: 'mudo' }, p.descricao ?? ''),
          h('div', { class: 'numeros' },
            h('div', null, h('b', null, p.abertos), 'em aberto'),
            h('div', null, h('b', null, p.concluidos), 'concluídos'),
            h('div', null, h('b', { class: p.atrasados ? 'erro-txt' : '' }, p.atrasados), 'atrasados'),
            h('div', null, h('b', null, p.automacoes), 'automações'),
          ))))
      : h('div', { class: 'cartao' }, vazio('Nenhum processo ainda', 'Crie o primeiro fluxo para organizar o trabalho do time.', h('button', { class: 'btn primario', onclick: novo }, 'Novo processo'))),
  );
}

// ------------------------------------------------------------------ quadro kanban

export async function quadro(alvo, { params, query }) {
  const id = Number(params[0]);
  let busca = query.busca ?? '';
  const [pipeInicial, refs] = await Promise.all([get(`/api/pipes/${id}`, { busca }), carregarReferencias()]);
  let pipe = pipeInicial;
  const area = h('div');

  async function atualizar() {
    pipe = await get(`/api/pipes/${id}`, { busca });
    desenhar();
  }

  function cartaoCard(c) {
    const atrasado = c.vencimento && !c.concluido_em && c.vencimento < hojeIso();
    const destaque = pipe.campos.find((x) => x.tipo === 'moeda' && c.dados[x.chave] != null)
      ?? pipe.campos.find((x) => ['selecao', 'departamento', 'produto'].includes(x.tipo) && c.dados[x.chave] != null);
    const el = h('button', { class: 'card-k', type: 'button', draggable: 'true', onclick: () => abrirCard(c.id) },
      h('div', { class: 'faixa', style: { background: pipe.cor } }),
      h('div', { class: 'titulo' }, c.titulo),
      destaque ? h('div', { class: 'fraco' }, `${destaque.rotulo}: ${valorLegivel(destaque, c.dados[destaque.chave], refs)}`) : null,
      h('div', { class: 'meta' },
        c.responsavel ? h('span', null, c.responsavel) : null,
        c.vencimento ? h('span', { class: atrasado ? 'atrasado' : '' }, `${atrasado ? 'Atrasado · ' : 'Prazo '}${fmt.data(c.vencimento)}`) : null,
        c.vinculos.length ? h('span', { title: 'Registros gerados por automação' }, `⚡ ${c.vinculos.map((v) => v.rotulo).join(', ')}`) : null,
      ),
    );
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(c.id)); el.classList.add('arrastando'); });
    el.addEventListener('dragend', () => el.classList.remove('arrastando'));
    return el;
  }

  function desenhar() {
    const colunas = pipe.fases.map((f) => {
      const col = h('section', { class: 'coluna', 'aria-label': f.nome },
        h('div', { class: 'coluna-topo' },
          h('h3', null, f.nome, h('span', { class: 'qtd' }, f.cards.length)),
          h('div', null,
            f.automacoes ? h('span', { class: 'raio', title: 'Esta fase dispara automações' }, '⚡ automação') : null,
            f.concluida ? h('span', { class: 'fraco' }, ' ✓ final') : null),
        ),
        h('div', { class: 'coluna-cards' }, f.cards.length ? f.cards.map(cartaoCard) : h('p', { class: 'fraco', style: { padding: '8px 2px' } }, 'Sem cards')),
      );
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('alvo'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('alvo'); });
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('alvo');
        const cardId = Number(e.dataTransfer.getData('text/plain'));
        const card = pipe.fases.flatMap((x) => x.cards).find((c) => c.id === cardId);
        if (!card || card.fase_id === f.id) return;
        await mover(cardId, f.id);
      });
      return col;
    });
    limpar(area, h('div', { class: 'kanban' }, colunas));
  }

  async function mover(cardId, faseId) {
    const antes = pipe.fases.flatMap((x) => x.cards).find((c) => c.id === cardId)?.vinculos.length ?? 0;
    const r = await acao(null, () => post(`/api/cards/${cardId}/mover`, { fase_id: faseId }));
    if (r) {
      const novos = r.vinculos.length - antes;
      toast(novos > 0 ? `Card movido. Automação executou: ${r.vinculos.slice(-novos).map((v) => v.rotulo).join(', ')}.` : 'Card movido.');
    }
    await atualizar();
    return r;
  }

  function novoCard() {
    const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() },
      campo({ rotulo: 'Título', nome: 'titulo', obrigatorio: true, largo: true }),
      campo({ rotulo: 'Responsável', nome: 'responsavel' }),
      campo({ rotulo: 'Prazo', nome: 'vencimento', tipo: 'date' }),
      pipe.campos.map((c) => campoDoPipe(c, null, refs)),
    );
    modal({
      titulo: `Novo card · ${pipe.nome}`, corpo: form, largo: true,
      acoes: [{ rotulo: 'Cancelar' }, {
        rotulo: 'Criar card', classe: 'primario',
        executar: async () => { await post(`/api/pipes/${id}/cards`, separarDados(lerForm(form))); toast('Card criado.'); await atualizar(); },
      }],
    });
  }

  async function abrirCard(cardId) {
    const corpo = h('div', { class: 'pilha' });
    const titulo = h('h2');
    const janela = modal({ titulo, corpo, gaveta: true, largo: true });

    async function desenharCard() {
      const c = await get(`/api/cards/${cardId}`);
      titulo.textContent = c.titulo;
      const fasesSel = campo({ rotulo: 'Fase', nome: 'fase', tipo: 'select', valor: c.fase_id, vazioRotulo: null, opcoes: pipe.fases.map((f) => [f.id, f.nome]) });
      const indice = pipe.fases.findIndex((f) => f.id === c.fase_id);
      const proxima = pipe.fases[indice]?.concluida ? null : pipe.fases[indice + 1];
      fasesSel.querySelector('select').addEventListener('change', async (e) => {
        const r = await mover(cardId, Number(e.target.value));
        if (!r) e.target.value = String(c.fase_id);
        await desenharCard();
      });

      const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() },
        campo({ rotulo: 'Título', nome: 'titulo', valor: c.titulo, obrigatorio: true, largo: true }),
        campo({ rotulo: 'Responsável', nome: 'responsavel', valor: c.responsavel }),
        campo({ rotulo: 'Prazo', nome: 'vencimento', tipo: 'date', valor: c.vencimento }),
        pipe.campos.map((x) => campoDoPipe(x, c.dados[x.chave], refs)),
      );
      const salvar = h('button', { class: 'btn primario', type: 'button' }, 'Salvar alterações');
      salvar.addEventListener('click', async () => {
        const ok = await acao(salvar, () => put(`/api/cards/${cardId}`, separarDados(lerForm(form))), 'Card salvo.');
        if (ok) { await atualizar(); await desenharCard(); }
      });

      const comentario = h('textarea', { class: 'entrada', placeholder: 'Escreva um comentário...', 'aria-label': 'Comentário', style: { minHeight: '60px' } });
      const comentar = h('button', { class: 'btn pequeno', type: 'button' }, 'Comentar');
      comentar.addEventListener('click', async () => {
        if (!comentario.value.trim()) return;
        const ok = await acao(comentar, () => post(`/api/cards/${cardId}/comentarios`, { texto: comentario.value }));
        if (ok) await desenharCard();
      });

      limpar(corpo,
        h('div', { class: 'grade grade-2', style: { alignItems: 'end' } },
          fasesSel,
          proxima ? h('button', { class: 'btn', type: 'button', onclick: async () => { await mover(cardId, proxima.id); await desenharCard(); } }, `Avançar para "${proxima.nome}"`, icone('seta')) : h('span', { class: 'fraco' }, 'Card em fase final'),
        ),
        c.vinculos.length
          ? h('div', { class: 'aviso-caixa' }, h('div', { class: 'fraco', style: { marginBottom: '6px' } }, 'Registros criados pelas automações'),
              h('div', { class: 'chips' }, c.vinculos.map((v) => h('a', { class: 'chip', href: ROTAS_VINCULO[v.tipo]?.(v.id) ?? '#', onclick: () => janela.fechar() }, `⚡ ${v.rotulo}`))))
          : null,
        form,
        h('div', { class: 'form-acoes' },
          h('button', { class: 'btn perigo', type: 'button', onclick: async () => {
            if (!(await confirmar('Excluir este card e todo o histórico?', { perigo: true, rotulo: 'Excluir' }))) return;
            if (await acao(null, () => del(`/api/cards/${cardId}`), 'Card excluído.')) { janela.fechar(); await atualizar(); }
          } }, 'Excluir'),
          salvar,
        ),
        h('h3', null, 'Histórico'),
        h('div', { class: 'pilha' }, comentario, h('div', { class: 'form-acoes' }, comentar)),
        h('ul', { class: 'linha-tempo' }, c.eventos.map((e) => h('li', { class: e.tipo },
          h('span', { class: 'ponto' }),
          h('div', null, h('div', null, e.texto), h('div', { class: 'fraco' }, `${e.usuario ?? ''} · ${fmt.dataHora(e.em)}`))))),
      );
    }
    await desenharCard().catch((e) => { toast(e.message, 'erro'); janela.fechar(); });
  }

  const campoBusca = h('input', { class: 'entrada busca', type: 'search', placeholder: 'Buscar cards por título ou responsável', value: busca, 'aria-label': 'Buscar cards' });
  let espera;
  campoBusca.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { busca = campoBusca.value.trim(); atualizar(); }, 250);
  });

  alvo.append(
    cabecalho(pipe.nome, {
      trilha: [{ rotulo: 'Processos', href: '#/processos' }],
      sub: pipe.descricao,
      acoes: [
        h('a', { class: 'btn', href: `#/processos/${id}/configurar` }, icone('config'), 'Configurar'),
        h('button', { class: 'btn primario', onclick: novoCard }, icone('novo'), 'Novo card'),
      ],
    }),
    h('div', { class: 'filtros' }, campoBusca,
      h('span', { class: 'fraco' }, 'Arraste os cards entre as fases, ou abra o card para mudar de fase.')),
    area,
  );
  desenhar();
  if (query.card) abrirCard(Number(query.card));
}

// ------------------------------------------------------------------ configuração do pipe

export async function configurar(alvo, { params }) {
  const id = Number(params[0]);
  const [pipeInicial, acoes] = await Promise.all([get(`/api/pipes/${id}`), get('/api/automacoes/acoes')]);
  let pipe = pipeInicial;
  const conteudo = h('div', { class: 'pilha' });

  const executar = async (botao, fn, msg) => {
    const r = await acao(botao, fn, msg);
    if (r && r.id === id) { pipe = r; desenhar(); }
    return r;
  };

  function secaoDados() {
    const form = h('form', { class: 'form-grade', onsubmit: (e) => e.preventDefault() },
      campo({ rotulo: 'Nome', nome: 'nome', valor: pipe.nome, obrigatorio: true }),
      campo({ rotulo: 'Cor', nome: 'cor', tipo: 'color', valor: pipe.cor }),
      campo({ rotulo: 'Descrição', nome: 'descricao', tipo: 'textarea', valor: pipe.descricao, largo: true }),
    );
    const salvar = h('button', { class: 'btn primario', type: 'button' }, 'Salvar');
    salvar.onclick = () => executar(salvar, () => put(`/api/pipes/${id}`, lerForm(form)), 'Processo atualizado.');
    const excluir = h('button', { class: 'btn perigo', type: 'button' }, 'Excluir processo');
    excluir.onclick = async () => {
      if (!(await confirmar(`Excluir "${pipe.nome}" com todos os cards e automações? Os registros já criados nos módulos continuam existindo.`, { perigo: true, rotulo: 'Excluir' }))) return;
      if (await acao(excluir, () => del(`/api/pipes/${id}`), 'Processo excluído.')) location.hash = '#/processos';
    };
    return h('div', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Dados do processo')),
      h('div', { class: 'cartao-corpo pilha' }, form, h('div', { class: 'form-acoes' }, excluir, salvar)));
  }

  function secaoFases() {
    const itens = pipe.fases.map((f, i) => {
      const nome = h('input', { class: 'entrada cresce', value: f.nome, 'aria-label': 'Nome da fase' });
      const final = h('input', { type: 'checkbox', checked: !!f.concluida });
      const salvar = () => executar(null, () => put(`/api/fases/${f.id}`, { nome: nome.value, concluida: final.checked }), 'Fase atualizada.');
      nome.addEventListener('change', salvar);
      final.addEventListener('change', salvar);
      const trocar = (j) => {
        const ids = pipe.fases.map((x) => x.id);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        executar(null, () => post(`/api/pipes/${id}/fases/ordem`, { ids }));
      };
      return h('div', { class: 'config-item' },
        h('span', { class: 'fraco', style: { width: '18px' } }, i + 1),
        nome,
        h('label', { class: 'checkbox fraco' }, final, 'Fase final'),
        f.cards.length ? h('span', { class: 'fraco' }, `${f.cards.length} card(s)`) : null,
        h('button', { class: 'btn fantasma pequeno', 'aria-label': 'Subir', disabled: i === 0, onclick: () => trocar(i - 1) }, icone('cima')),
        h('button', { class: 'btn fantasma pequeno', 'aria-label': 'Descer', disabled: i === pipe.fases.length - 1, onclick: () => trocar(i + 1) }, icone('baixo')),
        h('button', { class: 'btn fantasma pequeno', 'aria-label': 'Excluir fase', onclick: () => executar(null, () => del(`/api/fases/${f.id}`), 'Fase excluída.') }, icone('lixo')),
      );
    });
    const nova = h('input', { class: 'entrada cresce', placeholder: 'Nome da nova fase', 'aria-label': 'Nova fase' });
    const add = h('button', { class: 'btn', type: 'button' }, icone('novo'), 'Adicionar fase');
    add.onclick = () => nova.value.trim() && executar(add, () => post(`/api/pipes/${id}/fases`, { nome: nova.value }), 'Fase adicionada.');
    return h('div', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Fases'), h('span', { class: 'fraco' }, 'Cards em fase final contam como concluídos')),
      h('div', { class: 'cartao-corpo config-lista' }, itens, h('div', { class: 'config-item' }, nova, add)));
  }

  function secaoCampos() {
    const itens = pipe.campos.map((c) => h('div', { class: 'config-item' },
      h('div', { class: 'cresce' }, h('b', null, c.rotulo), c.obrigatorio ? h('span', { class: 'erro-txt' }, ' *') : null,
        h('div', { class: 'fraco' }, `${ROTULO_TIPO[c.tipo]}${c.opcoes.length ? ': ' + c.opcoes.join(', ') : ''} · chave: ${c.chave}`)),
      h('button', { class: 'btn fantasma pequeno', 'aria-label': `Excluir campo ${c.rotulo}`, onclick: () => executar(null, () => del(`/api/campos/${c.id}`), 'Campo excluído.') }, icone('lixo')),
    ));
    const adicionar = () => {
      const opcoes = campo({ rotulo: 'Opções (separadas por vírgula)', nome: 'opcoes', largo: true });
      opcoes.classList.add('oculto');
      const tipo = campo({ rotulo: 'Tipo', nome: 'tipo', tipo: 'select', opcoes: TIPOS, valor: 'texto', vazioRotulo: null });
      tipo.querySelector('select').addEventListener('change', (e) => opcoes.classList.toggle('oculto', e.target.value !== 'selecao'));
      formularioModal({
        titulo: 'Novo campo',
        campos: [campo({ rotulo: 'Rótulo', nome: 'rotulo', obrigatorio: true }), tipo, opcoes, campo({ rotulo: 'Obrigatório', nome: 'obrigatorio', tipo: 'checkbox' })],
        rotulo: 'Adicionar',
        enviar: async (v) => {
          const r = await post(`/api/pipes/${id}/campos`, { ...v, opcoes: (v.opcoes ?? '').split(',').map((s) => s.trim()).filter(Boolean) });
          pipe = r; desenhar(); toast('Campo adicionado.');
        },
      });
    };
    return h('div', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Campos do card'), h('button', { class: 'btn pequeno', onclick: adicionar }, icone('novo'), 'Novo campo')),
      h('div', { class: 'cartao-corpo config-lista' }, itens.length ? itens : h('p', { class: 'fraco' }, 'Nenhum campo. Cards terão só título, responsável e prazo.')));
  }

  function secaoAutomacoes() {
    const itens = pipe.automacoes.map((a) => {
      const def = acoes.find((x) => x.chave === a.acao);
      const ligacoes = Object.entries(a.mapeamento).map(([k, m]) => {
        const p = def?.parametros.find((x) => x.chave === k);
        const origem = m.campo === '_titulo' ? 'título do card' : m.campo ? pipe.campos.find((c) => c.chave === m.campo)?.rotulo ?? m.campo : `"${p?.fixos?.find(([v]) => v === m.valor)?.[1] ?? m.valor}"`;
        return `${p?.rotulo ?? k} ← ${origem}`;
      });
      const ativo = h('input', { type: 'checkbox', checked: !!a.ativo });
      ativo.addEventListener('change', () => executar(null, () => patch(`/api/automacoes/${a.id}`, { ativo: ativo.checked }), ativo.checked ? 'Automação ativada.' : 'Automação pausada.'));
      return h('div', { class: 'config-item', style: { alignItems: 'flex-start' } },
        h('div', { class: 'cresce' },
          h('div', null, '⚡ Quando o card entrar em ', h('b', null, a.fase_nome), ' → ', h('b', null, a.acao_rotulo), ' ', h('span', { class: 'etiqueta acento' }, def?.modulo ?? '')),
          h('div', { class: 'fraco', style: { marginTop: '4px' } }, ligacoes.join(' · '))),
        h('label', { class: 'checkbox fraco' }, ativo, 'Ativa'),
        h('button', { class: 'btn fantasma pequeno', 'aria-label': 'Excluir automação', onclick: () => executar(null, () => del(`/api/automacoes/${a.id}`), 'Automação removida.') }, icone('lixo')),
      );
    });
    return h('div', { class: 'cartao' },
      h('div', { class: 'cartao-topo' }, h('h2', null, 'Automações'), h('button', { class: 'btn pequeno', onclick: novaAutomacao }, icone('raio'), 'Nova automação')),
      h('div', { class: 'cartao-corpo config-lista' },
        itens.length ? itens : h('p', { class: 'fraco' }, 'Automações criam registros nos módulos quando um card chega numa fase. Ex.: card em "Aprovada" vira solicitação de compra.')));
  }

  function novaAutomacao() {
    const mapa = h('div', { class: 'form-grade' });
    const fase = campo({ rotulo: 'Quando o card entrar na fase', nome: 'fase_id', tipo: 'select', opcoes: pipe.fases.map((f) => [f.id, f.nome]), obrigatorio: true });
    const acaoSel = campo({ rotulo: 'Executar a ação', nome: 'acao', tipo: 'select', opcoes: acoes.map((a) => [a.chave, `${a.modulo}: ${a.rotulo}`]), obrigatorio: true });

    function desenharMapa() {
      const def = acoes.find((a) => a.chave === acaoSel.querySelector('select').value);
      if (!def) return limpar(mapa, h('p', { class: 'fraco campo largo' }, 'Escolha uma ação para ligar os campos.'));
      limpar(mapa,
        h('p', { class: 'fraco campo largo' }, 'Ligue cada informação da ação a um campo do card. Os marcados com * são obrigatórios.'),
        def.parametros.map((p) => {
          const opcoes = [];
          if (p.tipos.includes('_titulo')) opcoes.push(['campo:_titulo', 'Título do card']);
          for (const c of pipe.campos.filter((c) => p.tipos.includes(c.tipo))) opcoes.push([`campo:${c.chave}`, `Campo: ${c.rotulo}`]);
          for (const [v, l] of p.fixos ?? []) opcoes.push([`valor:${v}`, `Sempre: ${l}`]);
          const sugestao = opcoes.find(([v]) => v === `campo:${p.chave}`)?.[0];
          return campo({
            rotulo: p.rotulo, nome: `map:${p.chave}`, tipo: 'select', obrigatorio: p.obrigatorio, opcoes, valor: sugestao,
            vazioRotulo: p.obrigatorio ? 'Selecione...' : 'Não usar',
            ajuda: opcoes.length ? null : `Crie um campo do tipo ${p.tipos.filter((t) => t !== '_titulo').map((t) => ROTULO_TIPO[t]).join(' ou ')}.`,
          });
        }));
    }
    acaoSel.querySelector('select').addEventListener('change', desenharMapa);
    desenharMapa();

    const form = h('form', { class: 'pilha', onsubmit: (e) => e.preventDefault() }, h('div', { class: 'form-grade' }, fase, acaoSel), mapa);
    modal({
      titulo: 'Nova automação', corpo: form, largo: true,
      acoes: [{ rotulo: 'Cancelar' }, {
        rotulo: 'Criar automação', classe: 'primario',
        executar: async () => {
          const v = lerForm(form);
          const mapeamento = {};
          for (const [k, val] of Object.entries(v)) {
            if (!k.startsWith('map:') || !val) continue;
            const [tipo, ...resto] = val.split(':');
            mapeamento[k.slice(4)] = tipo === 'campo' ? { campo: resto.join(':') } : { valor: resto.join(':') };
          }
          pipe = await post(`/api/pipes/${id}/automacoes`, { fase_id: v.fase_id, acao: v.acao, mapeamento });
          desenhar();
          toast('Automação criada.');
        },
      }],
    });
  }

  function desenhar() {
    limpar(conteudo,
      h('div', { class: 'grade grade-2' }, secaoDados(), secaoFases()),
      secaoCampos(),
      secaoAutomacoes(),
    );
  }

  alvo.append(
    cabecalho(`Configurar · ${pipe.nome}`, {
      trilha: [{ rotulo: 'Processos', href: '#/processos' }, { rotulo: pipe.nome, href: `#/processos/${id}` }],
      acoes: [h('a', { class: 'btn primario', href: `#/processos/${id}` }, 'Ver quadro')],
    }),
    conteudo,
  );
  desenhar();
}

