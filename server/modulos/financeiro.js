import * as v from '../lib/validar.js';
import { conflito, naoEncontrado, invalido } from '../lib/http.js';
import { hoje, somarDias } from '../lib/datas.js';

export const CATEGORIAS = ['compras', 'vendas', 'folha', 'impostos', 'servicos', 'aluguel', 'outros'];

// ------------------------------------------------------------------ serviços (usados por outros módulos)

/** Divide um valor em parcelas pelos dias da condição; a última absorve o resto dos centavos. */
export function gerarParcelas(db, { tipo, descricao, parceiroId = null, categoria, origem, origemId = null, valor, dataBase, dias }) {
  const n = dias.length;
  const base = Math.floor(valor / n);
  const ids = [];
  dias.forEach((d, i) => {
    const valorParcela = i === n - 1 ? valor - base * (n - 1) : base;
    if (valorParcela <= 0) return;
    const r = db.executar(
      `INSERT INTO titulos (tipo, descricao, parceiro_id, categoria, origem, origem_id, parcela, valor, vencimento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tipo, descricao, parceiroId, categoria, origem, origemId, `${i + 1}/${n}`, valorParcela, somarDias(dataBase, d),
    );
    ids.push(r.id);
  });
  return ids;
}

export function criarTitulo(db, { tipo, descricao, parceiroId = null, categoria = 'outros', origem = 'manual', origemId = null, valor, vencimento }) {
  return db.executar(
    `INSERT INTO titulos (tipo, descricao, parceiro_id, categoria, origem, origem_id, valor, vencimento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tipo, descricao, parceiroId, categoria, origem, origemId, valor, vencimento,
  ).id;
}

/** Cancela os títulos abertos de uma origem. Bloqueia se algum já foi pago. */
export function cancelarTitulosDaOrigem(db, origem, origemId) {
  const pagos = db.um(`SELECT COUNT(*) n FROM titulos WHERE origem = ? AND origem_id = ? AND status = 'pago'`, origem, origemId).n;
  if (pagos > 0) throw conflito('Existem títulos já pagos ligados a este registro. Estorne as baixas no Financeiro antes.');
  return db.executar(`UPDATE titulos SET status = 'cancelado' WHERE origem = ? AND origem_id = ? AND status = 'aberto'`, origem, origemId).alteracoes;
}

export function saldoConta(db, contaId) {
  return db.um(
    `SELECT c.saldo_inicial + COALESCE((SELECT SUM(valor) FROM movimentos WHERE conta_id = c.id), 0) saldo
     FROM contas c WHERE c.id = ?`, contaId,
  )?.saldo ?? 0;
}

export function saldoTotal(db) {
  return db.um(`SELECT COALESCE((SELECT SUM(saldo_inicial) FROM contas), 0) + COALESCE((SELECT SUM(valor) FROM movimentos), 0) s`).s;
}

export function baixarTitulo(db, tituloId, { contaId, data, valor }) {
  const t = db.um('SELECT * FROM titulos WHERE id = ?', tituloId);
  if (!t) throw naoEncontrado('Título');
  if (t.status !== 'aberto') throw conflito(`Título está ${t.status}; só títulos em aberto podem ser baixados.`);
  if (!db.um('SELECT id FROM contas WHERE id = ?', contaId)) throw invalido('Conta bancária não encontrada.');
  const pago = valor ?? t.valor;
  db.transacao(() => {
    db.executar(`UPDATE titulos SET status = 'pago', pago_em = ?, valor_pago = ?, conta_id = ? WHERE id = ?`, data, pago, contaId, tituloId);
    db.executar(
      'INSERT INTO movimentos (conta_id, data, valor, descricao, titulo_id) VALUES (?, ?, ?, ?, ?)',
      contaId, data, t.tipo === 'receber' ? pago : -pago, `${t.tipo === 'receber' ? 'Recebimento' : 'Pagamento'}: ${t.descricao} (${t.parcela})`, tituloId,
    );
  });
}

// ------------------------------------------------------------------ consultas

const SELECT_TITULO = `
  SELECT t.*, p.nome parceiro_nome, c.nome conta_nome,
         CASE WHEN t.status = 'aberto' AND t.vencimento < ? THEN 1 ELSE 0 END vencido
  FROM titulos t
  LEFT JOIN parceiros p ON p.id = t.parceiro_id
  LEFT JOIN contas c ON c.id = t.conta_id`;

export function listarTitulos(db, f = {}) {
  const where = [];
  const p = [hoje()];
  if (f.tipo) { where.push('t.tipo = ?'); p.push(f.tipo); }
  if (f.status === 'vencido') { where.push(`t.status = 'aberto' AND t.vencimento < ?`); p.push(hoje()); }
  else if (f.status) { where.push('t.status = ?'); p.push(f.status); }
  if (f.categoria) { where.push('t.categoria = ?'); p.push(f.categoria); }
  if (f.de) { where.push('t.vencimento >= ?'); p.push(f.de); }
  if (f.ate) { where.push('t.vencimento <= ?'); p.push(f.ate); }
  if (f.origem) { where.push('t.origem = ? AND t.origem_id = ?'); p.push(f.origem, Number(f.origem_id)); }
  if (f.busca) { where.push('(t.descricao LIKE ? OR p.nome LIKE ?)'); p.push(`%${f.busca}%`, `%${f.busca}%`); }
  const sql = `${SELECT_TITULO} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE t.status WHEN 'aberto' THEN 0 ELSE 1 END, t.vencimento, t.id LIMIT 500`;
  return db.todos(sql, ...p);
}

export function fluxoDeCaixa(db, dias) {
  const inicio = hoje();
  const fim = somarDias(inicio, dias);
  const saldoInicial = saldoTotal(db);
  const atrasados = db.um(
    `SELECT COALESCE(SUM(CASE WHEN tipo='receber' THEN valor END),0) receber,
            COALESCE(SUM(CASE WHEN tipo='pagar' THEN valor END),0) pagar
     FROM titulos WHERE status = 'aberto' AND vencimento < ?`, inicio,
  );
  const porDia = db.todos(
    `SELECT vencimento data,
            COALESCE(SUM(CASE WHEN tipo='receber' THEN valor END),0) entradas,
            COALESCE(SUM(CASE WHEN tipo='pagar' THEN valor END),0) saidas
     FROM titulos WHERE status = 'aberto' AND vencimento BETWEEN ? AND ?
     GROUP BY vencimento`, inicio, fim,
  );
  const mapa = new Map(porDia.map((d) => [d.data, d]));
  const serie = [];
  let saldo = saldoInicial;
  for (let i = 0; i <= dias; i++) {
    const data = somarDias(inicio, i);
    const d = mapa.get(data) ?? { entradas: 0, saidas: 0 };
    saldo += d.entradas - d.saidas;
    serie.push({ data, entradas: d.entradas, saidas: d.saidas, saldo });
  }
  return { saldoInicial, atrasados, serie, saldoFinal: saldo };
}

// ------------------------------------------------------------------ rotas

export function registrar(r) {
  r.get('/api/financeiro/titulos', ({ db, query }) => listarTitulos(db, query));

  r.get('/api/financeiro/titulos/:id', ({ db, params }) => {
    const t = db.um(`${SELECT_TITULO} WHERE t.id = ?`, hoje(), Number(params.id));
    if (!t) throw naoEncontrado('Título');
    return t;
  });

  r.post('/api/financeiro/titulos', ({ db, corpo, status }) => {
    const tipo = v.opcao(corpo.tipo, 'Tipo', ['pagar', 'receber']);
    const descricao = v.texto(corpo.descricao, 'Descrição', { obrigatorio: true, max: 200 });
    const valor = v.centavos(corpo.valor, 'Valor', { obrigatorio: true, positivo: true });
    const vencimento = v.data(corpo.vencimento, 'Vencimento', { obrigatorio: true });
    const categoria = v.opcao(corpo.categoria, 'Categoria', CATEGORIAS, { padrao: 'outros' });
    const parceiroId = v.id(corpo.parceiro_id, 'Parceiro');
    const parcelas = v.inteiro(corpo.parcelas, 'Parcelas', { min: 1, max: 48 }) ?? 1;
    if (parceiroId && !db.um('SELECT id FROM parceiros WHERE id = ?', parceiroId)) throw invalido('Parceiro não encontrado.');
    const dias = Array.from({ length: parcelas }, (_, i) => i * 30);
    const ids = db.transacao(() =>
      gerarParcelas(db, { tipo, descricao, parceiroId, categoria, origem: 'manual', valor, dataBase: vencimento, dias }),
    );
    status(201);
    return { ids };
  });

  r.post('/api/financeiro/titulos/:id/baixar', ({ db, params, corpo }) => {
    baixarTitulo(db, Number(params.id), {
      contaId: v.id(corpo.conta_id, 'Conta', { obrigatorio: true }),
      data: v.data(corpo.data, 'Data do pagamento') ?? hoje(),
      valor: v.centavos(corpo.valor, 'Valor pago', { positivo: true }),
    });
    return { ok: true };
  });

  r.post('/api/financeiro/titulos/:id/estornar', ({ db, params }) => {
    const t = db.um('SELECT * FROM titulos WHERE id = ?', Number(params.id));
    if (!t) throw naoEncontrado('Título');
    if (t.status !== 'pago') throw conflito('Só títulos pagos podem ser estornados.');
    db.transacao(() => {
      db.executar('DELETE FROM movimentos WHERE titulo_id = ?', t.id);
      db.executar(`UPDATE titulos SET status = 'aberto', pago_em = NULL, valor_pago = NULL, conta_id = NULL WHERE id = ?`, t.id);
    });
    return { ok: true };
  });

  r.post('/api/financeiro/titulos/:id/cancelar', ({ db, params }) => {
    const t = db.um('SELECT * FROM titulos WHERE id = ?', Number(params.id));
    if (!t) throw naoEncontrado('Título');
    if (t.status !== 'aberto') throw conflito('Só títulos em aberto podem ser cancelados.');
    if (t.origem !== 'manual') {
      throw conflito('Este título foi gerado por outro módulo (nota, folha ou apuração). Cancele pela origem.');
    }
    db.executar(`UPDATE titulos SET status = 'cancelado' WHERE id = ?`, t.id);
    return { ok: true };
  });

  r.get('/api/financeiro/contas', ({ db }) =>
    db.todos('SELECT * FROM contas ORDER BY nome').map((c) => ({ ...c, saldo: saldoConta(db, c.id) })),
  );

  r.post('/api/financeiro/contas', ({ db, corpo, status }) => {
    const nome = v.texto(corpo.nome, 'Nome', { obrigatorio: true, max: 80 });
    const id = db.executar(
      'INSERT INTO contas (nome, banco, agencia, numero, saldo_inicial) VALUES (?, ?, ?, ?, ?)',
      nome, v.texto(corpo.banco, 'Banco'), v.texto(corpo.agencia, 'Agência'), v.texto(corpo.numero, 'Número'),
      v.inteiro(corpo.saldo_inicial, 'Saldo inicial') ?? 0,
    ).id;
    status(201);
    return { id };
  });

  r.get('/api/financeiro/extrato', ({ db, query }) => {
    const contaId = v.id(query.conta_id, 'Conta', { obrigatorio: true });
    const conta = db.um('SELECT * FROM contas WHERE id = ?', contaId);
    if (!conta) throw naoEncontrado('Conta');
    const movimentos = db.todos('SELECT * FROM movimentos WHERE conta_id = ? ORDER BY data DESC, id DESC LIMIT 300', contaId);
    return { conta: { ...conta, saldo: saldoConta(db, contaId) }, movimentos };
  });

  r.get('/api/financeiro/fluxo', ({ db, query }) => {
    const dias = v.inteiro(query.dias, 'Dias', { min: 7, max: 180 }) ?? 30;
    return fluxoDeCaixa(db, dias);
  });

  r.get('/api/financeiro/resumo', ({ db }) => {
    const d = hoje();
    const soma = (sql, ...p) => db.um(sql, ...p).v;
    return {
      saldo: saldoTotal(db),
      pagarVencido: soma(`SELECT COALESCE(SUM(valor),0) v FROM titulos WHERE tipo='pagar' AND status='aberto' AND vencimento < ?`, d),
      receberVencido: soma(`SELECT COALESCE(SUM(valor),0) v FROM titulos WHERE tipo='receber' AND status='aberto' AND vencimento < ?`, d),
      pagar30: soma(`SELECT COALESCE(SUM(valor),0) v FROM titulos WHERE tipo='pagar' AND status='aberto' AND vencimento BETWEEN ? AND ?`, d, somarDias(d, 30)),
      receber30: soma(`SELECT COALESCE(SUM(valor),0) v FROM titulos WHERE tipo='receber' AND status='aberto' AND vencimento BETWEEN ? AND ?`, d, somarDias(d, 30)),
    };
  });
}
