import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarRoteador, lerCorpo, enviarJson, ErroHttp } from './lib/http.js';
import { validarToken, obterSegredo } from './lib/auth.js';
import * as cadastros from './modulos/cadastros.js';
import * as compras from './modulos/compras.js';
import * as financeiro from './modulos/financeiro.js';
import * as fiscal from './modulos/fiscal.js';
import * as rh from './modulos/rh.js';
import * as processos from './modulos/processos.js';
import * as painel from './modulos/painel.js';

const RAIZ_WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Cria o servidor HTTP: API REST em /api e o front-end (web + PWA) nos demais caminhos.
 * CORS liberado para que um app em outra origem (ex.: app nativo/PWA hospedado à parte)
 * consuma a mesma API usando o token Bearer.
 */
export function criarApp(db, { log = true } = {}) {
  const r = criarRoteador();
  for (const m of [painel, cadastros, compras, financeiro, fiscal, rh, processos]) m.registrar(r);
  const segredo = obterSegredo(db);

  const cors = {
    'Access-Control-Allow-Origin': process.env.ALICERCE_CORS_ORIGEM || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };

  async function api(req, res, url) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const { rota, params, caminhoExiste } = r.resolver(req.method, url.pathname);
    if (!rota) throw new ErroHttp(caminhoExiste ? 405 : 404, caminhoExiste ? 'Método não permitido.' : 'Rota não encontrada.');

    let usuario = null;
    if (!rota.publica) {
      const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      usuario = validarToken(segredo, token);
      if (!usuario) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');
    }

    let status = 200;
    const corpo = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await lerCorpo(req) : {};
    const resultado = await rota.handler({
      db, params, corpo, usuario, segredo,
      query: Object.fromEntries(url.searchParams),
      status: (s) => (status = s),
    });
    enviarJson(res, status, resultado ?? { ok: true }, cors);
  }

  async function estatico(req, res, url) {
    let caminho = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (caminho.includes('..')) throw new ErroHttp(400, 'Caminho inválido.');
    let arquivo = join(RAIZ_WEB, caminho || 'index.html');
    let info = await stat(arquivo).catch(() => null);
    if (info?.isDirectory()) {
      arquivo = join(arquivo, 'index.html');
      info = await stat(arquivo).catch(() => null);
    }
    if (!info) {
      if (extname(caminho)) throw new ErroHttp(404, 'Arquivo não encontrado.');
      arquivo = join(RAIZ_WEB, 'index.html'); // SPA fallback
    }
    const conteudo = await readFile(arquivo);
    const ext = extname(arquivo);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' || arquivo.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(conteudo);
  }

  return createServer(async (req, res) => {
    const inicio = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const ehApi = url.pathname.startsWith('/api/') || url.pathname === '/api';
    try {
      if (ehApi) await api(req, res, url);
      else await estatico(req, res, url);
    } catch (e) {
      const status = e instanceof ErroHttp ? e.status : 500;
      if (status === 500) console.error(e);
      const mensagem = status === 500 ? 'Erro interno. Tente novamente.' : e.message;
      if (!res.headersSent) enviarJson(res, status, { erro: mensagem, detalhes: e.detalhes }, ehApi ? cors : {});
      else res.end();
    } finally {
      if (log && ehApi) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - inicio}ms`);
    }
  });
}
