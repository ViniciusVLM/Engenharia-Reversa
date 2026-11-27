// Datas sempre como string ISO (AAAA-MM-DD), calculadas em UTC para evitar fuso.

export function hoje() {
  if (process.env.ALICERCE_HOJE) return process.env.ALICERCE_HOJE;
  return new Date().toISOString().slice(0, 10);
}

export function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function somarMeses(iso, meses) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export const competenciaDe = (iso) => iso.slice(0, 7);

/** Dia N do mês seguinte à competência (AAAA-MM). */
export function diaDoMesSeguinte(comp, dia) {
  const [a, m] = comp.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, dia));
  return d.toISOString().slice(0, 10);
}

export function competenciaAnterior(comp) {
  const [a, m] = comp.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function ultimoDiaDaCompetencia(comp) {
  const [a, m] = comp.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export function diasEntre(de, ate) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}
