import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { abrirBanco } from './lib/db.js';
import { criarApp } from './app.js';
import { popularDemo } from './db/seed.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoBanco = process.env.ALICERCE_BANCO || join(raiz, 'dados', 'alicerce.db');
const porta = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const db = abrirBanco(caminhoBanco);
if (!db.um('SELECT id FROM usuarios LIMIT 1')) {
  if (process.env.ALICERCE_SEM_DEMO) {
    console.log('Banco vazio e ALICERCE_SEM_DEMO definido: crie o primeiro usuário com `npm run reset`.');
  } else {
    console.log('Banco vazio — carregando empresa de demonstração...');
    popularDemo(db);
  }
}

const servidor = criarApp(db);
servidor.listen(porta, host, () => {
  console.log(`\nAlicerce ERP rodando em http://localhost:${porta}`);
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  na rede local (celular): http://${i.address}:${porta}`);
    }
  }
  console.log('  login de demonstração: admin@alicerce.dev / alicerce123\n');
});

const encerrar = () => servidor.close(() => { db.fechar(); process.exit(0); });
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
