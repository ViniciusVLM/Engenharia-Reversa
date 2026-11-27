import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './lib/db.js';
import { popularDemo } from './db/seed.js';

// Apaga o banco local e recria com os dados de demonstração.
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const caminho = process.env.ALICERCE_BANCO || join(raiz, 'dados', 'alicerce.db');
for (const sufixo of ['', '-wal', '-shm']) rmSync(caminho + sufixo, { force: true });

const db = abrirBanco(caminho);
popularDemo(db);
db.fechar();
console.log(`Banco recriado em ${caminho}`);
