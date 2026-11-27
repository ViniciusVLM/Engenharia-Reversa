/**
 * Tabelas de referência para a folha de pagamento.
 *
 * ATENÇÃO: valores de referência para fins de demonstração. Antes de usar em
 * produção, confira cada tabela com a contabilidade e a legislação vigente.
 * Valores em REAIS aqui; o cálculo converte para centavos.
 */

export const TABELAS_FOLHA = {
  2025: {
    // Portaria Interministerial MPS/MF nº 6/2025
    inss: [
      { ate: 1518.0, aliquota: 7.5 },
      { ate: 2793.88, aliquota: 9 },
      { ate: 4190.83, aliquota: 12 },
      { ate: 8157.41, aliquota: 14 },
    ],
    // Tabela mensal do IRRF vigente a partir de maio/2025 (Lei 15.191/2025)
    irrf: [
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
      { ate: 3751.05, aliquota: 15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
      { ate: Infinity, aliquota: 27.5, deducao: 908.73 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 607.2,
    reducaoIrrf: null,
  },
  2026: {
    // Faixas do INSS reajustadas para 2026 (salário mínimo de R$ 1.621,00)
    inss: [
      { ate: 1621.0, aliquota: 7.5 },
      { ate: 2902.84, aliquota: 9 },
      { ate: 4354.27, aliquota: 12 },
      { ate: 8475.55, aliquota: 14 },
    ],
    irrf: [
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 7.5, deducao: 182.16 },
      { ate: 3751.05, aliquota: 15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 22.5, deducao: 675.49 },
      { ate: Infinity, aliquota: 27.5, deducao: 908.73 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 607.2,
    // Lei 15.270/2025: redução do IR mensal (isenção efetiva até R$ 5.000,00
    // e redução decrescente até R$ 7.350,00 de rendimento tributável).
    reducaoIrrf: {
      isencaoAte: 5000.0,
      reducaoMaxima: 312.89,
      faixaDecrescenteAte: 7350.0,
      constante: 978.62,
      fator: 0.133145,
    },
  },
};

export const FGTS = { clt: 8, aprendiz: 2, estagiario: 0 };

/** Seleciona a tabela pelo ano da competência (usa a mais recente disponível). */
export function tabelaDoAno(ano) {
  const anos = Object.keys(TABELAS_FOLHA).map(Number).sort((a, b) => a - b);
  const escolhido = anos.filter((a) => a <= ano).pop() ?? anos[0];
  return { ano: escolhido, ...TABELAS_FOLHA[escolhido] };
}

// Fiscal
export const ICMS_INTERESTADUAL = 12; // alíquota padrão entre estados (Sul/Sudeste ↔ Sul/Sudeste)
