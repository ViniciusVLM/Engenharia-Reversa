import { tabelaDoAno, FGTS } from './tabelas.js';

const reaisParaCentavos = (r) => Math.round(r * 100);
const arred = (v) => Math.round(v);

/** INSS progressivo por faixas. Recebe e devolve centavos. */
export function calcularInss(salario, faixas) {
  let anterior = 0;
  let total = 0;
  const detalhe = [];
  for (const f of faixas) {
    const limite = reaisParaCentavos(f.ate);
    const base = Math.min(salario, limite) - anterior;
    if (base <= 0) break;
    const valor = (base * f.aliquota) / 100;
    detalhe.push({ base: arred(base), aliquota: f.aliquota, valor: arred(valor) });
    total += valor;
    anterior = limite;
  }
  return { valor: arred(total), faixas: detalhe };
}

/** IRRF mensal: usa a dedução mais vantajosa (legal x simplificada) e aplica a redução de 2026, quando houver. */
export function calcularIrrf({ rendimento, inss, dependentes, tabela }) {
  const deducaoLegal = inss + dependentes * reaisParaCentavos(tabela.deducaoDependente);
  const deducaoSimplificada = reaisParaCentavos(tabela.descontoSimplificado);
  const usouSimplificado = deducaoSimplificada > deducaoLegal;
  const base = Math.max(0, rendimento - Math.max(deducaoLegal, deducaoSimplificada));

  const faixa = tabela.irrf.find((f) => base <= reaisParaCentavos(f.ate));
  const impostoTabela = Math.max(0, arred((base * faixa.aliquota) / 100 - reaisParaCentavos(faixa.deducao)));

  let reducao = 0;
  const r = tabela.reducaoIrrf;
  if (r && impostoTabela > 0) {
    if (rendimento <= reaisParaCentavos(r.isencaoAte)) {
      reducao = Math.min(impostoTabela, reaisParaCentavos(r.reducaoMaxima));
    } else if (rendimento <= reaisParaCentavos(r.faixaDecrescenteAte)) {
      const emReais = r.constante - r.fator * (rendimento / 100);
      reducao = Math.min(impostoTabela, Math.max(0, reaisParaCentavos(emReais)));
    }
  }

  return {
    valor: Math.max(0, impostoTabela - reducao),
    base,
    aliquota: faixa.aliquota,
    deducaoFaixa: reaisParaCentavos(faixa.deducao),
    deducaoUsada: usouSimplificado ? 'simplificada' : 'legal',
    deducao: Math.max(deducaoLegal, deducaoSimplificada),
    impostoTabela,
    reducao,
  };
}

/**
 * Calcula o holerite de um colaborador.
 * - CLT: INSS + IRRF, FGTS 8%
 * - Aprendiz (Lei 10.097/2000): INSS + IRRF, FGTS 2%
 * - Estagiário (Lei 11.788/2008): bolsa sem INSS/FGTS; IRRF incide normalmente
 */
export function calcularHolerite({ salario, vinculo, dependentes = 0, competencia }) {
  const tabela = tabelaDoAno(Number(competencia.slice(0, 4)));
  const inss = vinculo === 'estagiario' ? { valor: 0, faixas: [] } : calcularInss(salario, tabela.inss);
  const irrf = calcularIrrf({ rendimento: salario, inss: inss.valor, dependentes, tabela });
  const aliquotaFgts = FGTS[vinculo];
  const fgts = arred((salario * aliquotaFgts) / 100);
  return {
    salario,
    inss: inss.valor,
    irrf: irrf.valor,
    fgts,
    liquido: salario - inss.valor - irrf.valor,
    memoria: {
      tabela: tabela.ano,
      vinculo,
      dependentes,
      inss,
      irrf,
      fgts: { aliquota: aliquotaFgts, valor: fgts },
    },
  };
}
