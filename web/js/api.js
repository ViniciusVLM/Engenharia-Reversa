// Cliente da API. O mesmo código roda no navegador e no app instalado (PWA);
// o endereço do servidor pode ser trocado em Ajustes para apontar para outro host.

const K = { token: 'alicerce.token', usuario: 'alicerce.usuario', servidor: 'alicerce.servidor' };

const armazenamento = {
  ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* modo privado */ } },
};

export const sessao = {
  get token() { return armazenamento.ler(K.token); },
  get usuario() {
    try { return JSON.parse(armazenamento.ler(K.usuario) || 'null'); } catch { return null; }
  },
  get servidor() { return (armazenamento.ler(K.servidor) || '').replace(/\/+$/, ''); },
  definirServidor(url) { armazenamento.gravar(K.servidor, url ? url.replace(/\/+$/, '') : null); },
  entrar(token, usuario) {
    armazenamento.gravar(K.token, token);
    armazenamento.gravar(K.usuario, JSON.stringify(usuario));
  },
  sair() {
    armazenamento.gravar(K.token, null);
    armazenamento.gravar(K.usuario, null);
  },
};

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export async function api(metodo, caminho, corpo) {
  const headers = { Accept: 'application/json' };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (sessao.token) headers.Authorization = `Bearer ${sessao.token}`;
  let resp;
  try {
    resp = await fetch(`${sessao.servidor}${caminho}`, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a internet ou o endereço em Ajustes.');
  }
  const dados = resp.status === 204 ? null : await resp.json().catch(() => null);
  if (resp.status === 401 && !caminho.startsWith('/api/auth/login')) {
    sessao.sair();
    location.hash = '#/login';
  }
  if (!resp.ok) throw new ErroApi(resp.status, dados?.erro || `Erro ${resp.status}`);
  return dados;
}

export const get = (c, q) => {
  const qs = q ? '?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null)).toString() : '';
  return api('GET', c + (qs === '?' ? '' : qs));
};
export const post = (c, b = {}) => api('POST', c, b);
export const put = (c, b = {}) => api('PUT', c, b);
export const patch = (c, b = {}) => api('PATCH', c, b);
export const del = (c) => api('DELETE', c);
