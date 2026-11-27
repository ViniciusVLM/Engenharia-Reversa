import * as v from '../lib/validar.js';
import { naoEncontrado, conflito, invalido } from '../lib/http.js';
import { hoje, competenciaAnterior, diaDoMesSeguinte, ultimoDiaDaCompetencia } from '../lib/datas.js';
import { calcularNota, cfop, natureza, chaveSimulada } from '../dominio/impostos.js';
import { empresa } from './cadastros.js';
import { gerarParcelas, cancelarTitulosDaOrigem, criarTitulo } from './financeiro.js';

const TRIBUTOS = ['icms', 'ipi', 'pis', 'cofins'];

/** Prepara itens (busca produto, aplica preço padrão) e calcula os tributos. Não grava nada. */
export function simularNota(db, { tipo, parceiroId, itens }) {
  const parceiro = db.um('SELECT * FROM parceiros WHERE id = ? AND ativo = 1', parceiroId);
  if (!parceiro) throw invalido(tipo === 'entrada' ? 'Fornecedor não encontrado.' : 'Cliente não encontrado.');
  const emp = empresa(db);
  const interestadual = parceiro.uf !== emp.uf;
  const preparados = itens.map((i, idx) => {
    const produto = db.um('SELECT * FROM produtos WHERE id = ?', v.id(i.produto_id, `Produto do item ${idx + 1}`, { obrigatorio: true }));
    if (!produto) throw invalido(`Produto do item ${idx + 1} não encontrado.`);
    const quantidade = v.numero(i.quantidade, `Quantidade do item ${idx + 1}`, { obrigatorio: true, min: 0.0001 });
    const valorUnitario =
      v.centavos(i.valor_unitario, `Valor unitário do item ${idx + 1}`) ?? (tipo === 'entrada' ? produto.custo : produto.preco);
    return {
      produto,
      quantidade,
      valorUnitario,
      aliqIcms: produto.aliq_icms,
      aliqIpi: produto.aliq_ipi,
      aliqPis: produto.aliq_pis,
      aliqCofins: produto.aliq_cofins,
    };
  });
  const calculo = calcularNota(preparados, { interestadual });
  return {
    parceiro,
    interestadual,
    cfop: cfop(tipo, interestadual),
    natureza: natureza(tipo),
    itens: calculo.itens.map((c, i) => ({ ...c, produto: preparados[i].produto })),
    totais: calculo.totais,
  };
}

/**
 * Emite uma nota (simulada): grava, movimenta estoque e gera títulos no Financeiro.
 * Entrada → contas a pagar (compras). Saída → contas a receber (vendas).
 */
export function emitirNota(db, { tipo, parceiroId, itens, condicao = '30', emissao = hoje(), pedidoId = null, numero = null }) {
  const cond = v.condicaoPagamento(condicao);
  const sim = simularNota(db, { tipo, parceiroId, itens });

  if (tipo === 'saida') {
    // Agrupa por produto para validar estoque total
    const porProduto = new Map();
    for (const i of sim.itens) porProduto.set(i.produto.id, (porProduto.get(i.produto.id) ?? 0) + i.quantidade);
    for (const [pid, qtd] of porProduto) {
      const p = db.um('SELECT descricao, estoque FROM produtos WHERE id = ?', pid);
      if (p.estoque < qtd) throw conflito(`Estoque insuficiente de "${p.descricao}": disponível ${p.estoque}, solicitado ${qtd}.`);
    }
  }

  return db.transacao(() => {
    const emp = empresa(db);
    const num = numero ?? db.proximoNumero(tipo === 'saida' ? 'NF-saida' : 'NF-entrada');
    const t = sim.totais;
    const chave = chaveSimulada({ uf: tipo === 'saida' ? emp.uf : sim.parceiro.uf, emissao, cnpj: tipo === 'saida' ? emp.cnpj : sim.parceiro.documento, serie: 1, numero: num });
    const notaId = db.executar(
      `INSERT INTO notas (tipo, numero, chave, parceiro_id, emissao, cfop, natureza, condicao,
         valor_produtos, valor_icms, valor_ipi, valor_pis, valor_cofins, valor_total, pedido_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tipo, num, chave, parceiroId, emissao, sim.cfop, sim.natureza, cond.texto,
      t.valorProdutos, t.valorIcms, t.valorIpi, t.valorPis, t.valorCofins, t.valorTotal, pedidoId,
    ).id;

    for (const i of sim.itens) {
      db.executar(
        `INSERT INTO nota_itens (nota_id, produto_id, quantidade, valor_unitario, valor_total,
           aliq_icms, valor_icms, aliq_ipi, valor_ipi, aliq_pis, valor_pis, aliq_cofins, valor_cofins)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        notaId, i.produto.id, i.quantidade, i.valorUnitario, i.valorTotal,
        i.aliqIcms, i.valorIcms, i.aliqIpi, i.valorIpi, i.aliqPis, i.valorPis, i.aliqCofins, i.valorCofins,
      );
      db.executar('UPDATE produtos SET estoque = estoque + ? WHERE id = ?', tipo === 'entrada' ? i.quantidade : -i.quantidade, i.produto.id);
    }

    gerarParcelas(db, {
      tipo: tipo === 'entrada' ? 'pagar' : 'receber',
      descricao: `NF ${tipo === 'entrada' ? 'entrada' : 'saída'} ${num} — ${sim.parceiro.nome}`,
      parceiroId,
      categoria: tipo === 'entrada' ? 'compras' : 'vendas',
      origem: 'nota',
      origemId: notaId,
      valor: t.valorTotal,
      dataBase: emissao,
      dias: cond.dias,
    });
    return notaId;
  });
}

export function detalharNota(db, id) {
  const nota = db.um(
    `SELECT n.*, p.nome parceiro_nome, p.documento parceiro_documento, p.uf parceiro_uf, pe.numero pedido_numero
     FROM notas n JOIN parceiros p ON p.id = n.parceiro_id LEFT JOIN pedidos pe ON pe.id = n.pedido_id WHERE n.id = ?`, id,
  );
  if (!nota) throw naoEncontrado('Nota');
  nota.itens = db.todos(
    `SELECT i.*, pr.codigo, pr.descricao, pr.unidade, pr.ncm FROM nota_itens i JOIN produtos pr ON pr.id = i.produto_id WHERE i.nota_id = ?`, id,
  );
  nota.titulos = db.todos(`SELECT * FROM titulos WHERE origem = 'nota' AND origem_id = ? ORDER BY vencimento`, id);
  return nota;
}

/** Débitos (saídas) x créditos (entradas) por tributo, com saldo credor transportado do mês anterior. */
export function apurar(db, comp) {
  const somar = (tipo) =>
    db.um(
      `SELECT COALESCE(SUM(valor_icms),0) icms, COALESCE(SUM(valor_ipi),0) ipi, COALESCE(SUM(valor_pis),0) pis,
              COALESCE(SUM(valor_cofins),0) cofins, COUNT(*) notas, COALESCE(SUM(valor_total),0) total
       FROM notas WHERE tipo = ? AND status = 'emitida' AND substr(emissao, 1, 7) = ?`, tipo, comp,
    );
  const debitos = somar('saida');
  const creditos = somar('entrada');

  // saldo credor do mês anterior (se a apuração dele foi gerada)
  const anterior = db.um('SELECT dados FROM apuracoes WHERE competencia = ?', competenciaAnterior(comp));
  const credorAnterior = anterior ? JSON.parse(anterior.dados).credorTransportar : { icms: 0, ipi: 0, pis: 0, cofins: 0 };

  const tributos = TRIBUTOS.map((t) => {
    const saldo = debitos[t] - creditos[t] - (credorAnterior[t] ?? 0);
    return {
      tributo: t,
      debitos: debitos[t],
      creditos: creditos[t],
      credorAnterior: credorAnterior[t] ?? 0,
      aRecolher: Math.max(0, saldo),
      credorTransportar: Math.max(0, -saldo),
    };
  });

  const gerada = db.um('SELECT gerada_em FROM apuracoes WHERE competencia = ?', comp);
  return {
    competencia: comp,
    notasSaida: debitos.notas,
    notasEntrada: creditos.notas,
    faturamento: debitos.total,
    compras: creditos.total,
    tributos,
    totalRecolher: tributos.reduce((s, t) => s + t.aRecolher, 0),
    credorTransportar: Object.fromEntries(tributos.map((t) => [t.tributo, t.credorTransportar])),
    gerada: gerada?.gerada_em ?? null,
  };
}

const VENCIMENTO_GUIA = { icms: 20, ipi: 25, pis: 25, cofins: 25 };

export function registrar(r) {
  r.get('/api/fiscal/notas', ({ db, query }) => {
    const where = [];
    const p = [];
    if (query.tipo) { where.push('n.tipo = ?'); p.push(query.tipo); }
    if (query.status) { where.push('n.status = ?'); p.push(query.status); }
    if (query.competencia) { where.push('substr(n.emissao, 1, 7) = ?'); p.push(query.competencia); }
    if (query.busca) { where.push('(p.nome LIKE ? OR CAST(n.numero AS TEXT) = ?)'); p.push(`%${query.busca}%`, query.busca); }
    return db.todos(
      `SELECT n.id, n.tipo, n.numero, n.serie, n.emissao, n.cfop, n.valor_total, n.valor_icms, n.status, p.nome parceiro_nome
       FROM notas n JOIN parceiros p ON p.id = n.parceiro_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY n.emissao DESC, n.id DESC LIMIT 500`, ...p,
    );
  });

  r.get('/api/fiscal/notas/:id', ({ db, params }) => detalharNota(db, Number(params.id)));

  r.post('/api/fiscal/notas/simular', ({ db, corpo }) => {
    const tipo = v.opcao(corpo.tipo, 'Tipo', ['entrada', 'saida'], { padrao: 'saida' });
    const sim = simularNota(db, { tipo, parceiroId: v.id(corpo.parceiro_id, 'Parceiro', { obrigatorio: true }), itens: v.lista(corpo.itens, 'Itens', { min: 1 }) });
    return { ...sim, parceiro: { id: sim.parceiro.id, nome: sim.parceiro.nome, uf: sim.parceiro.uf } };
  });

  r.post('/api/fiscal/notas/saida', ({ db, corpo, status }) => {
    const id = emitirNota(db, {
      tipo: 'saida',
      parceiroId: v.id(corpo.parceiro_id, 'Cliente', { obrigatorio: true }),
      itens: v.lista(corpo.itens, 'Itens', { min: 1 }),
      condicao: corpo.condicao,
      emissao: v.data(corpo.emissao, 'Emissão') ?? hoje(),
    });
    status(201);
    return detalharNota(db, id);
  });

  r.post('/api/fiscal/notas/:id/cancelar', ({ db, params }) => {
    const nota = db.um('SELECT * FROM notas WHERE id = ?', Number(params.id));
    if (!nota) throw naoEncontrado('Nota');
    if (nota.status === 'cancelada') throw conflito('Nota já está cancelada.');
    if (nota.tipo === 'entrada') throw conflito('Notas de entrada são canceladas pelo emitente (fornecedor). Registre uma devolução.');
    if (db.um('SELECT 1 FROM apuracoes WHERE competencia = ?', nota.emissao.slice(0, 7))) {
      throw conflito('A apuração desta competência já foi gerada. Não é possível cancelar a nota.');
    }
    db.transacao(() => {
      cancelarTitulosDaOrigem(db, 'nota', nota.id);
      for (const i of db.todos('SELECT produto_id, quantidade FROM nota_itens WHERE nota_id = ?', nota.id)) {
        db.executar('UPDATE produtos SET estoque = estoque + ? WHERE id = ?', i.quantidade, i.produto_id);
      }
      db.executar(`UPDATE notas SET status = 'cancelada' WHERE id = ?`, nota.id);
    });
    return detalharNota(db, nota.id);
  });

  r.get('/api/fiscal/apuracao', ({ db, query }) => apurar(db, v.competencia(query.competencia ?? hoje().slice(0, 7))));

  r.post('/api/fiscal/apuracao/:competencia/gerar', ({ db, params }) => {
    const comp = v.competencia(params.competencia);
    gerarApuracao(db, comp);
    return apurar(db, comp);
  });
}

/** Fecha a apuração do mês e lança as guias (contas a pagar) no Financeiro. */
export function gerarApuracao(db, comp) {
  if (db.um('SELECT 1 FROM apuracoes WHERE competencia = ?', comp)) throw conflito('Apuração desta competência já foi gerada.');
  if (ultimoDiaDaCompetencia(comp) >= hoje()) throw conflito('Só é possível gerar a apuração depois de encerrado o mês.');
  const ap = apurar(db, comp);
  db.transacao(() => {
    for (const t of ap.tributos) {
      if (t.aRecolher <= 0) continue;
      criarTitulo(db, {
        tipo: 'pagar',
        descricao: `${t.tributo.toUpperCase()} — apuração ${comp}`,
        categoria: 'impostos',
        origem: 'apuracao',
        valor: t.aRecolher,
        vencimento: diaDoMesSeguinte(comp, VENCIMENTO_GUIA[t.tributo]),
      });
    }
    db.executar('INSERT INTO apuracoes (competencia, dados) VALUES (?, ?)', comp, JSON.stringify(ap));
  });
}
