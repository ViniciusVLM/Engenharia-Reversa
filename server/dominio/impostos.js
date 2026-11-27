import { ICMS_INTERESTADUAL } from './tabelas.js';

/**
 * Cálculo simplificado de tributos de uma nota (regime não cumulativo).
 * - ICMS e IPI sobre o valor dos produtos
 * - PIS/COFINS com ICMS excluído da base (STF, Tema 69)
 * - Operação interestadual usa ICMS de 12%
 * Fora do escopo: ST, DIFAL, FCP, benefícios fiscais e os novos IBS/CBS.
 * Valores em centavos.
 */
export function calcularItem({ quantidade, valorUnitario, aliqIcms, aliqIpi, aliqPis, aliqCofins }) {
  const valorTotal = Math.round(quantidade * valorUnitario);
  const valorIcms = Math.round((valorTotal * aliqIcms) / 100);
  const valorIpi = Math.round((valorTotal * aliqIpi) / 100);
  const basePisCofins = valorTotal - valorIcms;
  const valorPis = Math.round((basePisCofins * aliqPis) / 100);
  const valorCofins = Math.round((basePisCofins * aliqCofins) / 100);
  return {
    quantidade, valorUnitario, valorTotal,
    aliqIcms, valorIcms, aliqIpi, valorIpi, aliqPis, valorPis, aliqCofins, valorCofins,
  };
}

export function calcularNota(itens, { interestadual = false } = {}) {
  const calculados = itens.map((i) =>
    calcularItem({ ...i, aliqIcms: interestadual ? ICMS_INTERESTADUAL : i.aliqIcms }),
  );
  const soma = (k) => calculados.reduce((s, i) => s + i[k], 0);
  const totais = {
    valorProdutos: soma('valorTotal'),
    valorIcms: soma('valorIcms'),
    valorIpi: soma('valorIpi'),
    valorPis: soma('valorPis'),
    valorCofins: soma('valorCofins'),
  };
  totais.valorTotal = totais.valorProdutos + totais.valorIpi;
  return { itens: calculados, totais };
}

export function cfop(tipo, interestadual) {
  if (tipo === 'entrada') return interestadual ? '2102' : '1102';
  return interestadual ? '6102' : '5102';
}

export function natureza(tipo) {
  return tipo === 'entrada' ? 'Compra para comercialização' : 'Venda de mercadoria';
}

/** Chave de acesso fictícia de 44 dígitos (apenas simulação — não há transmissão à SEFAZ). */
export function chaveSimulada({ uf, emissao, cnpj, serie, numero }) {
  const codigosUf = { SP: '35', RJ: '33', MG: '31', PR: '41', SC: '42', RS: '43', ES: '32', BA: '29', GO: '52', DF: '53' };
  const base =
    (codigosUf[uf] ?? '35') +
    emissao.slice(2, 4) + emissao.slice(5, 7) +
    String(cnpj ?? '').replace(/\D/g, '').padStart(14, '0').slice(0, 14) +
    '55' +
    String(serie).padStart(3, '0') +
    String(numero).padStart(9, '0') +
    '1' +
    String(numero * 7919 % 99999999).padStart(8, '0');
  // dígito verificador módulo 11
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return base + dv;
}
