import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export function gerarHash(senha) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

export function conferirSenha(senha, armazenado) {
  const [sal, hash] = String(armazenado).split(':');
  if (!sal || !hash) return false;
  const calculado = scryptSync(senha, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}

const b64 = (s) => Buffer.from(s).toString('base64url');

/** Token assinado (HMAC-SHA256) no formato payload.assinatura. Sem estado no servidor. */
export function emitirToken(segredo, usuario, horas = 12) {
  const payload = b64(JSON.stringify({ id: usuario.id, nome: usuario.nome, exp: Date.now() + horas * 3600_000 }));
  const assinatura = createHmac('sha256', segredo).update(payload).digest('base64url');
  return `${payload}.${assinatura}`;
}

export function validarToken(segredo, token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, assinatura] = token.split('.');
  if (!payload || !assinatura) return null;
  const esperado = createHmac('sha256', segredo).update(payload).digest();
  const recebido = Buffer.from(assinatura, 'base64url');
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
  try {
    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return dados.exp > Date.now() ? dados : null;
  } catch {
    return null;
  }
}

export function obterSegredo(db) {
  if (process.env.ALICERCE_SEGREDO) return process.env.ALICERCE_SEGREDO;
  let segredo = db.config('segredo_token');
  if (!segredo) {
    segredo = randomBytes(32).toString('hex');
    db.definirConfig('segredo_token', segredo);
  }
  return segredo;
}
