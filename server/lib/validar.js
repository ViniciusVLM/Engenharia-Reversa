import { invalido } from './http.js';

/**
 * Validadores pequenos e explícitos. Cada um devolve o valor normalizado
 * ou lança 422 com mensagem em português.
 */

export function texto(v, rotulo, { obrigatorio = false, max = 500 } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (obrigatorio) throw invalido(`${rotulo} é obrigatório.`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > max) throw invalido(`${rotulo} deve ter no máximo ${max} caracteres.`);
  return s;
}

export function numero(v, rotulo, { obrigatorio = false, min = -Infinity, max = Infinity } = {}) {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw invalido(`${rotulo} é obrigatório.`);
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw invalido(`${rotulo} deve ser um número.`);
  if (n < min) throw invalido(`${rotulo} deve ser no mínimo ${min}.`);
  if (n > max) throw invalido(`${rotulo} deve ser no máximo ${max}.`);
  return n;
}

export function inteiro(v, rotulo, opcoes = {}) {
  const n = numero(v, rotulo, opcoes);
  if (n === null) return null;
  if (!Number.isInteger(n)) throw invalido(`${rotulo} deve ser um número inteiro.`);
  return n;
}

/** Valor em centavos (inteiro >= 0). */
export function centavos(v, rotulo, { obrigatorio = false, positivo = false } = {}) {
  const n = inteiro(v, rotulo, { obrigatorio, min: positivo ? 1 : 0 });
  return n;
}

export function data(v, rotulo, { obrigatorio = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (obrigatorio) throw invalido(`${rotulo} é obrigatória.`);
    return null;
  }
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw invalido(`${rotulo} deve estar no formato AAAA-MM-DD.`);
  }
  return s;
}

export function competencia(v) {
  const s = String(v ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw invalido('Competência deve estar no formato AAAA-MM.');
  return s;
}

export function opcao(v, rotulo, opcoes, { obrigatorio = true, padrao } = {}) {
  if (v === undefined || v === null || v === '') {
    if (padrao !== undefined) return padrao;
    if (obrigatorio) throw invalido(`${rotulo} é obrigatório.`);
    return null;
  }
  if (!opcoes.includes(v)) throw invalido(`${rotulo} inválido. Use: ${opcoes.join(', ')}.`);
  return v;
}

export function lista(v, rotulo, { min = 0 } = {}) {
  if (!Array.isArray(v)) {
    if (min > 0) throw invalido(`${rotulo}: informe ao menos ${min} item.`);
    return [];
  }
  if (v.length < min) throw invalido(`${rotulo}: informe ao menos ${min} item.`);
  return v;
}

export function id(v, rotulo, opcoes = {}) {
  return inteiro(v, rotulo, { min: 1, ...opcoes });
}

/** Condição de pagamento "30/60/90" → [30, 60, 90] (dias). "0" = à vista. */
export function condicaoPagamento(v) {
  const s = String(v ?? '30').trim() || '30';
  const dias = s.split(/[\/,;\s]+/).filter(Boolean).map(Number);
  if (!dias.length || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 720)) {
    throw invalido('Condição de pagamento inválida. Use dias separados por barra, ex.: 30/60/90.');
  }
  if (dias.length > 24) throw invalido('Condição de pagamento aceita no máximo 24 parcelas.');
  return { texto: dias.join('/'), dias };
}
