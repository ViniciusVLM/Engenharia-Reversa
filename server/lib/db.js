import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(aqui, '..', 'db', 'schema.sql'), 'utf8');

/**
 * Abre (ou cria) o banco SQLite e aplica o schema.
 * Devolve um objeto com atalhos para consultas e transações.
 */
export function abrirBanco(caminho) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const nativo = new DatabaseSync(caminho);
  nativo.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  nativo.exec(SCHEMA);
  return criarAcesso(nativo);
}

function limpar(params) {
  // node:sqlite não aceita undefined nem boolean
  return params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
}

function criarAcesso(nativo) {
  const cache = new Map();
  let profundidade = 0;

  const preparar = (sql) => {
    let stmt = cache.get(sql);
    if (!stmt) {
      stmt = nativo.prepare(sql);
      cache.set(sql, stmt);
    }
    return stmt;
  };

  const db = {
    nativo,
    todos: (sql, ...p) => preparar(sql).all(...limpar(p)),
    um: (sql, ...p) => preparar(sql).get(...limpar(p)) ?? null,
    executar(sql, ...p) {
      const r = preparar(sql).run(...limpar(p));
      return { alteracoes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    exec: (sql) => nativo.exec(sql),
    /** Transação com suporte a aninhamento (via SAVEPOINT). */
    transacao(fn) {
      const nivel = profundidade;
      const ponto = `sp_${nivel}`;
      nativo.exec(nivel === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${ponto}`);
      profundidade++;
      try {
        const r = fn();
        nativo.exec(nivel === 0 ? 'COMMIT' : `RELEASE ${ponto}`);
        return r;
      } catch (e) {
        nativo.exec(nivel === 0 ? 'ROLLBACK' : `ROLLBACK TO ${ponto}; RELEASE ${ponto}`);
        throw e;
      } finally {
        profundidade = nivel;
      }
    },
    /** Próximo número de uma série (SC, PC, NF-entrada...). */
    proximoNumero(serie) {
      nativo.prepare('INSERT INTO sequencias (serie, ultimo) VALUES (?, 0) ON CONFLICT(serie) DO NOTHING').run(serie);
      nativo.prepare('UPDATE sequencias SET ultimo = ultimo + 1 WHERE serie = ?').run(serie);
      return Number(nativo.prepare('SELECT ultimo FROM sequencias WHERE serie = ?').get(serie).ultimo);
    },
    config(chave, padrao = null) {
      const r = preparar('SELECT valor FROM config WHERE chave = ?').get(chave);
      return r ? JSON.parse(r.valor) : padrao;
    },
    definirConfig(chave, valor) {
      preparar('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
        .run(chave, JSON.stringify(valor));
    },
    fechar: () => nativo.close(),
  };
  return db;
}
