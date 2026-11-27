import * as v from '../lib/validar.js';
import { naoEncontrado, conflito, invalido } from '../lib/http.js';
import { hoje, somarDias, somarMeses, diaDoMesSeguinte, ultimoDiaDaCompetencia, diasEntre } from '../lib/datas.js';
import { calcularHolerite } from '../dominio/folha.js';
import { criarTitulo, cancelarTitulosDaOrigem } from './financeiro.js';

export const VINCULOS = ['clt', 'aprendiz', 'estagiario'];

// ------------------------------------------------------------------ serviços

function lerColaborador(db, c) {
  const d = {
    nome: v.texto(c.nome, 'Nome', { obrigatorio: true, max: 150 }),
    cpf: v.texto(c.cpf, 'CPF', { max: 14 }),
    email: v.texto(c.email, 'E-mail', { max: 150 }),
    telefone: v.texto(c.telefone, 'Telefone', { max: 30 }),
    departamento_id: v.id(c.departamento_id, 'Departamento'),
    cargo: v.texto(c.cargo, 'Cargo', { max: 100 }),
    vinculo: v.opcao(c.vinculo, 'Vínculo', VINCULOS),
    salario: v.centavos(c.salario, c.vinculo === 'estagiario' ? 'Bolsa' : 'Salário', { obrigatorio: true, positivo: true }),
    dependentes: v.inteiro(c.dependentes, 'Dependentes', { min: 0, max: 20 }) ?? 0,
    admissao: v.data(c.admissao, 'Data de admissão', { obrigatorio: true }),
    fim_contrato: v.data(c.fim_contrato, 'Fim do contrato'),
    instituicao: v.texto(c.instituicao, 'Instituição de ensino', { max: 150 }),
  };
  if (d.cpf && !/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(d.cpf)) throw invalido('CPF deve ter 11 dígitos.');
  if (d.departamento_id && !db.um('SELECT id FROM departamentos WHERE id = ?', d.departamento_id)) throw invalido('Departamento não encontrado.');
  if (d.vinculo !== 'clt') {
    const lei = d.vinculo === 'aprendiz' ? 'Lei 10.097/2000' : 'Lei 11.788/2008';
    if (!d.fim_contrato) throw invalido(`Contrato de ${d.vinculo === 'aprendiz' ? 'aprendizagem' : 'estágio'} exige data de término (${lei}).`);
    if (d.fim_contrato <= d.admissao) throw invalido('Fim do contrato deve ser posterior à admissão.');
    if (d.fim_contrato > somarMeses(d.admissao, 24)) throw invalido(`Contrato não pode passar de 2 anos (${lei}).`);
    if (!d.instituicao) throw invalido(d.vinculo === 'aprendiz' ? 'Informe a entidade formadora do aprendiz.' : 'Informe a instituição de ensino do estagiário.');
  }
  return d;
}

export function admitirColaborador(db, corpo, { origemCardId = null } = {}) {
  const d = lerColaborador(db, corpo);
  return db.executar(
    `INSERT INTO colaboradores (nome, cpf, email, telefone, departamento_id, cargo, vinculo, salario, dependentes, admissao, fim_contrato, instituicao, origem_card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    d.nome, d.cpf, d.email, d.telefone, d.departamento_id, d.cargo, d.vinculo, d.salario, d.dependentes, d.admissao,
    d.fim_contrato, d.instituicao, origemCardId,
  ).id;
}

/** 5º dia útil do mês seguinte (sem considerar feriados). */
export function quintoDiaUtil(comp) {
  let data = diaDoMesSeguinte(comp, 1);
  let uteis = 0;
  for (;;) {
    const dia = new Date(`${data}T00:00:00Z`).getUTCDay();
    if (dia !== 0 && dia !== 6) uteis++;
    if (uteis === 5) return data;
    data = somarDias(data, 1);
  }
}

export function calcularFolha(db, comp) {
  const existente = db.um('SELECT * FROM folhas WHERE competencia = ?', comp);
  if (existente?.status === 'fechada') throw conflito('Folha fechada. Reabra para recalcular.');
  const inicio = `${comp}-01`;
  const fim = ultimoDiaDaCompetencia(comp);
  const colaboradores = db.todos(
    `SELECT * FROM colaboradores WHERE admissao <= ? AND (desligamento IS NULL OR desligamento >= ?) ORDER BY nome`, fim, inicio,
  );
  if (!colaboradores.length) throw conflito('Não há colaboradores ativos nesta competência.');

  return db.transacao(() => {
    const folhaId = existente?.id ?? db.executar('INSERT INTO folhas (competencia) VALUES (?)', comp).id;
    db.executar('DELETE FROM folha_itens WHERE folha_id = ?', folhaId);
    const tot = { bruto: 0, inss: 0, irrf: 0, fgts: 0, liquido: 0 };
    for (const c of colaboradores) {
      // Mês comercial de 30 dias; proporcional em admissão/desligamento no mês
      const de = c.admissao > inicio ? c.admissao : inicio;
      const ate = c.desligamento && c.desligamento < fim ? c.desligamento : fim;
      const mesCheio = de === inicio && ate === fim;
      const dias = mesCheio ? 30 : Math.min(30, diasEntre(de, ate) + 1);
      const salario = Math.round((c.salario * dias) / 30);
      const h = calcularHolerite({ salario, vinculo: c.vinculo, dependentes: c.dependentes, competencia: comp });
      h.memoria.diasTrabalhados = dias;
      h.memoria.salarioContratual = c.salario;
      db.executar(
        `INSERT INTO folha_itens (folha_id, colaborador_id, vinculo, salario, inss, irrf, fgts, liquido, memoria)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        folhaId, c.id, c.vinculo, h.salario, h.inss, h.irrf, h.fgts, h.liquido, JSON.stringify(h.memoria),
      );
      tot.bruto += h.salario; tot.inss += h.inss; tot.irrf += h.irrf; tot.fgts += h.fgts; tot.liquido += h.liquido;
    }
    db.executar(
      `UPDATE folhas SET bruto=?, inss=?, irrf=?, fgts=?, liquido=?, calculada_em=datetime('now') WHERE id=?`,
      tot.bruto, tot.inss, tot.irrf, tot.fgts, tot.liquido, folhaId,
    );
    return folhaId;
  });
}

export function fecharFolha(db, comp) {
  const f = db.um('SELECT * FROM folhas WHERE competencia = ?', comp);
  if (!f) throw naoEncontrado('Folha');
  if (f.status === 'fechada') throw conflito('Folha já está fechada.');
  db.transacao(() => {
    const lancar = (descricao, valor, vencimento) =>
      valor > 0 && criarTitulo(db, { tipo: 'pagar', descricao, categoria: 'folha', origem: 'folha', origemId: f.id, valor, vencimento });
    lancar(`Salários e bolsas — ${comp}`, f.liquido, quintoDiaUtil(comp));
    lancar(`FGTS — ${comp}`, f.fgts, diaDoMesSeguinte(comp, 20));
    lancar(`INSS retido — ${comp}`, f.inss, diaDoMesSeguinte(comp, 20));
    lancar(`IRRF — ${comp}`, f.irrf, diaDoMesSeguinte(comp, 20));
    db.executar(`UPDATE folhas SET status = 'fechada', fechada_em = datetime('now') WHERE id = ?`, f.id);
  });
}

function detalharFolha(db, comp) {
  const f = db.um('SELECT * FROM folhas WHERE competencia = ?', comp);
  if (!f) return { competencia: comp, status: 'nao_calculada', itens: [], titulos: [] };
  f.itens = db.todos(
    `SELECT i.*, c.nome, c.cargo, d.nome departamento_nome FROM folha_itens i
     JOIN colaboradores c ON c.id = i.colaborador_id LEFT JOIN departamentos d ON d.id = c.departamento_id
     WHERE i.folha_id = ? ORDER BY c.nome`, f.id,
  ).map((i) => ({ ...i, memoria: JSON.parse(i.memoria) }));
  f.titulos = db.todos(`SELECT * FROM titulos WHERE origem = 'folha' AND origem_id = ? ORDER BY vencimento`, f.id);
  return f;
}

export function alertasContratos(db, dias = 60) {
  const d = hoje();
  return db.todos(
    `SELECT c.id, c.nome, c.vinculo, c.fim_contrato, c.instituicao, d.nome departamento_nome
     FROM colaboradores c LEFT JOIN departamentos d ON d.id = c.departamento_id
     WHERE c.status = 'ativo' AND c.vinculo IN ('aprendiz','estagiario') AND c.fim_contrato <= ?
     ORDER BY c.fim_contrato`, somarDias(d, dias),
  ).map((c) => ({ ...c, dias: diasEntre(d, c.fim_contrato) }));
}

// ------------------------------------------------------------------ rotas

export function registrar(r) {
  r.get('/api/rh/colaboradores', ({ db, query }) => {
    const where = [];
    const p = [];
    if (query.status) { where.push('c.status = ?'); p.push(query.status); }
    if (query.vinculo) { where.push('c.vinculo = ?'); p.push(query.vinculo); }
    if (query.departamento_id) { where.push('c.departamento_id = ?'); p.push(Number(query.departamento_id)); }
    if (query.busca) { where.push('(c.nome LIKE ? OR c.cargo LIKE ?)'); p.push(`%${query.busca}%`, `%${query.busca}%`); }
    return db.todos(
      `SELECT c.id, c.nome, c.cargo, c.vinculo, c.salario, c.admissao, c.fim_contrato, c.status, c.desligamento, d.nome departamento_nome
       FROM colaboradores c LEFT JOIN departamentos d ON d.id = c.departamento_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.status, c.nome`, ...p,
    );
  });

  r.get('/api/rh/colaboradores/:id', ({ db, params }) => {
    const c = db.um(
      `SELECT c.*, d.nome departamento_nome FROM colaboradores c LEFT JOIN departamentos d ON d.id = c.departamento_id WHERE c.id = ?`,
      Number(params.id),
    );
    if (!c) throw naoEncontrado('Colaborador');
    c.holerites = db.todos(
      `SELECT f.competencia, f.status, i.salario, i.inss, i.irrf, i.fgts, i.liquido FROM folha_itens i
       JOIN folhas f ON f.id = i.folha_id WHERE i.colaborador_id = ? ORDER BY f.competencia DESC LIMIT 24`, c.id,
    );
    return c;
  });

  r.post('/api/rh/colaboradores', ({ db, corpo, status }) => {
    status(201);
    return { id: admitirColaborador(db, corpo) };
  });

  r.put('/api/rh/colaboradores/:id', ({ db, params, corpo }) => {
    const d = lerColaborador(db, corpo);
    const { alteracoes } = db.executar(
      `UPDATE colaboradores SET nome=?, cpf=?, email=?, telefone=?, departamento_id=?, cargo=?, vinculo=?, salario=?, dependentes=?,
         admissao=?, fim_contrato=?, instituicao=? WHERE id=?`,
      d.nome, d.cpf, d.email, d.telefone, d.departamento_id, d.cargo, d.vinculo, d.salario, d.dependentes, d.admissao, d.fim_contrato,
      d.instituicao, Number(params.id),
    );
    if (!alteracoes) throw naoEncontrado('Colaborador');
    return { ok: true };
  });

  r.post('/api/rh/colaboradores/:id/desligar', ({ db, params, corpo }) => {
    const c = db.um('SELECT * FROM colaboradores WHERE id = ?', Number(params.id));
    if (!c) throw naoEncontrado('Colaborador');
    if (c.status === 'desligado') throw conflito('Colaborador já está desligado.');
    const data = v.data(corpo.data, 'Data de desligamento') ?? hoje();
    if (data < c.admissao) throw invalido('Desligamento não pode ser anterior à admissão.');
    db.executar(`UPDATE colaboradores SET status = 'desligado', desligamento = ? WHERE id = ?`, data, c.id);
    return { ok: true };
  });

  r.get('/api/rh/alertas', ({ db, query }) => alertasContratos(db, v.inteiro(query.dias, 'Dias', { min: 1, max: 365 }) ?? 60));

  r.get('/api/rh/folhas', ({ db }) => db.todos('SELECT * FROM folhas ORDER BY competencia DESC'));
  r.get('/api/rh/folhas/:competencia', ({ db, params }) => detalharFolha(db, v.competencia(params.competencia)));
  r.post('/api/rh/folhas/:competencia/calcular', ({ db, params }) => {
    const comp = v.competencia(params.competencia);
    calcularFolha(db, comp);
    return detalharFolha(db, comp);
  });
  r.post('/api/rh/folhas/:competencia/fechar', ({ db, params }) => {
    const comp = v.competencia(params.competencia);
    fecharFolha(db, comp);
    return detalharFolha(db, comp);
  });
  r.post('/api/rh/folhas/:competencia/reabrir', ({ db, params }) => {
    const comp = v.competencia(params.competencia);
    const f = db.um('SELECT * FROM folhas WHERE competencia = ?', comp);
    if (!f) throw naoEncontrado('Folha');
    if (f.status !== 'fechada') throw conflito('Folha não está fechada.');
    db.transacao(() => {
      cancelarTitulosDaOrigem(db, 'folha', f.id);
      db.executar(`UPDATE folhas SET status = 'aberta', fechada_em = NULL WHERE id = ?`, f.id);
    });
    return detalharFolha(db, comp);
  });

  r.post('/api/rh/simular', ({ corpo }) =>
    calcularHolerite({
      salario: v.centavos(corpo.salario, 'Salário', { obrigatorio: true, positivo: true }),
      vinculo: v.opcao(corpo.vinculo, 'Vínculo', VINCULOS, { padrao: 'clt' }),
      dependentes: v.inteiro(corpo.dependentes, 'Dependentes', { min: 0, max: 20 }) ?? 0,
      competencia: corpo.competencia ? v.competencia(corpo.competencia) : hoje().slice(0, 7),
    }),
  );
}
