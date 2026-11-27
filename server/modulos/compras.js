import * as v from '../lib/validar.js';
import { naoEncontrado, conflito, invalido } from '../lib/http.js';
import { hoje } from '../lib/datas.js';
import { emitirNota } from './fiscal.js';

const fmt = (prefixo, n) => `${prefixo}-${String(n).padStart(5, '0')}`;

// ------------------------------------------------------------------ serviços

export function criarSolicitacao(db, { solicitante, departamentoId = null, justificativa = null, itens, origemCardId = null }) {
  const lidos = v.lista(itens, 'Itens', { min: 1 }).map((i, idx) => {
    const produtoId = v.id(i.produto_id, `Produto do item ${idx + 1}`, { obrigatorio: true });
    if (!db.um('SELECT id FROM produtos WHERE id = ? AND ativo = 1', produtoId)) throw invalido(`Produto do item ${idx + 1} não encontrado.`);
    return { produtoId, quantidade: v.numero(i.quantidade, `Quantidade do item ${idx + 1}`, { obrigatorio: true, min: 0.0001 }) };
  });
  if (departamentoId && !db.um('SELECT id FROM departamentos WHERE id = ?', departamentoId)) throw invalido('Departamento não encontrado.');
  return db.transacao(() => {
    const numero = fmt('SC', db.proximoNumero('SC'));
    const id = db.executar(
      'INSERT INTO solicitacoes (numero, solicitante, departamento_id, justificativa, origem_card_id) VALUES (?, ?, ?, ?, ?)',
      numero, solicitante, departamentoId, justificativa, origemCardId,
    ).id;
    for (const i of lidos) db.executar('INSERT INTO solicitacao_itens (solicitacao_id, produto_id, quantidade) VALUES (?, ?, ?)', id, i.produtoId, i.quantidade);
    return { id, numero };
  });
}

export function decidirSolicitacao(db, id, { aprovar, motivo, usuario }) {
  const s = db.um('SELECT * FROM solicitacoes WHERE id = ?', id);
  if (!s) throw naoEncontrado('Solicitação');
  if (s.status !== 'pendente') throw conflito(`Solicitação já está ${s.status}.`);
  if (!aprovar && !motivo) throw invalido('Informe o motivo da reprovação.');
  db.executar(
    `UPDATE solicitacoes SET status = ?, motivo = ?, decidido_em = datetime('now'), decidido_por = ? WHERE id = ?`,
    aprovar ? 'aprovada' : 'reprovada', motivo ?? null, usuario, id,
  );
}

export function criarPedido(db, { fornecedorId, solicitacaoId = null, condicao, previsao = null, itens }) {
  const fornecedor = db.um(`SELECT * FROM parceiros WHERE id = ? AND ativo = 1 AND tipo IN ('fornecedor','ambos')`, fornecedorId);
  if (!fornecedor) throw invalido('Fornecedor não encontrado.');
  const cond = v.condicaoPagamento(condicao);
  const lidos = v.lista(itens, 'Itens', { min: 1 }).map((i, idx) => {
    const produto = db.um('SELECT * FROM produtos WHERE id = ?', v.id(i.produto_id, `Produto do item ${idx + 1}`, { obrigatorio: true }));
    if (!produto) throw invalido(`Produto do item ${idx + 1} não encontrado.`);
    return {
      produtoId: produto.id,
      quantidade: v.numero(i.quantidade, `Quantidade do item ${idx + 1}`, { obrigatorio: true, min: 0.0001 }),
      preco: v.centavos(i.preco, `Preço do item ${idx + 1}`) ?? produto.custo,
    };
  });
  return db.transacao(() => {
    if (solicitacaoId) {
      const s = db.um('SELECT status FROM solicitacoes WHERE id = ?', solicitacaoId);
      if (!s) throw naoEncontrado('Solicitação');
      if (s.status !== 'aprovada') throw conflito('Só solicitações aprovadas viram pedido de compra.');
      db.executar(`UPDATE solicitacoes SET status = 'atendida' WHERE id = ?`, solicitacaoId);
    }
    const numero = fmt('PC', db.proximoNumero('PC'));
    const total = lidos.reduce((s, i) => s + Math.round(i.quantidade * i.preco), 0);
    const id = db.executar(
      'INSERT INTO pedidos (numero, fornecedor_id, solicitacao_id, condicao, previsao, total) VALUES (?, ?, ?, ?, ?, ?)',
      numero, fornecedorId, solicitacaoId, cond.texto, previsao, total,
    ).id;
    for (const i of lidos) db.executar('INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco) VALUES (?, ?, ?, ?)', id, i.produtoId, i.quantidade, i.preco);
    return { id, numero };
  });
}

/** Recebimento: gera a NF de entrada (Fiscal), dá entrada no estoque e cria as contas a pagar (Financeiro). */
export function receberPedido(db, id, { emissao = hoje(), numeroNf = null } = {}) {
  const p = db.um('SELECT * FROM pedidos WHERE id = ?', id);
  if (!p) throw naoEncontrado('Pedido');
  if (!['aberto', 'enviado'].includes(p.status)) throw conflito(`Pedido está ${p.status}; não pode ser recebido.`);
  const itens = db.todos('SELECT produto_id, quantidade, preco valor_unitario FROM pedido_itens WHERE pedido_id = ?', id);
  return db.transacao(() => {
    const notaId = emitirNota(db, {
      tipo: 'entrada', parceiroId: p.fornecedor_id, itens, condicao: p.condicao, emissao, pedidoId: id, numero: numeroNf,
    });
    db.executar(`UPDATE pedidos SET status = 'recebido', recebido_em = ?, nota_id = ? WHERE id = ?`, emissao, notaId, id);
    return notaId;
  });
}

function detalharSolicitacao(db, id) {
  const s = db.um(
    `SELECT s.*, d.nome departamento_nome FROM solicitacoes s LEFT JOIN departamentos d ON d.id = s.departamento_id WHERE s.id = ?`, id,
  );
  if (!s) throw naoEncontrado('Solicitação');
  s.itens = db.todos(
    `SELECT i.*, p.codigo, p.descricao, p.unidade, p.custo FROM solicitacao_itens i JOIN produtos p ON p.id = i.produto_id WHERE i.solicitacao_id = ?`, id,
  );
  s.estimado = s.itens.reduce((t, i) => t + Math.round(i.quantidade * i.custo), 0);
  s.pedido = db.um('SELECT id, numero, status FROM pedidos WHERE solicitacao_id = ?', id);
  return s;
}

function detalharPedido(db, id) {
  const p = db.um(
    `SELECT pe.*, f.nome fornecedor_nome, f.uf fornecedor_uf, s.numero solicitacao_numero, n.numero nota_numero
     FROM pedidos pe JOIN parceiros f ON f.id = pe.fornecedor_id
     LEFT JOIN solicitacoes s ON s.id = pe.solicitacao_id LEFT JOIN notas n ON n.id = pe.nota_id WHERE pe.id = ?`, id,
  );
  if (!p) throw naoEncontrado('Pedido');
  p.itens = db.todos(
    `SELECT i.*, pr.codigo, pr.descricao, pr.unidade FROM pedido_itens i JOIN produtos pr ON pr.id = i.produto_id WHERE i.pedido_id = ?`, id,
  );
  return p;
}

// ------------------------------------------------------------------ rotas

export function registrar(r) {
  r.get('/api/compras/solicitacoes', ({ db, query }) => {
    const p = [];
    let where = '';
    if (query.status) { where = 'WHERE s.status = ?'; p.push(query.status); }
    return db.todos(
      `SELECT s.*, d.nome departamento_nome,
              (SELECT COUNT(*) FROM solicitacao_itens WHERE solicitacao_id = s.id) itens,
              (SELECT COALESCE(SUM(ROUND(i.quantidade * pr.custo)),0) FROM solicitacao_itens i JOIN produtos pr ON pr.id = i.produto_id WHERE i.solicitacao_id = s.id) estimado
       FROM solicitacoes s LEFT JOIN departamentos d ON d.id = s.departamento_id ${where}
       ORDER BY CASE s.status WHEN 'pendente' THEN 0 WHEN 'aprovada' THEN 1 ELSE 2 END, s.id DESC LIMIT 300`, ...p,
    );
  });

  r.get('/api/compras/solicitacoes/:id', ({ db, params }) => detalharSolicitacao(db, Number(params.id)));

  r.post('/api/compras/solicitacoes', ({ db, corpo, usuario, status }) => {
    const s = criarSolicitacao(db, {
      solicitante: v.texto(corpo.solicitante, 'Solicitante', { max: 100 }) ?? usuario.nome,
      departamentoId: v.id(corpo.departamento_id, 'Departamento'),
      justificativa: v.texto(corpo.justificativa, 'Justificativa', { max: 1000 }),
      itens: corpo.itens,
    });
    status(201);
    return detalharSolicitacao(db, s.id);
  });

  r.post('/api/compras/solicitacoes/:id/aprovar', ({ db, params, usuario }) => {
    decidirSolicitacao(db, Number(params.id), { aprovar: true, usuario: usuario.nome });
    return detalharSolicitacao(db, Number(params.id));
  });

  r.post('/api/compras/solicitacoes/:id/reprovar', ({ db, params, corpo, usuario }) => {
    decidirSolicitacao(db, Number(params.id), { aprovar: false, motivo: v.texto(corpo.motivo, 'Motivo', { max: 500 }), usuario: usuario.nome });
    return detalharSolicitacao(db, Number(params.id));
  });

  r.post('/api/compras/solicitacoes/:id/pedido', ({ db, params, corpo, status }) => {
    const s = detalharSolicitacao(db, Number(params.id));
    const itens = Array.isArray(corpo.itens) && corpo.itens.length
      ? corpo.itens
      : s.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade }));
    const p = criarPedido(db, {
      fornecedorId: v.id(corpo.fornecedor_id, 'Fornecedor', { obrigatorio: true }),
      solicitacaoId: s.id,
      condicao: corpo.condicao,
      previsao: v.data(corpo.previsao, 'Previsão de entrega'),
      itens,
    });
    status(201);
    return detalharPedido(db, p.id);
  });

  r.get('/api/compras/pedidos', ({ db, query }) => {
    const p = [];
    let where = '';
    if (query.status) { where = 'WHERE pe.status = ?'; p.push(query.status); }
    return db.todos(
      `SELECT pe.*, f.nome fornecedor_nome FROM pedidos pe JOIN parceiros f ON f.id = pe.fornecedor_id ${where}
       ORDER BY CASE pe.status WHEN 'aberto' THEN 0 WHEN 'enviado' THEN 1 ELSE 2 END, pe.id DESC LIMIT 300`, ...p,
    );
  });

  r.get('/api/compras/pedidos/:id', ({ db, params }) => detalharPedido(db, Number(params.id)));

  r.post('/api/compras/pedidos', ({ db, corpo, status }) => {
    const p = criarPedido(db, {
      fornecedorId: v.id(corpo.fornecedor_id, 'Fornecedor', { obrigatorio: true }),
      condicao: corpo.condicao,
      previsao: v.data(corpo.previsao, 'Previsão de entrega'),
      itens: corpo.itens,
    });
    status(201);
    return detalharPedido(db, p.id);
  });

  r.post('/api/compras/pedidos/:id/enviar', ({ db, params }) => {
    const p = detalharPedido(db, Number(params.id));
    if (p.status !== 'aberto') throw conflito('Só pedidos em aberto podem ser enviados ao fornecedor.');
    db.executar(`UPDATE pedidos SET status = 'enviado' WHERE id = ?`, p.id);
    return detalharPedido(db, p.id);
  });

  r.post('/api/compras/pedidos/:id/receber', ({ db, params, corpo }) => {
    receberPedido(db, Number(params.id), {
      emissao: v.data(corpo.emissao, 'Data de emissão da NF') ?? hoje(),
      numeroNf: v.inteiro(corpo.numero_nf, 'Número da NF', { min: 1 }),
    });
    return detalharPedido(db, Number(params.id));
  });

  r.post('/api/compras/pedidos/:id/cancelar', ({ db, params }) => {
    const p = detalharPedido(db, Number(params.id));
    if (!['aberto', 'enviado'].includes(p.status)) throw conflito('Pedido recebido não pode ser cancelado.');
    db.transacao(() => {
      db.executar(`UPDATE pedidos SET status = 'cancelado' WHERE id = ?`, p.id);
      if (p.solicitacao_id) db.executar(`UPDATE solicitacoes SET status = 'aprovada' WHERE id = ?`, p.solicitacao_id);
    });
    return detalharPedido(db, p.id);
  });
}
