import { get, post, put, del } from '../api.js';
import { h, fmt, icone, cabecalho, abas, tabela, etiqueta, campo, lerForm, acao, toast, formularioModal, confirmar } from '../ui.js';

const ABAS = [
  { id: 'produtos', rotulo: 'Produtos' },
  { id: 'parceiros', rotulo: 'Fornecedores e clientes' },
  { id: 'departamentos', rotulo: 'Departamentos' },
  { id: 'empresa', rotulo: 'Empresa' },
];
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'].map((u) => [u, u]);

export async function inicio(alvo, ctx) {
  const aba = ctx.query.aba ?? 'produtos';
  alvo.append(cabecalho('Cadastros', { sub: 'Base compartilhada por todos os módulos.' }), abas('#/cadastros', ABAS, aba));
  if (aba === 'parceiros') return parceiros(alvo, ctx);
  if (aba === 'departamentos') return departamentos(alvo, ctx);
  if (aba === 'empresa') return empresa(alvo);
  return produtos(alvo, ctx);
}

async function produtos(alvo, { recarregar }) {
  const lista = await get('/api/produtos');
  const formulario = (p = {}) => formularioModal({
    titulo: p.id ? `Editar ${p.descricao}` : 'Novo produto', largo: true,
    campos: [
      campo({ rotulo: 'Código', nome: 'codigo', valor: p.codigo, obrigatorio: true }),
      campo({ rotulo: 'Descrição', nome: 'descricao', valor: p.descricao, obrigatorio: true }),
      campo({ rotulo: 'Unidade', nome: 'unidade', valor: p.unidade ?? 'UN' }),
      campo({ rotulo: 'NCM', nome: 'ncm', valor: p.ncm }),
      campo({ rotulo: 'Custo (R$)', nome: 'custo', tipo: 'moeda', valor: p.custo }),
      campo({ rotulo: 'Preço de venda (R$)', nome: 'preco', tipo: 'moeda', valor: p.preco }),
      campo({ rotulo: 'ICMS (%)', nome: 'aliq_icms', tipo: 'number', valor: p.aliq_icms ?? 18 }),
      campo({ rotulo: 'IPI (%)', nome: 'aliq_ipi', tipo: 'number', valor: p.aliq_ipi ?? 0 }),
      campo({ rotulo: 'PIS (%)', nome: 'aliq_pis', tipo: 'number', valor: p.aliq_pis ?? 1.65 }),
      campo({ rotulo: 'COFINS (%)', nome: 'aliq_cofins', tipo: 'number', valor: p.aliq_cofins ?? 7.6 }),
      p.id ? null : campo({ rotulo: 'Estoque inicial', nome: 'estoque', tipo: 'number', valor: 0, ajuda: 'Depois disso, o estoque só muda por notas de entrada e saída.' }),
    ],
    enviar: async (v) => {
      if (p.id) await put(`/api/produtos/${p.id}`, v); else await post('/api/produtos', v);
      toast('Produto salvo.');
      recarregar();
    },
  });
  alvo.append(
    h('div', { class: 'filtros' }, h('button', { class: 'btn primario', onclick: () => formulario() }, icone('novo'), 'Novo produto')),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      aoClicar: formulario,
      colunas: [
        { titulo: 'Código', valor: (p) => h('span', { class: 'principal-txt' }, p.codigo) },
        { titulo: 'Descrição', valor: (p) => p.descricao },
        { titulo: 'NCM', valor: (p) => p.ncm ?? '—' },
        { titulo: 'Custo', num: true, valor: (p) => fmt.moeda(p.custo) },
        { titulo: 'Preço', num: true, valor: (p) => fmt.moeda(p.preco) },
        { titulo: 'Margem', num: true, valor: (p) => (p.preco ? `${Math.round(((p.preco - p.custo) / p.preco) * 100)}%` : '—') },
        { titulo: 'ICMS / IPI', num: true, valor: (p) => `${fmt.pct(p.aliq_icms)} / ${fmt.pct(p.aliq_ipi)}` },
        { titulo: 'Estoque', num: true, valor: (p) => h('span', { class: p.estoque <= 5 ? 'erro-txt' : '' }, `${fmt.numero(p.estoque)} ${p.unidade}`) },
      ],
    })),
  );
}

async function parceiros(alvo, { recarregar }) {
  const lista = await get('/api/parceiros');
  const formulario = (p = {}) => formularioModal({
    titulo: p.id ? `Editar ${p.nome}` : 'Novo fornecedor / cliente',
    campos: [
      campo({ rotulo: 'Nome / razão social', nome: 'nome', valor: p.nome, obrigatorio: true, largo: true }),
      campo({ rotulo: 'Tipo', nome: 'tipo', tipo: 'select', valor: p.tipo ?? 'fornecedor', vazioRotulo: null, opcoes: [['fornecedor', 'Fornecedor'], ['cliente', 'Cliente'], ['ambos', 'Fornecedor e cliente']] }),
      campo({ rotulo: 'CNPJ / CPF', nome: 'documento', valor: p.documento }),
      campo({ rotulo: 'UF', nome: 'uf', tipo: 'select', valor: p.uf ?? 'SP', vazioRotulo: null, opcoes: UFS, ajuda: 'Define se a operação é interestadual (CFOP e ICMS).' }),
      campo({ rotulo: 'E-mail', nome: 'email', tipo: 'email', valor: p.email }),
      campo({ rotulo: 'Telefone', nome: 'telefone', valor: p.telefone }),
    ],
    enviar: async (v) => {
      if (p.id) await put(`/api/parceiros/${p.id}`, v); else await post('/api/parceiros', v);
      toast('Cadastro salvo.');
      recarregar();
    },
  });
  const inativar = async (p, botao) => {
    if (!(await confirmar(`Inativar "${p.nome}"? O histórico é mantido.`, { perigo: true, rotulo: 'Inativar' }))) return;
    if (await acao(botao, () => del(`/api/parceiros/${p.id}`), 'Cadastro inativado.')) recarregar();
  };
  alvo.append(
    h('div', { class: 'filtros' }, h('button', { class: 'btn primario', onclick: () => formulario() }, icone('novo'), 'Novo cadastro')),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      aoClicar: formulario,
      colunas: [
        { titulo: 'Nome', valor: (p) => h('span', { class: 'principal-txt' }, p.nome) },
        { titulo: 'Tipo', valor: (p) => etiqueta({ fornecedor: 'entrada', cliente: 'saida', ambos: 'pendente' }[p.tipo], { fornecedor: 'Fornecedor', cliente: 'Cliente', ambos: 'Ambos' }[p.tipo]) },
        { titulo: 'CNPJ / CPF', valor: (p) => p.documento ?? '—' },
        { titulo: 'UF', valor: (p) => p.uf },
        { titulo: 'E-mail', valor: (p) => p.email ?? '—' },
        { titulo: '', valor: (p) => { const b = h('button', { class: 'btn pequeno fantasma' }, 'Inativar'); b.onclick = () => inativar(p, b); return b; } },
      ],
    })),
  );
}

async function departamentos(alvo, { recarregar }) {
  const lista = await get('/api/departamentos');
  const nome = h('input', { class: 'entrada', placeholder: 'Nome do departamento', 'aria-label': 'Novo departamento' });
  const add = h('button', { class: 'btn primario' }, 'Adicionar');
  add.onclick = async () => nome.value.trim() && (await acao(add, () => post('/api/departamentos', { nome: nome.value }), 'Departamento criado.')) && recarregar();
  alvo.append(
    h('div', { class: 'filtros' }, nome, add),
    h('div', { class: 'cartao' }, tabela({
      linhas: lista,
      colunas: [
        { titulo: 'Departamento', valor: (d) => h('span', { class: 'principal-txt' }, d.nome) },
        { titulo: 'Colaboradores ativos', num: true, valor: (d) => d.colaboradores },
      ],
    })),
  );
}

async function empresa(alvo) {
  const e = await get('/api/empresa');
  const form = h('form', { class: 'form-grade', onsubmit: (ev) => ev.preventDefault() },
    campo({ rotulo: 'Razão social', nome: 'nome', valor: e.nome, obrigatorio: true, largo: true }),
    campo({ rotulo: 'CNPJ', nome: 'cnpj', valor: e.cnpj }),
    campo({ rotulo: 'UF', nome: 'uf', tipo: 'select', valor: e.uf, vazioRotulo: null, opcoes: UFS, ajuda: 'Base para identificar operações interestaduais.' }),
  );
  const salvar = h('button', { class: 'btn primario', type: 'button' }, 'Salvar');
  salvar.onclick = () => acao(salvar, () => put('/api/empresa', lerForm(form)), 'Dados da empresa salvos.');
  alvo.append(h('div', { class: 'cartao' }, h('div', { class: 'cartao-corpo pilha' }, form, h('div', { class: 'form-acoes' }, salvar))));
}
