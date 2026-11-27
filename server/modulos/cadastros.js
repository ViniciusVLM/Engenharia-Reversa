import * as v from '../lib/validar.js';
import { naoEncontrado, conflito } from '../lib/http.js';

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export function empresa(db) {
  return db.config('empresa', { nome: 'Minha Empresa Ltda', cnpj: '', uf: 'SP' });
}

function lerParceiro(c) {
  return {
    tipo: v.opcao(c.tipo, 'Tipo', ['fornecedor', 'cliente', 'ambos']),
    nome: v.texto(c.nome, 'Nome', { obrigatorio: true, max: 150 }),
    documento: v.texto(c.documento, 'CNPJ/CPF', { max: 20 }),
    email: v.texto(c.email, 'E-mail', { max: 150 }),
    telefone: v.texto(c.telefone, 'Telefone', { max: 30 }),
    uf: v.opcao(c.uf, 'UF', UFS, { padrao: 'SP' }),
  };
}

function lerProduto(c) {
  const aliq = (x, rotulo, padrao) => v.numero(x, rotulo, { min: 0, max: 100 }) ?? padrao;
  return {
    codigo: v.texto(c.codigo, 'Código', { obrigatorio: true, max: 30 }),
    descricao: v.texto(c.descricao, 'Descrição', { obrigatorio: true, max: 150 }),
    unidade: v.texto(c.unidade, 'Unidade', { max: 6 }) ?? 'UN',
    ncm: v.texto(c.ncm, 'NCM', { max: 10 }),
    custo: v.centavos(c.custo, 'Custo') ?? 0,
    preco: v.centavos(c.preco, 'Preço de venda') ?? 0,
    aliq_icms: aliq(c.aliq_icms, 'ICMS', 18),
    aliq_ipi: aliq(c.aliq_ipi, 'IPI', 0),
    aliq_pis: aliq(c.aliq_pis, 'PIS', 1.65),
    aliq_cofins: aliq(c.aliq_cofins, 'COFINS', 7.6),
  };
}

export function registrar(r) {
  // Empresa
  r.get('/api/empresa', ({ db }) => empresa(db));
  r.put('/api/empresa', ({ db, corpo }) => {
    const dados = {
      nome: v.texto(corpo.nome, 'Razão social', { obrigatorio: true, max: 150 }),
      cnpj: v.texto(corpo.cnpj, 'CNPJ', { max: 20 }) ?? '',
      uf: v.opcao(corpo.uf, 'UF', UFS),
    };
    db.definirConfig('empresa', dados);
    return dados;
  });

  // Parceiros (fornecedores e clientes)
  r.get('/api/parceiros', ({ db, query }) => {
    const where = ['ativo = 1'];
    const p = [];
    if (query.tipo === 'fornecedor' || query.tipo === 'cliente') {
      where.push(`tipo IN (?, 'ambos')`);
      p.push(query.tipo);
    }
    if (query.busca) {
      where.push('(nome LIKE ? OR documento LIKE ?)');
      p.push(`%${query.busca}%`, `%${query.busca}%`);
    }
    return db.todos(`SELECT * FROM parceiros WHERE ${where.join(' AND ')} ORDER BY nome`, ...p);
  });
  r.get('/api/parceiros/:id', ({ db, params }) => {
    const p = db.um('SELECT * FROM parceiros WHERE id = ?', Number(params.id));
    if (!p) throw naoEncontrado('Parceiro');
    return p;
  });
  r.post('/api/parceiros', ({ db, corpo, status }) => {
    const d = lerParceiro(corpo);
    const id = db.executar(
      'INSERT INTO parceiros (tipo, nome, documento, email, telefone, uf) VALUES (?, ?, ?, ?, ?, ?)',
      d.tipo, d.nome, d.documento, d.email, d.telefone, d.uf,
    ).id;
    status(201);
    return { id };
  });
  r.put('/api/parceiros/:id', ({ db, params, corpo }) => {
    const d = lerParceiro(corpo);
    const { alteracoes } = db.executar(
      'UPDATE parceiros SET tipo=?, nome=?, documento=?, email=?, telefone=?, uf=? WHERE id=?',
      d.tipo, d.nome, d.documento, d.email, d.telefone, d.uf, Number(params.id),
    );
    if (!alteracoes) throw naoEncontrado('Parceiro');
    return { ok: true };
  });
  r.delete('/api/parceiros/:id', ({ db, params }) => {
    db.executar('UPDATE parceiros SET ativo = 0 WHERE id = ?', Number(params.id));
    return { ok: true };
  });

  // Produtos
  r.get('/api/produtos', ({ db, query }) => {
    const p = [];
    let where = 'ativo = 1';
    if (query.busca) {
      where += ' AND (codigo LIKE ? OR descricao LIKE ?)';
      p.push(`%${query.busca}%`, `%${query.busca}%`);
    }
    return db.todos(`SELECT * FROM produtos WHERE ${where} ORDER BY descricao`, ...p);
  });
  r.get('/api/produtos/:id', ({ db, params }) => {
    const p = db.um('SELECT * FROM produtos WHERE id = ?', Number(params.id));
    if (!p) throw naoEncontrado('Produto');
    return p;
  });
  r.post('/api/produtos', ({ db, corpo, status }) => {
    const d = lerProduto(corpo);
    if (db.um('SELECT id FROM produtos WHERE codigo = ?', d.codigo)) throw conflito('Já existe um produto com este código.');
    const id = db.executar(
      `INSERT INTO produtos (codigo, descricao, unidade, ncm, custo, preco, aliq_icms, aliq_ipi, aliq_pis, aliq_cofins, estoque)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.codigo, d.descricao, d.unidade, d.ncm, d.custo, d.preco, d.aliq_icms, d.aliq_ipi, d.aliq_pis, d.aliq_cofins,
      v.numero(corpo.estoque, 'Estoque inicial', { min: 0 }) ?? 0,
    ).id;
    status(201);
    return { id };
  });
  r.put('/api/produtos/:id', ({ db, params, corpo }) => {
    const d = lerProduto(corpo);
    const dono = db.um('SELECT id FROM produtos WHERE codigo = ?', d.codigo);
    if (dono && dono.id !== Number(params.id)) throw conflito('Já existe um produto com este código.');
    const { alteracoes } = db.executar(
      `UPDATE produtos SET codigo=?, descricao=?, unidade=?, ncm=?, custo=?, preco=?, aliq_icms=?, aliq_ipi=?, aliq_pis=?, aliq_cofins=? WHERE id=?`,
      d.codigo, d.descricao, d.unidade, d.ncm, d.custo, d.preco, d.aliq_icms, d.aliq_ipi, d.aliq_pis, d.aliq_cofins, Number(params.id),
    );
    if (!alteracoes) throw naoEncontrado('Produto');
    return { ok: true };
  });
  r.delete('/api/produtos/:id', ({ db, params }) => {
    db.executar('UPDATE produtos SET ativo = 0 WHERE id = ?', Number(params.id));
    return { ok: true };
  });

  // Departamentos
  r.get('/api/departamentos', ({ db }) =>
    db.todos(`SELECT d.*, (SELECT COUNT(*) FROM colaboradores c WHERE c.departamento_id = d.id AND c.status = 'ativo') colaboradores
              FROM departamentos d ORDER BY nome`),
  );
  r.post('/api/departamentos', ({ db, corpo, status }) => {
    const nome = v.texto(corpo.nome, 'Nome', { obrigatorio: true, max: 80 });
    if (db.um('SELECT id FROM departamentos WHERE nome = ?', nome)) throw conflito('Departamento já existe.');
    status(201);
    return { id: db.executar('INSERT INTO departamentos (nome) VALUES (?)', nome).id };
  });
}
