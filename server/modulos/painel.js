import * as v from '../lib/validar.js';
import { ErroHttp } from '../lib/http.js';
import { hoje, somarDias } from '../lib/datas.js';
import { conferirSenha, emitirToken } from '../lib/auth.js';
import { saldoTotal, fluxoDeCaixa } from './financeiro.js';
import { alertasContratos } from './rh.js';
import { apurar } from './fiscal.js';
import { empresa } from './cadastros.js';

export function registrar(r) {
  r.post('/api/auth/login', ({ db, corpo, segredo }) => {
    const email = v.texto(corpo.email, 'E-mail', { obrigatorio: true });
    const senha = v.texto(corpo.senha, 'Senha', { obrigatorio: true });
    const u = db.um('SELECT * FROM usuarios WHERE email = ?', email);
    if (!u || !conferirSenha(senha, u.senha_hash)) throw new ErroHttp(401, 'E-mail ou senha incorretos.');
    return { token: emitirToken(segredo, u), usuario: { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil } };
  }, { publica: true });

  r.get('/api/auth/eu', ({ db, usuario }) => db.um('SELECT id, nome, email, perfil FROM usuarios WHERE id = ?', usuario.id));

  r.get('/api/saude', () => ({ ok: true, servico: 'alicerce-erp', hora: new Date().toISOString() }), { publica: true });

  r.get('/api/painel', ({ db }) => {
    const d = hoje();
    const n = (sql, ...p) => db.um(sql, ...p).n;
    const fluxo = fluxoDeCaixa(db, 30);
    return {
      empresa: empresa(db),
      hoje: d,
      financeiro: {
        saldo: saldoTotal(db),
        pagarVencido: n(`SELECT COALESCE(SUM(valor),0) n FROM titulos WHERE tipo='pagar' AND status='aberto' AND vencimento < ?`, d),
        receberVencido: n(`SELECT COALESCE(SUM(valor),0) n FROM titulos WHERE tipo='receber' AND status='aberto' AND vencimento < ?`, d),
        pagar7: n(`SELECT COALESCE(SUM(valor),0) n FROM titulos WHERE tipo='pagar' AND status='aberto' AND vencimento BETWEEN ? AND ?`, d, somarDias(d, 7)),
        receber7: n(`SELECT COALESCE(SUM(valor),0) n FROM titulos WHERE tipo='receber' AND status='aberto' AND vencimento BETWEEN ? AND ?`, d, somarDias(d, 7)),
        saldoProjetado30: fluxo.saldoFinal,
        serie: fluxo.serie,
      },
      compras: {
        pendentes: n(`SELECT COUNT(*) n FROM solicitacoes WHERE status = 'pendente'`),
        aprovadas: n(`SELECT COUNT(*) n FROM solicitacoes WHERE status = 'aprovada'`),
        pedidosAbertos: n(`SELECT COUNT(*) n FROM pedidos WHERE status IN ('aberto','enviado')`),
        atrasados: n(`SELECT COUNT(*) n FROM pedidos WHERE status IN ('aberto','enviado') AND previsao < ?`, d),
      },
      rh: {
        ativos: db.todos(`SELECT vinculo, COUNT(*) n FROM colaboradores WHERE status = 'ativo' GROUP BY vinculo`),
        alertas: alertasContratos(db, 60).slice(0, 6),
        ultimaFolha: db.um('SELECT competencia, status, bruto, liquido FROM folhas ORDER BY competencia DESC LIMIT 1'),
      },
      fiscal: (() => {
        const a = apurar(db, d.slice(0, 7));
        return { competencia: a.competencia, faturamento: a.faturamento, compras: a.compras, totalRecolher: a.totalRecolher };
      })(),
      processos: db.todos(
        `SELECT p.id, p.nome, p.cor,
           (SELECT COUNT(*) FROM cards c WHERE c.pipe_id = p.id AND c.concluido_em IS NULL) abertos,
           (SELECT COUNT(*) FROM cards c WHERE c.pipe_id = p.id AND c.concluido_em IS NULL AND c.vencimento < ?) atrasados
         FROM pipes p ORDER BY p.nome`, d,
      ),
      estoqueBaixo: db.todos('SELECT id, codigo, descricao, estoque, unidade FROM produtos WHERE ativo = 1 AND estoque <= 5 ORDER BY estoque LIMIT 6'),
    };
  });
}
