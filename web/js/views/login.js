import { post, sessao } from '../api.js';
import { h, limpar, campo, lerForm, toast } from '../ui.js';

export function render(raiz) {
  const servidorAtual = sessao.servidor;
  const erro = h('div', { class: 'aviso-caixa erro oculto', role: 'alert' });
  const servidor = campo({
    rotulo: 'Servidor', nome: 'servidor', valor: servidorAtual,
    ajuda: 'Deixe vazio para usar este mesmo endereço. No app, informe o endereço do servidor (ex.: http://192.168.0.10:3000).',
  });
  servidor.classList.toggle('oculto', !servidorAtual);

  const botao = h('button', { class: 'btn primario', type: 'submit', style: { width: '100%' } }, 'Entrar');
  const form = h('form', { class: 'form', onsubmit: enviar },
    campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', valor: 'admin@alicerce.dev', obrigatorio: true, attrs: { autocomplete: 'username' } }),
    campo({ rotulo: 'Senha', nome: 'senha', tipo: 'password', valor: 'alicerce123', obrigatorio: true, attrs: { autocomplete: 'current-password' } }),
    servidor,
    erro,
    botao,
    h('button', { type: 'button', class: 'btn fantasma pequeno', onclick: () => servidor.classList.toggle('oculto') }, 'Conectar a outro servidor'),
  );

  async function enviar(e) {
    e.preventDefault();
    const d = lerForm(form);
    sessao.definirServidor(d.servidor);
    botao.disabled = true;
    erro.classList.add('oculto');
    try {
      const r = await post('/api/auth/login', { email: d.email, senha: d.senha });
      sessao.entrar(r.token, r.usuario);
      toast(`Bem-vindo(a), ${r.usuario.nome}!`);
      if (location.hash === '' || location.hash === '#/login') location.hash = '#/';
      window.dispatchEvent(new Event('alicerce:sessao'));
    } catch (err) {
      erro.textContent = err.message;
      erro.classList.remove('oculto');
    } finally {
      botao.disabled = false;
    }
  }

  limpar(raiz, h('div', { class: 'login-tela' }, h('div', { class: 'cartao login-caixa' },
    h('div', { class: 'marca' }, h('img', { src: '/icons/icone.svg', alt: '' }), h('div', null, 'Alicerce ERP', h('small', null, 'Processos · Compras · RH · Financeiro · Fiscal'))),
    form,
    h('p', { class: 'fraco', style: { marginTop: '16px' } }, 'Ambiente de demonstração com dados fictícios. Usuário e senha já preenchidos.'),
  )));
}
