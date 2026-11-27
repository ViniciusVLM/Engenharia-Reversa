import * as v from '../lib/validar.js';
import { naoEncontrado, conflito, invalido, ErroHttp } from '../lib/http.js';
import { criarSolicitacao } from './compras.js';
import { admitirColaborador } from './rh.js';
import { criarTitulo } from './financeiro.js';

export const TIPOS_CAMPO = ['texto', 'texto_longo', 'numero', 'moeda', 'data', 'email', 'selecao', 'parceiro', 'produto', 'departamento'];

const slug = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo';

const json = (s, padrao) => {
  try { return JSON.parse(s); } catch { return padrao; }
};

// ------------------------------------------------------------------ automações

function normalizarVinculo(valor) {
  const s = slug(valor ?? '');
  if (s.includes('aprendiz')) return 'aprendiz';
  if (s.includes('estag')) return 'estagiario';
  if (s.includes('clt') || s.includes('efetivo')) return 'clt';
  return valor;
}

/**
 * Catálogo de ações disponíveis para automações. Cada parâmetro aceita os tipos
 * de campo listados (ou um valor fixo quando há `fixos`). `_titulo` é o título do card.
 */
export const ACOES = {
  criar_solicitacao_compra: {
    rotulo: 'Criar solicitação de compra',
    modulo: 'Compras',
    parametros: [
      { chave: 'produto', rotulo: 'Produto', tipos: ['produto'], obrigatorio: true },
      { chave: 'quantidade', rotulo: 'Quantidade', tipos: ['numero'], obrigatorio: true },
      { chave: 'departamento', rotulo: 'Departamento', tipos: ['departamento'] },
      { chave: 'justificativa', rotulo: 'Justificativa', tipos: ['texto', 'texto_longo', '_titulo'] },
    ],
    executar(db, p, card, usuario) {
      const s = criarSolicitacao(db, {
        solicitante: card.responsavel || usuario,
        departamentoId: p.departamento ? Number(p.departamento) : null,
        justificativa: p.justificativa ?? `Gerada pelo card #${card.id} — ${card.titulo}`,
        itens: [{ produto_id: p.produto, quantidade: p.quantidade }],
        origemCardId: card.id,
      });
      return { tipo: 'solicitacao', id: s.id, rotulo: s.numero, texto: `Solicitação de compra ${s.numero} criada` };
    },
  },
  admitir_colaborador: {
    rotulo: 'Admitir colaborador no RH',
    modulo: 'RH',
    parametros: [
      { chave: 'nome', rotulo: 'Nome', tipos: ['texto', '_titulo'], obrigatorio: true },
      { chave: 'vinculo', rotulo: 'Vínculo', tipos: ['selecao'], obrigatorio: true, fixos: [['clt', 'CLT'], ['aprendiz', 'Jovem aprendiz'], ['estagiario', 'Estagiário']] },
      { chave: 'salario', rotulo: 'Salário / bolsa', tipos: ['moeda'], obrigatorio: true },
      { chave: 'admissao', rotulo: 'Data de admissão', tipos: ['data'], obrigatorio: true },
      { chave: 'fim_contrato', rotulo: 'Fim do contrato', tipos: ['data'] },
      { chave: 'instituicao', rotulo: 'Instituição / entidade formadora', tipos: ['texto'] },
      { chave: 'departamento', rotulo: 'Departamento', tipos: ['departamento'] },
      { chave: 'cargo', rotulo: 'Cargo', tipos: ['texto'] },
      { chave: 'email', rotulo: 'E-mail', tipos: ['email', 'texto'] },
    ],
    executar(db, p, card) {
      const id = admitirColaborador(
        db,
        {
          nome: p.nome, email: p.email, cargo: p.cargo, departamento_id: p.departamento,
          vinculo: normalizarVinculo(p.vinculo), salario: p.salario, admissao: p.admissao,
          fim_contrato: p.fim_contrato, instituicao: p.instituicao,
        },
        { origemCardId: card.id },
      );
      return { tipo: 'colaborador', id, rotulo: p.nome, texto: `Colaborador "${p.nome}" admitido no RH` };
    },
  },
  lancar_titulo: {
    rotulo: 'Lançar título no Financeiro',
    modulo: 'Financeiro',
    parametros: [
      { chave: 'tipo', rotulo: 'Tipo', tipos: ['selecao'], obrigatorio: true, fixos: [['pagar', 'Conta a pagar'], ['receber', 'Conta a receber']] },
      { chave: 'valor', rotulo: 'Valor', tipos: ['moeda'], obrigatorio: true },
      { chave: 'vencimento', rotulo: 'Vencimento', tipos: ['data'], obrigatorio: true },
      { chave: 'descricao', rotulo: 'Descrição', tipos: ['texto', '_titulo'] },
      { chave: 'parceiro', rotulo: 'Fornecedor / cliente', tipos: ['parceiro'] },
    ],
    executar(db, p, card) {
      const tipo = v.opcao(p.tipo, 'Tipo do título', ['pagar', 'receber']);
      const id = criarTitulo(db, {
        tipo,
        descricao: p.descricao ?? card.titulo,
        parceiroId: p.parceiro ? Number(p.parceiro) : null,
        categoria: 'outros',
        origem: 'card',
        origemId: card.id,
        valor: v.centavos(p.valor, 'Valor', { obrigatorio: true, positivo: true }),
        vencimento: v.data(p.vencimento, 'Vencimento', { obrigatorio: true }),
      });
      return { tipo: 'titulo', id, rotulo: `Título #${id}`, texto: `Conta a ${tipo} lançada no Financeiro` };
    },
  },
};

function resolverParametros(acao, mapeamento, card) {
  const valores = {};
  for (const p of acao.parametros) {
    const m = mapeamento[p.chave];
    let valor = null;
    if (m?.campo === '_titulo') valor = card.titulo;
    else if (m?.campo) valor = card.dados[m.campo];
    else if (m && 'valor' in m) valor = m.valor;
    if (valor === '' || valor === undefined) valor = null;
    if (valor === null && p.obrigatorio) {
      throw invalido(`Preencha o campo ligado a "${p.rotulo}" antes de mover o card.`);
    }
    if (valor !== null) valores[p.chave] = valor;
  }
  return valores;
}

// ------------------------------------------------------------------ cards

function validarDados(db, campos, dados, { exigirObrigatorios }) {
  const saida = {};
  for (const c of campos) {
    let valor = dados?.[c.chave];
    if (valor === undefined || valor === null || valor === '') {
      if (exigirObrigatorios && c.obrigatorio) throw invalido(`O campo "${c.rotulo}" é obrigatório.`);
      continue;
    }
    switch (c.tipo) {
      case 'numero': valor = v.numero(valor, c.rotulo); break;
      case 'moeda': valor = v.centavos(valor, c.rotulo); break;
      case 'data': valor = v.data(valor, c.rotulo); break;
      case 'email':
        valor = v.texto(valor, c.rotulo, { max: 150 });
        if (!/^\S+@\S+\.\S+$/.test(valor)) throw invalido(`"${c.rotulo}" não é um e-mail válido.`);
        break;
      case 'selecao': {
        const opcoes = json(c.opcoes, []);
        if (!opcoes.includes(valor)) throw invalido(`"${c.rotulo}": opção inválida.`);
        break;
      }
      case 'parceiro':
      case 'produto':
      case 'departamento': {
        const tabela = { parceiro: 'parceiros', produto: 'produtos', departamento: 'departamentos' }[c.tipo];
        valor = v.id(valor, c.rotulo);
        if (!db.um(`SELECT id FROM ${tabela} WHERE id = ?`, valor)) throw invalido(`"${c.rotulo}": registro não encontrado.`);
        break;
      }
      default: valor = v.texto(valor, c.rotulo, { max: c.tipo === 'texto_longo' ? 5000 : 500 });
    }
    saida[c.chave] = valor;
  }
  return saida;
}

function registrarEvento(db, cardId, tipo, texto, usuario) {
  db.executar('INSERT INTO card_eventos (card_id, tipo, texto, usuario) VALUES (?, ?, ?, ?)', cardId, tipo, texto, usuario);
}

function lerCard(db, id) {
  const c = db.um('SELECT * FROM cards WHERE id = ?', id);
  if (!c) throw naoEncontrado('Card');
  return { ...c, dados: json(c.dados, {}), vinculos: json(c.vinculos, []) };
}

export function criarCard(db, pipeId, { titulo, dados, responsavel, vencimento }, usuario) {
  const pipe = db.um('SELECT id FROM pipes WHERE id = ?', pipeId);
  if (!pipe) throw naoEncontrado('Pipe');
  const primeira = db.um('SELECT * FROM fases WHERE pipe_id = ? ORDER BY ordem, id LIMIT 1', pipeId);
  if (!primeira) throw conflito('O pipe não tem fases.');
  const campos = db.todos('SELECT * FROM campos WHERE pipe_id = ? ORDER BY ordem, id', pipeId);
  const dadosValidos = validarDados(db, campos, dados, { exigirObrigatorios: true });
  return db.transacao(() => {
    const id = db.executar(
      'INSERT INTO cards (pipe_id, fase_id, titulo, dados, responsavel, vencimento) VALUES (?, ?, ?, ?, ?, ?)',
      pipeId, primeira.id, v.texto(titulo, 'Título', { obrigatorio: true, max: 200 }), JSON.stringify(dadosValidos),
      v.texto(responsavel, 'Responsável', { max: 100 }), v.data(vencimento, 'Vencimento'),
    ).id;
    registrarEvento(db, id, 'criado', `Card criado em "${primeira.nome}"`, usuario);
    return id;
  });
}

export function moverCard(db, cardId, faseId, usuario) {
  const card = lerCard(db, cardId);
  const destino = db.um('SELECT * FROM fases WHERE id = ? AND pipe_id = ?', faseId, card.pipe_id);
  if (!destino) throw invalido('Fase de destino não pertence a este pipe.');
  if (destino.id === card.fase_id) return lerCard(db, cardId);
  const origem = db.um('SELECT nome FROM fases WHERE id = ?', card.fase_id);

  try {
    db.transacao(() => {
      db.executar(
        `UPDATE cards SET fase_id = ?, atualizado_em = datetime('now'), concluido_em = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id = ?`,
        destino.id, destino.concluida, card.id,
      );
      registrarEvento(db, card.id, 'movido', `Movido de "${origem.nome}" para "${destino.nome}"`, usuario);

      const automacoes = db.todos('SELECT * FROM automacoes WHERE fase_id = ? AND ativo = 1 ORDER BY id', destino.id);
      const vinculos = [...card.vinculos];
      for (const a of automacoes) {
        if (vinculos.some((x) => x.automacao_id === a.id)) continue; // já executou antes (card voltou e avançou de novo)
        const acao = ACOES[a.acao];
        if (!acao) continue;
        try {
          const parametros = resolverParametros(acao, json(a.mapeamento, {}), card);
          const r = acao.executar(db, parametros, card, usuario);
          vinculos.push({ automacao_id: a.id, tipo: r.tipo, id: r.id, rotulo: r.rotulo });
          registrarEvento(db, card.id, 'automacao', r.texto, 'Automação');
        } catch (e) {
          throw new ErroHttp(e.status ?? 500, `Automação "${acao.rotulo}" não pôde rodar: ${e.message}`);
        }
      }
      db.executar('UPDATE cards SET vinculos = ? WHERE id = ?', JSON.stringify(vinculos), card.id);
    });
  } catch (e) {
    registrarEvento(db, card.id, 'erro', `Tentativa de mover para "${destino.nome}" bloqueada. ${e.message}`, usuario);
    throw e;
  }
  return lerCard(db, cardId);
}

// ------------------------------------------------------------------ pipes

export function criarPipe(db, { nome, descricao, cor, fases }) {
  const nomes = Array.isArray(fases) && fases.length ? fases : ['Caixa de entrada', 'Em andamento', 'Concluído'];
  return db.transacao(() => {
    const id = db.executar(
      'INSERT INTO pipes (nome, descricao, cor) VALUES (?, ?, ?)',
      v.texto(nome, 'Nome', { obrigatorio: true, max: 80 }), v.texto(descricao, 'Descrição', { max: 300 }),
      /^#[0-9a-f]{6}$/i.test(cor ?? '') ? cor : '#4f46e5',
    ).id;
    nomes.forEach((n, i) =>
      db.executar('INSERT INTO fases (pipe_id, nome, ordem, concluida) VALUES (?, ?, ?, ?)', id, v.texto(n, 'Fase', { obrigatorio: true, max: 60 }), i, i === nomes.length - 1),
    );
    return id;
  });
}

export function criarCampo(db, pipeId, corpo) {
  const rotulo = v.texto(corpo.rotulo, 'Rótulo', { obrigatorio: true, max: 80 });
  const tipo = v.opcao(corpo.tipo, 'Tipo', TIPOS_CAMPO, { padrao: 'texto' });
  let chave = slug(corpo.chave || rotulo);
  let n = 2;
  while (db.um('SELECT id FROM campos WHERE pipe_id = ? AND chave = ?', pipeId, chave)) chave = `${slug(rotulo)}_${n++}`;
  const opcoes = tipo === 'selecao' ? v.lista(corpo.opcoes, 'Opções', { min: 1 }).map((o) => String(o).trim()).filter(Boolean) : [];
  const ordem = db.um('SELECT COALESCE(MAX(ordem), -1) + 1 o FROM campos WHERE pipe_id = ?', pipeId).o;
  return db.executar(
    'INSERT INTO campos (pipe_id, chave, rotulo, tipo, obrigatorio, opcoes, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)',
    pipeId, chave, rotulo, tipo, !!corpo.obrigatorio, JSON.stringify(opcoes), ordem,
  ).id;
}

export function criarAutomacao(db, pipeId, corpo) {
  const faseId = v.id(corpo.fase_id, 'Fase', { obrigatorio: true });
  if (!db.um('SELECT id FROM fases WHERE id = ? AND pipe_id = ?', faseId, pipeId)) throw invalido('Fase não pertence a este pipe.');
  const acaoChave = v.opcao(corpo.acao, 'Ação', Object.keys(ACOES));
  const acao = ACOES[acaoChave];
  const mapeamento = corpo.mapeamento && typeof corpo.mapeamento === 'object' ? corpo.mapeamento : {};
  const campos = db.todos('SELECT chave, rotulo, tipo FROM campos WHERE pipe_id = ?', pipeId);
  const limpo = {};
  for (const p of acao.parametros) {
    const m = mapeamento[p.chave];
    if (m?.campo) {
      if (m.campo === '_titulo') {
        if (!p.tipos.includes('_titulo')) throw invalido(`"${p.rotulo}" não aceita o título do card.`);
      } else {
        const campo = campos.find((c) => c.chave === m.campo);
        if (!campo) throw invalido(`Campo "${m.campo}" não existe neste pipe.`);
        if (!p.tipos.includes(campo.tipo)) throw invalido(`"${p.rotulo}" não aceita campos do tipo ${campo.tipo}.`);
      }
      limpo[p.chave] = { campo: m.campo };
    } else if (m && 'valor' in m && m.valor !== '' && m.valor !== null) {
      if (p.fixos && !p.fixos.some(([k]) => k === m.valor)) throw invalido(`Valor fixo inválido para "${p.rotulo}".`);
      limpo[p.chave] = { valor: m.valor };
    } else if (p.obrigatorio) {
      throw invalido(`Ligue "${p.rotulo}" a um campo do pipe${p.fixos ? ' ou escolha um valor fixo' : ''}.`);
    }
  }
  return db.executar('INSERT INTO automacoes (pipe_id, fase_id, acao, mapeamento) VALUES (?, ?, ?, ?)', pipeId, faseId, acaoChave, JSON.stringify(limpo)).id;
}

function detalharPipe(db, id, busca) {
  const pipe = db.um('SELECT * FROM pipes WHERE id = ?', id);
  if (!pipe) throw naoEncontrado('Pipe');
  pipe.campos = db.todos('SELECT * FROM campos WHERE pipe_id = ? ORDER BY ordem, id', id).map((c) => ({ ...c, opcoes: json(c.opcoes, []) }));
  pipe.automacoes = db.todos(
    'SELECT a.*, f.nome fase_nome FROM automacoes a JOIN fases f ON f.id = a.fase_id WHERE a.pipe_id = ? ORDER BY f.ordem, a.id', id,
  ).map((a) => ({ ...a, mapeamento: json(a.mapeamento, {}), acao_rotulo: ACOES[a.acao]?.rotulo ?? a.acao }));
  const p = [id];
  let filtro = '';
  if (busca) { filtro = 'AND (titulo LIKE ? OR responsavel LIKE ?)'; p.push(`%${busca}%`, `%${busca}%`); }
  const cards = db.todos(`SELECT * FROM cards WHERE pipe_id = ? ${filtro} ORDER BY atualizado_em DESC`, ...p)
    .map((c) => ({ ...c, dados: json(c.dados, {}), vinculos: json(c.vinculos, []) }));
  pipe.fases = db.todos('SELECT * FROM fases WHERE pipe_id = ? ORDER BY ordem, id', id).map((f) => ({
    ...f,
    automacoes: pipe.automacoes.filter((a) => a.fase_id === f.id).length,
    cards: cards.filter((c) => c.fase_id === f.id),
  }));
  return pipe;
}

// ------------------------------------------------------------------ rotas

export function registrar(r) {
  r.get('/api/automacoes/acoes', () =>
    Object.entries(ACOES).map(([chave, a]) => ({ chave, rotulo: a.rotulo, modulo: a.modulo, parametros: a.parametros })),
  );

  r.get('/api/pipes', ({ db }) =>
    db.todos(
      `SELECT p.*,
         (SELECT COUNT(*) FROM cards c WHERE c.pipe_id = p.id AND c.concluido_em IS NULL) abertos,
         (SELECT COUNT(*) FROM cards c WHERE c.pipe_id = p.id AND c.concluido_em IS NOT NULL) concluidos,
         (SELECT COUNT(*) FROM cards c WHERE c.pipe_id = p.id AND c.concluido_em IS NULL AND c.vencimento < date('now')) atrasados,
         (SELECT COUNT(*) FROM automacoes a WHERE a.pipe_id = p.id AND a.ativo = 1) automacoes
       FROM pipes p ORDER BY p.nome`,
    ),
  );

  r.post('/api/pipes', ({ db, corpo, status }) => {
    status(201);
    return detalharPipe(db, criarPipe(db, corpo));
  });

  r.get('/api/pipes/:id', ({ db, params, query }) => detalharPipe(db, Number(params.id), query.busca));

  r.put('/api/pipes/:id', ({ db, params, corpo }) => {
    const { alteracoes } = db.executar(
      'UPDATE pipes SET nome = ?, descricao = ?, cor = ? WHERE id = ?',
      v.texto(corpo.nome, 'Nome', { obrigatorio: true, max: 80 }), v.texto(corpo.descricao, 'Descrição', { max: 300 }),
      /^#[0-9a-f]{6}$/i.test(corpo.cor ?? '') ? corpo.cor : '#4f46e5', Number(params.id),
    );
    if (!alteracoes) throw naoEncontrado('Pipe');
    return detalharPipe(db, Number(params.id));
  });

  r.delete('/api/pipes/:id', ({ db, params }) => {
    db.transacao(() => {
      db.executar('DELETE FROM automacoes WHERE pipe_id = ?', Number(params.id));
      db.executar('DELETE FROM cards WHERE pipe_id = ?', Number(params.id));
      db.executar('DELETE FROM pipes WHERE id = ?', Number(params.id));
    });
    return { ok: true };
  });

  // Fases
  r.post('/api/pipes/:id/fases', ({ db, params, corpo }) => {
    const pipeId = Number(params.id);
    if (!db.um('SELECT id FROM pipes WHERE id = ?', pipeId)) throw naoEncontrado('Pipe');
    const ordem = db.um('SELECT COALESCE(MAX(ordem), -1) + 1 o FROM fases WHERE pipe_id = ?', pipeId).o;
    db.executar('INSERT INTO fases (pipe_id, nome, ordem, concluida) VALUES (?, ?, ?, ?)', pipeId,
      v.texto(corpo.nome, 'Nome da fase', { obrigatorio: true, max: 60 }), ordem, !!corpo.concluida);
    return detalharPipe(db, pipeId);
  });
  r.post('/api/pipes/:id/fases/ordem', ({ db, params, corpo }) => {
    const pipeId = Number(params.id);
    const ids = v.lista(corpo.ids, 'Fases', { min: 1 }).map(Number);
    db.transacao(() => ids.forEach((id, i) => db.executar('UPDATE fases SET ordem = ? WHERE id = ? AND pipe_id = ?', i, id, pipeId)));
    return detalharPipe(db, pipeId);
  });
  r.put('/api/fases/:id', ({ db, params, corpo }) => {
    const f = db.um('SELECT * FROM fases WHERE id = ?', Number(params.id));
    if (!f) throw naoEncontrado('Fase');
    db.executar('UPDATE fases SET nome = ?, concluida = ? WHERE id = ?', v.texto(corpo.nome, 'Nome', { obrigatorio: true, max: 60 }), !!corpo.concluida, f.id);
    return detalharPipe(db, f.pipe_id);
  });
  r.delete('/api/fases/:id', ({ db, params }) => {
    const f = db.um('SELECT * FROM fases WHERE id = ?', Number(params.id));
    if (!f) throw naoEncontrado('Fase');
    if (db.um('SELECT COUNT(*) n FROM cards WHERE fase_id = ?', f.id).n) throw conflito('Mova os cards desta fase antes de excluí-la.');
    if (db.um('SELECT COUNT(*) n FROM fases WHERE pipe_id = ?', f.pipe_id).n <= 1) throw conflito('O pipe precisa de ao menos uma fase.');
    db.executar('DELETE FROM fases WHERE id = ?', f.id);
    return detalharPipe(db, f.pipe_id);
  });

  // Campos
  r.post('/api/pipes/:id/campos', ({ db, params, corpo }) => {
    const pipeId = Number(params.id);
    if (!db.um('SELECT id FROM pipes WHERE id = ?', pipeId)) throw naoEncontrado('Pipe');
    criarCampo(db, pipeId, corpo);
    return detalharPipe(db, pipeId);
  });
  r.delete('/api/campos/:id', ({ db, params }) => {
    const c = db.um('SELECT * FROM campos WHERE id = ?', Number(params.id));
    if (!c) throw naoEncontrado('Campo');
    const usado = db.todos('SELECT mapeamento FROM automacoes WHERE pipe_id = ?', c.pipe_id)
      .some((a) => Object.values(json(a.mapeamento, {})).some((m) => m.campo === c.chave));
    if (usado) throw conflito('Este campo é usado por uma automação. Remova a automação antes.');
    db.executar('DELETE FROM campos WHERE id = ?', c.id);
    return detalharPipe(db, c.pipe_id);
  });

  // Automações
  r.post('/api/pipes/:id/automacoes', ({ db, params, corpo }) => {
    const pipeId = Number(params.id);
    if (!db.um('SELECT id FROM pipes WHERE id = ?', pipeId)) throw naoEncontrado('Pipe');
    criarAutomacao(db, pipeId, corpo);
    return detalharPipe(db, pipeId);
  });
  r.patch('/api/automacoes/:id', ({ db, params, corpo }) => {
    const a = db.um('SELECT * FROM automacoes WHERE id = ?', Number(params.id));
    if (!a) throw naoEncontrado('Automação');
    db.executar('UPDATE automacoes SET ativo = ? WHERE id = ?', !!corpo.ativo, a.id);
    return detalharPipe(db, a.pipe_id);
  });
  r.delete('/api/automacoes/:id', ({ db, params }) => {
    const a = db.um('SELECT * FROM automacoes WHERE id = ?', Number(params.id));
    if (!a) throw naoEncontrado('Automação');
    db.executar('DELETE FROM automacoes WHERE id = ?', a.id);
    return detalharPipe(db, a.pipe_id);
  });

  // Cards
  r.post('/api/pipes/:id/cards', ({ db, params, corpo, usuario, status }) => {
    const id = criarCard(db, Number(params.id), corpo, usuario.nome);
    status(201);
    return lerCard(db, id);
  });
  r.get('/api/cards/:id', ({ db, params }) => {
    const c = lerCard(db, Number(params.id));
    c.fase = db.um('SELECT * FROM fases WHERE id = ?', c.fase_id);
    c.eventos = db.todos('SELECT * FROM card_eventos WHERE card_id = ? ORDER BY id DESC', c.id);
    return c;
  });
  r.put('/api/cards/:id', ({ db, params, corpo, usuario }) => {
    const c = lerCard(db, Number(params.id));
    const campos = db.todos('SELECT * FROM campos WHERE pipe_id = ? ORDER BY ordem, id', c.pipe_id);
    const dados = validarDados(db, campos, corpo.dados ?? c.dados, { exigirObrigatorios: true });
    db.executar(
      `UPDATE cards SET titulo = ?, dados = ?, responsavel = ?, vencimento = ?, atualizado_em = datetime('now') WHERE id = ?`,
      v.texto(corpo.titulo ?? c.titulo, 'Título', { obrigatorio: true, max: 200 }), JSON.stringify(dados),
      v.texto(corpo.responsavel, 'Responsável', { max: 100 }), v.data(corpo.vencimento, 'Vencimento'), c.id,
    );
    registrarEvento(db, c.id, 'editado', 'Dados do card atualizados', usuario.nome);
    return lerCard(db, c.id);
  });
  r.post('/api/cards/:id/mover', ({ db, params, corpo, usuario }) =>
    moverCard(db, Number(params.id), v.id(corpo.fase_id, 'Fase', { obrigatorio: true }), usuario.nome),
  );
  r.post('/api/cards/:id/comentarios', ({ db, params, corpo, usuario }) => {
    const c = lerCard(db, Number(params.id));
    registrarEvento(db, c.id, 'comentario', v.texto(corpo.texto, 'Comentário', { obrigatorio: true, max: 2000 }), usuario.nome);
    return { ok: true };
  });
  r.delete('/api/cards/:id', ({ db, params }) => {
    db.executar('DELETE FROM cards WHERE id = ?', Number(params.id));
    return { ok: true };
  });
}
