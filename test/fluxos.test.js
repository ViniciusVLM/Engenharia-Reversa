import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from '../server/lib/db.js';
import { criarApp } from '../server/app.js';
import { popularDemo } from '../server/db/seed.js';

// Testes de ponta a ponta pela API, com banco em memória e a empresa de demonstração.
// A data é fixa para que os resultados não dependam do dia em que o teste roda.
process.env.ALICERCE_HOJE = '2026-11-27';
let servidor;
let base;
let token;
let db;

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, dados: await r.json().catch(() => null) };
}
const get = (c) => chamar('GET', c);
const post = (c, b = {}) => chamar('POST', c, b);

before(async () => {
  db = abrirBanco(':memory:');
  popularDemo(db);
  servidor = criarApp(db, { log: false });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  const login = await post('/api/auth/login', { email: 'admin@alicerce.dev', senha: 'alicerce123' });
  assert.equal(login.status, 200);
  token = login.dados.token;
});

after(() => {
  servidor.close();
  db.fechar();
});

test('API exige autenticação e rejeita senha errada', async () => {
  const salvo = token;
  token = null;
  assert.equal((await get('/api/painel')).status, 401);
  assert.equal((await post('/api/auth/login', { email: 'admin@alicerce.dev', senha: 'errada' })).status, 401);
  token = 'abc.def';
  assert.equal((await get('/api/painel')).status, 401);
  token = salvo;
});

test('Compras → Fiscal → Financeiro: recebimento gera NF de entrada, estoque e contas a pagar', async () => {
  const produtos = (await get('/api/produtos')).dados;
  const cadeira = produtos.find((p) => p.codigo === 'CAD-ERG');
  const fornecedor = (await get('/api/parceiros?tipo=fornecedor')).dados.find((f) => f.uf === 'MG');

  const sc = await post('/api/compras/solicitacoes', { itens: [{ produto_id: cadeira.id, quantidade: 5 }], justificativa: 'teste' });
  assert.equal(sc.status, 201);
  assert.equal(sc.dados.status, 'pendente');

  // não vira pedido sem aprovação
  assert.equal((await post(`/api/compras/solicitacoes/${sc.dados.id}/pedido`, { fornecedor_id: fornecedor.id })).status, 409);
  assert.equal((await post(`/api/compras/solicitacoes/${sc.dados.id}/aprovar`)).dados.status, 'aprovada');

  const pc = await post(`/api/compras/solicitacoes/${sc.dados.id}/pedido`, {
    fornecedor_id: fornecedor.id, condicao: '30/60', itens: [{ produto_id: cadeira.id, quantidade: 5, preco: 80000 }],
  });
  assert.equal(pc.status, 201);
  assert.equal(pc.dados.total, 400000);

  const recebido = await post(`/api/compras/pedidos/${pc.dados.id}/receber`, { emissao: '2026-11-20' });
  assert.equal(recebido.dados.status, 'recebido');

  const nota = (await get(`/api/fiscal/notas/${recebido.dados.nota_id}`)).dados;
  assert.equal(nota.tipo, 'entrada');
  assert.equal(nota.cfop, '2102', 'fornecedor de MG → entrada interestadual');
  assert.equal(nota.valor_icms, 48000, 'ICMS interestadual de 12%');
  assert.equal(nota.valor_ipi, 20000, 'IPI de 5% da cadeira');
  assert.equal(nota.valor_total, 420000);
  assert.equal(nota.titulos.length, 2);
  assert.equal(nota.titulos.reduce((s, t) => s + t.valor, 0), 420000);
  assert.deepEqual(nota.titulos.map((t) => t.vencimento), ['2026-12-20', '2027-01-19']);

  const depois = (await get(`/api/produtos/${cadeira.id}`)).dados;
  assert.equal(depois.estoque, cadeira.estoque + 5);
  assert.equal((await get(`/api/compras/solicitacoes/${sc.dados.id}`)).dados.status, 'atendida');
});

test('Venda: bloqueia sem estoque; emite, baixa estoque, gera receber; cancelamento desfaz', async () => {
  const produtos = (await get('/api/produtos')).dados;
  const cafe = produtos.find((p) => p.codigo === 'CAF-1K');
  const cliente = (await get('/api/parceiros?tipo=cliente')).dados.find((c) => c.uf === 'SP');

  const semEstoque = await post('/api/fiscal/notas/saida', { parceiro_id: cliente.id, itens: [{ produto_id: cafe.id, quantidade: cafe.estoque + 1 }] });
  assert.equal(semEstoque.status, 409);
  assert.match(semEstoque.dados.erro, /Estoque insuficiente/);

  const nf = await post('/api/fiscal/notas/saida', { parceiro_id: cliente.id, condicao: '0/30', itens: [{ produto_id: cafe.id, quantidade: 2 }] });
  assert.equal(nf.status, 201);
  assert.equal(nf.dados.cfop, '5102');
  assert.equal(nf.dados.titulos.length, 2);
  assert.ok(nf.dados.titulos.every((t) => t.tipo === 'receber'));
  assert.equal((await get(`/api/produtos/${cafe.id}`)).dados.estoque, cafe.estoque - 2);

  const cancelada = await post(`/api/fiscal/notas/${nf.dados.id}/cancelar`);
  assert.equal(cancelada.dados.status, 'cancelada');
  assert.ok(cancelada.dados.titulos.every((t) => t.status === 'cancelado'));
  assert.equal((await get(`/api/produtos/${cafe.id}`)).dados.estoque, cafe.estoque);
});

test('Financeiro: baixa movimenta o banco; estorno desfaz; título de outro módulo não é cancelado à mão', async () => {
  const contas = (await get('/api/financeiro/contas')).dados;
  const conta = contas[0];
  const novo = await post('/api/financeiro/titulos', { tipo: 'pagar', descricao: 'Teste', valor: 12345, vencimento: '2026-12-10' });
  const id = novo.dados.ids[0];

  await post(`/api/financeiro/titulos/${id}/baixar`, { conta_id: conta.id, data: '2026-11-27' });
  const aposBaixa = (await get('/api/financeiro/contas')).dados.find((c) => c.id === conta.id);
  assert.equal(aposBaixa.saldo, conta.saldo - 12345);
  assert.equal((await post(`/api/financeiro/titulos/${id}/baixar`, { conta_id: conta.id })).status, 409);

  await post(`/api/financeiro/titulos/${id}/estornar`);
  assert.equal((await get('/api/financeiro/contas')).dados.find((c) => c.id === conta.id).saldo, conta.saldo);

  const deNota = (await get('/api/financeiro/titulos?status=aberto')).dados.find((t) => t.origem === 'nota');
  assert.equal((await post(`/api/financeiro/titulos/${deNota.id}/cancelar`)).status, 409);

  const parcelado = await post('/api/financeiro/titulos', { tipo: 'receber', descricao: 'Parcelado', valor: 1000, vencimento: '2026-12-01', parcelas: 3 });
  const parcelas = (await get('/api/financeiro/titulos?tipo=receber&busca=Parcelado')).dados;
  assert.equal(parcelado.dados.ids.length, 3);
  assert.deepEqual(parcelas.map((t) => t.valor), [333, 333, 334]);
});

test('RH: aprendiz exige contrato de até 2 anos; folha fecha e lança no Financeiro; reabrir cancela', async () => {
  const invalido = await post('/api/rh/colaboradores', { nome: 'Teste', vinculo: 'aprendiz', salario: 115000, admissao: '2026-11-01', fim_contrato: '2029-01-01', instituicao: 'X' });
  assert.equal(invalido.status, 422);
  assert.match(invalido.dados.erro, /2 anos/);

  const ok = await post('/api/rh/colaboradores', { nome: 'Nova Aprendiz', vinculo: 'aprendiz', salario: 120000, admissao: '2026-11-16', fim_contrato: '2027-11-15', instituicao: 'Entidade X' });
  assert.equal(ok.status, 201);

  const folha = (await post('/api/rh/folhas/2026-11/calcular')).dados;
  const item = folha.itens.find((i) => i.nome === 'Nova Aprendiz');
  assert.equal(item.memoria.diasTrabalhados, 15, 'admitida no dia 16 → 15 dias');
  assert.equal(item.salario, 60000);
  assert.equal(item.fgts, 1200);

  const fechada = (await post('/api/rh/folhas/2026-11/fechar')).dados;
  assert.equal(fechada.status, 'fechada');
  assert.equal(fechada.titulos.length, 4);
  assert.equal(fechada.titulos.find((t) => t.descricao.startsWith('Salários')).valor, fechada.liquido);
  assert.equal((await post('/api/rh/folhas/2026-11/calcular')).status, 409);

  const reaberta = (await post('/api/rh/folhas/2026-11/reabrir')).dados;
  assert.equal(reaberta.status, 'aberta');
  assert.ok(reaberta.titulos.every((t) => t.status === 'cancelado'));
});

test('Processos: automação só roda com campos preenchidos e cria o registro no módulo', async () => {
  const pipes = (await get('/api/pipes')).dados;
  const req = (await get(`/api/pipes/${pipes.find((p) => p.nome === 'Requisições internas').id}`)).dados;
  const aprovada = req.fases.find((f) => f.nome === 'Aprovada');
  const produto = (await get('/api/produtos')).dados[0];

  // campo obrigatório na criação
  assert.equal((await post(`/api/pipes/${req.id}/cards`, { titulo: 'Sem produto', dados: { quantidade: 1 } })).status, 422);

  const card = await post(`/api/pipes/${req.id}/cards`, { titulo: 'Card de teste', dados: { produto: produto.id, quantidade: 7 } });
  assert.equal(card.status, 201);
  const movido = await post(`/api/cards/${card.dados.id}/mover`, { fase_id: aprovada.id });
  assert.equal(movido.status, 200);
  assert.equal(movido.dados.vinculos.length, 1);
  const sc = (await get(`/api/compras/solicitacoes/${movido.dados.vinculos[0].id}`)).dados;
  assert.equal(sc.status, 'pendente');
  assert.equal(sc.itens[0].quantidade, 7);
  assert.equal(sc.origem_card_id, card.dados.id);

  // voltar e avançar de novo não duplica
  await post(`/api/cards/${card.dados.id}/mover`, { fase_id: req.fases[0].id });
  const denovo = await post(`/api/cards/${card.dados.id}/mover`, { fase_id: aprovada.id });
  assert.equal(denovo.dados.vinculos.length, 1);

  // admissão sem dados obrigatórios: movimento é bloqueado e o erro fica no histórico
  const adm = (await get(`/api/pipes/${pipes.find((p) => p.nome.startsWith('Admissão')).id}`)).dados;
  const incompleto = adm.fases[0].cards[0];
  const admitido = adm.fases.find((f) => f.nome === 'Admitido');
  const bloqueado = await post(`/api/cards/${incompleto.id}/mover`, { fase_id: admitido.id });
  assert.equal(bloqueado.status, 422);
  const cardDepois = (await get(`/api/cards/${incompleto.id}`)).dados;
  assert.equal(cardDepois.fase_id, incompleto.fase_id, 'card continua na fase original');
  assert.equal(cardDepois.eventos[0].tipo, 'erro');
});

test('Apuração: débitos menos créditos, sem gerar duas vezes nem antes do fim do mês', async () => {
  const ap = (await get('/api/fiscal/apuracao?competencia=2026-10')).dados;
  assert.ok(ap.gerada, 'demo já gerou outubro');
  const icms = ap.tributos.find((t) => t.tributo === 'icms');
  assert.equal(icms.aRecolher, Math.max(0, icms.debitos - icms.creditos - icms.credorAnterior));
  assert.equal((await post('/api/fiscal/apuracao/2026-10/gerar')).status, 409);
  assert.equal((await post('/api/fiscal/apuracao/2099-01/gerar')).status, 409);
});
