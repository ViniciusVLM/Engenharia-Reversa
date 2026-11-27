export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export const naoEncontrado = (o = 'Registro') => new ErroHttp(404, `${o} não encontrado.`);
export const conflito = (m) => new ErroHttp(409, m);
export const invalido = (m, detalhes) => new ErroHttp(422, m, detalhes);

/** Roteador mínimo: padrões como /api/pipes/:id/cards */
export function criarRoteador() {
  const rotas = [];
  const add = (metodo) => (padrao, handler, opcoes = {}) => {
    const chaves = [];
    const fonte = padrao.replace(/:(\w+)/g, (_, k) => {
      chaves.push(k);
      return '([^/]+)';
    });
    rotas.push({ metodo, re: new RegExp(`^${fonte}/?$`), chaves, handler, publica: !!opcoes.publica });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),
    resolver(metodo, caminho) {
      let caminhoExiste = false;
      for (const r of rotas) {
        const m = r.re.exec(caminho);
        if (!m) continue;
        caminhoExiste = true;
        if (r.metodo !== metodo) continue;
        const params = {};
        r.chaves.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { rota: r, params };
      }
      return { rota: null, caminhoExiste };
    },
  };
}

export async function lerCorpo(req, limite = 1_000_000) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > limite) {
        reject(new ErroHttp(413, 'Requisição muito grande.'));
        req.destroy();
      } else partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(new ErroHttp(400, 'JSON inválido no corpo da requisição.'));
      }
    });
    req.on('error', reject);
  });
}

export function enviarJson(res, status, dados, extras = {}) {
  const corpo = status === 204 ? '' : JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extras,
  });
  res.end(corpo);
}
