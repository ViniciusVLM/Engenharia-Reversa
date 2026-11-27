import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularHolerite, calcularInss } from '../server/dominio/folha.js';
import { calcularNota, cfop, chaveSimulada } from '../server/dominio/impostos.js';
import { tabelaDoAno } from '../server/dominio/tabelas.js';
import { condicaoPagamento } from '../server/lib/validar.js';
import { quintoDiaUtil } from '../server/modulos/rh.js';

const R = (reais) => Math.round(reais * 100);

test('INSS 2026 é progressivo por faixa', () => {
  const t = tabelaDoAno(2026);
  // 1621*7,5% + (2902,84-1621)*9% + (4354,27-2902,84)*12% + (5500-4354,27)*14% = 571,51
  assert.equal(calcularInss(R(5500), t.inss).valor, R(571.51));
  // acima do teto, contribuição fica limitada
  assert.equal(calcularInss(R(20000), t.inss).valor, calcularInss(R(8475.55), t.inss).valor);
});

test('CLT 2026: IRRF usa desconto simplificado quando é mais vantajoso e aplica a redução da Lei 15.270', () => {
  const h = calcularHolerite({ salario: R(5500), vinculo: 'clt', dependentes: 0, competencia: '2026-11' });
  assert.equal(h.inss, R(571.51));
  assert.equal(h.memoria.irrf.deducaoUsada, 'simplificada');
  assert.equal(h.memoria.irrf.impostoTabela, R(436.79));
  assert.equal(h.memoria.irrf.reducao, R(246.32));
  assert.equal(h.irrf, R(190.47));
  assert.equal(h.fgts, R(440));
  assert.equal(h.liquido, R(5500) - R(571.51) - R(190.47));
});

test('Até R$ 5.000 o IRRF fica zerado em 2026', () => {
  const h = calcularHolerite({ salario: R(5000), vinculo: 'clt', competencia: '2026-03' });
  assert.equal(h.irrf, 0);
  assert.ok(h.memoria.irrf.impostoTabela > 0, 'havia imposto pela tabela antes da redução');
});

test('Em 2025 não há redução: R$ 5.000 paga IR', () => {
  const h = calcularHolerite({ salario: R(5000), vinculo: 'clt', competencia: '2025-10' });
  assert.ok(h.irrf > 0);
  assert.equal(h.memoria.tabela, 2025);
});

test('Dependentes entram na dedução legal', () => {
  const sem = calcularHolerite({ salario: R(9500), vinculo: 'clt', dependentes: 0, competencia: '2026-11' });
  const com = calcularHolerite({ salario: R(9500), vinculo: 'clt', dependentes: 2, competencia: '2026-11' });
  assert.equal(com.memoria.irrf.deducaoUsada, 'legal');
  assert.ok(com.irrf < sem.irrf);
});

test('Aprendiz recolhe FGTS de 2%; estagiário não tem INSS nem FGTS', () => {
  const ap = calcularHolerite({ salario: R(1150), vinculo: 'aprendiz', competencia: '2026-11' });
  assert.equal(ap.fgts, R(23));
  assert.equal(ap.inss, R(86.25));
  const est = calcularHolerite({ salario: R(1800), vinculo: 'estagiario', competencia: '2026-11' });
  assert.equal(est.inss, 0);
  assert.equal(est.fgts, 0);
  assert.equal(est.liquido, R(1800));
});

test('Nota: ICMS sai da base de PIS/COFINS e IPI soma ao total', () => {
  const { totais, itens } = calcularNota([
    { quantidade: 2, valorUnitario: R(1000), aliqIcms: 18, aliqIpi: 5, aliqPis: 1.65, aliqCofins: 7.6 },
  ]);
  assert.equal(itens[0].valorIcms, R(360));
  assert.equal(totais.valorIpi, R(100));
  assert.equal(totais.valorPis, Math.round((R(2000) - R(360)) * 0.0165));
  assert.equal(totais.valorCofins, Math.round((R(2000) - R(360)) * 0.076));
  assert.equal(totais.valorTotal, R(2100));
});

test('Operação interestadual usa ICMS 12% e CFOP 6xxx/2xxx', () => {
  const { totais } = calcularNota([{ quantidade: 1, valorUnitario: R(100), aliqIcms: 18, aliqIpi: 0, aliqPis: 0, aliqCofins: 0 }], { interestadual: true });
  assert.equal(totais.valorIcms, R(12));
  assert.equal(cfop('saida', true), '6102');
  assert.equal(cfop('entrada', false), '1102');
});

test('Chave de acesso simulada tem 44 dígitos', () => {
  const chave = chaveSimulada({ uf: 'SP', emissao: '2026-11-27', cnpj: '00.000.000/0001-91', serie: 1, numero: 42 });
  assert.match(chave, /^\d{44}$/);
});

test('Condição de pagamento e 5º dia útil', () => {
  assert.deepEqual(condicaoPagamento('30/60/90').dias, [30, 60, 90]);
  assert.throws(() => condicaoPagamento('30/abc'));
  assert.equal(quintoDiaUtil('2026-10'), '2026-11-06'); // 1/11/2026 é domingo
});
