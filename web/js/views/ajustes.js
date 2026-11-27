import { sessao, get } from '../api.js';
import { h, cabecalho, campo, toast } from '../ui.js';
import { aplicarTema } from '../app.js';

let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; });

export async function inicio(alvo) {
  let tema = 'auto';
  try { tema = localStorage.getItem('alicerce.tema') || 'auto'; } catch { /* sem storage */ }
  const saude = await get('/api/saude').catch(() => null);

  const seletorTema = campo({ rotulo: 'Tema', nome: 'tema', tipo: 'select', valor: tema, vazioRotulo: null,
    opcoes: [['auto', 'Automático (segue o sistema)'], ['claro', 'Claro'], ['escuro', 'Escuro']] });
  seletorTema.querySelector('select').addEventListener('change', (e) => {
    try { localStorage.setItem('alicerce.tema', e.target.value); } catch { /* ignora */ }
    aplicarTema();
  });

  const instalado = window.matchMedia('(display-mode: standalone)').matches;

  alvo.append(
    cabecalho('Ajustes'),
    h('div', { class: 'grade grade-2' },
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Conta')),
        h('div', { class: 'cartao-corpo pilha' },
          h('dl', { class: 'dl' },
            h('div', null, h('dt', null, 'Usuário'), h('dd', null, sessao.usuario?.nome ?? '—')),
            h('div', null, h('dt', null, 'E-mail'), h('dd', null, sessao.usuario?.email ?? '—')),
          ),
          seletorTema,
          h('button', { class: 'btn perigo', onclick: () => { sessao.sair(); location.hash = '#/login'; window.dispatchEvent(new Event('alicerce:sessao')); } }, 'Sair'),
        ),
      ),
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Aplicativo e servidor')),
        h('div', { class: 'cartao-corpo pilha' },
          h('p', { class: 'mudo' }, 'O navegador e o app usam a mesma API. Instale o app para abrir o Alicerce em tela cheia, pela tela inicial do celular ou do computador.'),
          instalado
            ? h('div', { class: 'aviso-caixa' }, 'Você está usando o app instalado.')
            : h('button', {
                class: 'btn primario',
                onclick: async () => {
                  if (eventoInstalar) { eventoInstalar.prompt(); eventoInstalar = null; }
                  else toast('No iPhone: Compartilhar → "Adicionar à Tela de Início". No Android/Chrome: menu ⋮ → "Instalar app".');
                },
              }, 'Instalar app'),
          h('dl', { class: 'dl' },
            h('div', null, h('dt', null, 'Servidor'), h('dd', null, sessao.servidor || location.origin)),
            h('div', null, h('dt', null, 'Status'), h('dd', { class: saude ? 'ok-txt' : 'erro-txt' }, saude ? 'Conectado' : 'Sem conexão')),
          ),
          h('p', { class: 'fraco' }, 'Para conectar a outro servidor, saia e use "Conectar a outro servidor" na tela de login.'),
        ),
      ),
    ),
  );
}
