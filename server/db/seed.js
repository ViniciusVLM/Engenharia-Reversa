import { gerarHash } from '../lib/auth.js';
import { hoje, somarDias, somarMeses, competenciaAnterior, competenciaDe } from '../lib/datas.js';
import { criarSolicitacao, decidirSolicitacao, criarPedido, receberPedido } from '../modulos/compras.js';
import { emitirNota, gerarApuracao } from '../modulos/fiscal.js';
import { baixarTitulo, criarTitulo } from '../modulos/financeiro.js';
import { admitirColaborador, calcularFolha, fecharFolha } from '../modulos/rh.js';
import { criarPipe, criarCampo, criarAutomacao, criarCard, moverCard } from '../modulos/processos.js';

/**
 * Popula o banco com uma empresa fictícia e movimentação dos últimos ~2 meses.
 * Todos os nomes, documentos e valores são inventados.
 */
export function popularDemo(db) {
  const d = hoje();
  const reais = (r) => Math.round(r * 100);

  db.transacao(() => {
    db.definirConfig('empresa', { nome: 'Alicerce Demonstração Ltda', cnpj: '00.000.000/0001-91', uf: 'SP' });
    db.executar('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)', 'Administrador', 'admin@alicerce.dev', gerarHash('alicerce123'));

    const dep = {};
    for (const nome of ['Administrativo', 'Operações', 'Comercial', 'Tecnologia', 'Pessoas']) {
      dep[nome] = db.executar('INSERT INTO departamentos (nome) VALUES (?)', nome).id;
    }

    const parceiro = (tipo, nome, documento, uf, email) =>
      db.executar('INSERT INTO parceiros (tipo, nome, documento, uf, email) VALUES (?, ?, ?, ?, ?)', tipo, nome, documento, uf, email).id;
    const f = {
      papelaria: parceiro('fornecedor', 'Papelaria Horizonte Ltda', '11.111.111/0001-11', 'SP', 'vendas@horizonte.exemplo'),
      techparts: parceiro('fornecedor', 'TechParts Distribuidora Ltda', '22.222.222/0001-22', 'PR', 'pedidos@techparts.exemplo'),
      prisma: parceiro('fornecedor', 'Mobília Prisma Ltda', '33.333.333/0001-33', 'MG', 'comercial@prisma.exemplo'),
      cafe: parceiro('fornecedor', 'Café Serra Azul Ltda', '44.444.444/0001-44', 'SP', 'contato@serraazul.exemplo'),
    };
    const c = {
      aurora: parceiro('cliente', 'Comercial Aurora Ltda', '55.555.555/0001-55', 'SP', 'compras@aurora.exemplo'),
      litoral: parceiro('cliente', 'Grupo Litoral S.A.', '66.666.666/0001-66', 'RJ', 'suprimentos@litoral.exemplo'),
      sol: parceiro('cliente', 'Rede Varejo Sol Ltda', '77.777.777/0001-77', 'SP', 'financeiro@varejosol.exemplo'),
      ponte: parceiro('ambos', 'Distribuidora Ponte Ltda', '88.888.888/0001-88', 'SP', 'contato@ponte.exemplo'),
    };

    const produto = (codigo, descricao, ncm, custo, preco, ipi, estoque, unidade = 'UN') =>
      db.executar(
        `INSERT INTO produtos (codigo, descricao, unidade, ncm, custo, preco, aliq_icms, aliq_ipi, aliq_pis, aliq_cofins, estoque)
         VALUES (?, ?, ?, ?, ?, ?, 18, ?, 1.65, 7.6, ?)`,
        codigo, descricao, unidade, ncm, reais(custo), reais(preco), ipi, estoque,
      ).id;
    const p = {
      notebook: produto('NTB-14', 'Notebook 14" i5 16GB', '8471.30.12', 3200, 4590, 0, 4),
      monitor: produto('MON-24', 'Monitor 24" Full HD', '8528.52.20', 690, 990, 0, 12),
      cadeira: produto('CAD-ERG', 'Cadeira ergonômica', '9401.30.10', 850, 1290, 5, 3),
      headset: produto('HDS-USB', 'Headset USB com microfone', '8518.30.00', 120, 210, 0, 20),
      teclado: produto('TEC-SF', 'Kit teclado e mouse sem fio', '8471.60.52', 95, 169, 0, 15),
      papel: produto('PAP-A4', 'Papel A4 75g — resma 500 fls', '4802.56.10', 26, 39, 0, 30, 'RS'),
      cafe: produto('CAF-1K', 'Café em grãos 1 kg', '0901.21.00', 45, 69, 0, 8, 'KG'),
    };

    const banco = db.executar(`INSERT INTO contas (nome, banco, agencia, numero, saldo_inicial) VALUES ('Conta movimento', 'Banco Exemplo', '0001', '12345-6', ?)`, reais(180000)).id;
    db.executar(`INSERT INTO contas (nome, banco, saldo_inicial) VALUES ('Caixa interno', '—', ?)`, reais(3000));

    // ---------------------------------------------------------------- RH
    const colab = (dados) => admitirColaborador(db, dados);
    colab({ nome: 'Marina Duarte', vinculo: 'clt', cargo: 'Analista financeira', departamento_id: dep.Administrativo, salario: reais(6800), dependentes: 1, admissao: '2023-03-01', email: 'marina@alicerce.exemplo' });
    colab({ nome: 'Rafael Monteiro', vinculo: 'clt', cargo: 'Desenvolvedor pleno', departamento_id: dep.Tecnologia, salario: reais(9500), dependentes: 2, admissao: '2022-08-15' });
    colab({ nome: 'Beatriz Nogueira', vinculo: 'clt', cargo: 'Coordenadora de operações', departamento_id: dep['Operações'], salario: reais(4200), admissao: '2021-05-10' });
    colab({ nome: 'Camila Rocha', vinculo: 'clt', cargo: 'Executiva de vendas', departamento_id: dep.Comercial, salario: reais(5500), admissao: '2024-02-01' });
    const admLucas = somarMeses(d, -22);
    colab({ nome: 'Lucas Almeida', vinculo: 'aprendiz', cargo: 'Aprendiz administrativo', departamento_id: dep.Administrativo, salario: reais(1150), admissao: admLucas, fim_contrato: somarDias(somarMeses(admLucas, 24), -1), instituicao: 'Entidade Formadora Exemplo' });
    const admJulia = somarMeses(d, -6);
    colab({ nome: 'Júlia Ferreira', vinculo: 'aprendiz', cargo: 'Aprendiz de operações', departamento_id: dep['Operações'], salario: reais(1150), admissao: admJulia, fim_contrato: somarDias(somarMeses(admJulia, 18), -1), instituicao: 'Entidade Formadora Exemplo' });
    const admPedro = somarMeses(d, -11);
    colab({ nome: 'Pedro Santos', vinculo: 'estagiario', cargo: 'Estagiário de desenvolvimento', departamento_id: dep.Tecnologia, salario: reais(1800), admissao: admPedro, fim_contrato: somarDias(somarMeses(admPedro, 12), -1), instituicao: 'Universidade Exemplo' });

    const compAnterior = competenciaAnterior(competenciaDe(d));
    calcularFolha(db, compAnterior);
    fecharFolha(db, compAnterior);

    // ---------------------------------------------------------------- Compras → Fiscal → Financeiro
    const usuario = 'Administrador';
    const pedidoRecebido = (fornecedorId, itens, condicao, diasAtras, solicitacaoId = null) => {
      const pe = criarPedido(db, { fornecedorId, condicao, itens, solicitacaoId, previsao: somarDias(d, -diasAtras) });
      receberPedido(db, pe.id, { emissao: somarDias(d, -diasAtras) });
      return pe;
    };

    pedidoRecebido(f.papelaria, [{ produto_id: p.papel, quantidade: 40 }, { produto_id: p.cafe, quantidade: 10 }], '30', 38);

    const sc1 = criarSolicitacao(db, { solicitante: 'Rafael Monteiro', departamentoId: dep.Tecnologia, justificativa: 'Equipamentos para dois novos desenvolvedores.', itens: [{ produto_id: p.notebook, quantidade: 2 }, { produto_id: p.monitor, quantidade: 2 }] });
    decidirSolicitacao(db, sc1.id, { aprovar: true, usuario });
    pedidoRecebido(f.techparts, [{ produto_id: p.notebook, quantidade: 2, preco: reais(3150) }, { produto_id: p.monitor, quantidade: 2 }], '30/60', 20, sc1.id);

    const sc2 = criarSolicitacao(db, { solicitante: 'Beatriz Nogueira', departamentoId: dep['Operações'], justificativa: 'Reposição de cadeiras da sala de operações.', itens: [{ produto_id: p.cadeira, quantidade: 4 }] });
    decidirSolicitacao(db, sc2.id, { aprovar: true, usuario });

    criarSolicitacao(db, { solicitante: 'Marina Duarte', departamentoId: dep.Administrativo, justificativa: 'Material de escritório do trimestre.', itens: [{ produto_id: p.papel, quantidade: 20 }] });

    const pcCafe = criarPedido(db, { fornecedorId: f.cafe, condicao: '15', itens: [{ produto_id: p.cafe, quantidade: 12 }], previsao: somarDias(d, 3) });
    db.executar(`UPDATE pedidos SET status = 'enviado' WHERE id = ?`, pcCafe.id);

    // Vendas
    emitirNota(db, { tipo: 'saida', parceiroId: c.sol, itens: [{ produto_id: p.headset, quantidade: 8 }, { produto_id: p.papel, quantidade: 20 }], condicao: '0/30', emissao: somarDias(d, -40) });
    const nfAurora = emitirNota(db, { tipo: 'saida', parceiroId: c.aurora, itens: [{ produto_id: p.notebook, quantidade: 3 }, { produto_id: p.teclado, quantidade: 3 }], condicao: '0/30', emissao: somarDias(d, -10) });
    emitirNota(db, { tipo: 'saida', parceiroId: c.litoral, itens: [{ produto_id: p.monitor, quantidade: 6 }], condicao: '30', emissao: somarDias(d, -3) });
    emitirNota(db, { tipo: 'saida', parceiroId: c.ponte, itens: [{ produto_id: p.headset, quantidade: 5 }], condicao: '28', emissao: somarDias(d, -1) });

    // Apuração do mês anterior (gera guias de impostos no Financeiro)
    if (db.um('SELECT COUNT(*) n FROM notas WHERE substr(emissao,1,7) = ?', compAnterior).n > 0) {
      gerarApuracao(db, compAnterior);
    }

    // Despesas recorrentes
    criarTitulo(db, { tipo: 'pagar', descricao: 'Aluguel do escritório', categoria: 'aluguel', valor: reais(8500), vencimento: somarDias(d, -6) });
    criarTitulo(db, { tipo: 'pagar', descricao: 'Aluguel do escritório', categoria: 'aluguel', valor: reais(8500), vencimento: somarDias(somarMeses(d, 1), -6) });
    criarTitulo(db, { tipo: 'pagar', descricao: 'Internet e telefonia', categoria: 'servicos', valor: reais(690), vencimento: somarDias(d, 4) });
    criarTitulo(db, { tipo: 'pagar', descricao: 'Licenças de software', categoria: 'servicos', valor: reais(1240), vencimento: somarDias(d, -2) });

    // Baixas: pagamentos até 5 dias atrás e recebimentos até 15 dias atrás (o resto fica em aberto e gera alertas)
    for (const t of db.todos(
      `SELECT id, vencimento FROM titulos WHERE status = 'aberto' AND ((tipo = 'pagar' AND vencimento <= ?) OR (tipo = 'receber' AND vencimento <= ?)) ORDER BY vencimento`,
      somarDias(d, -5), somarDias(d, -15),
    )) {
      baixarTitulo(db, t.id, { contaId: banco, data: t.vencimento });
    }
    for (const t of db.todos(`SELECT id, vencimento FROM titulos WHERE origem = 'nota' AND origem_id = ? AND vencimento <= ?`, nfAurora, d)) {
      baixarTitulo(db, t.id, { contaId: banco, data: t.vencimento });
    }
    const aluguel = db.um(`SELECT id, vencimento FROM titulos WHERE descricao = 'Aluguel do escritório' AND vencimento <= ? AND status = 'aberto'`, d);
    if (aluguel) baixarTitulo(db, aluguel.id, { contaId: banco, data: aluguel.vencimento });

    // ---------------------------------------------------------------- Processos
    // 1) Admissão
    const pAdm = criarPipe(db, {
      nome: 'Admissão de jovens talentos',
      descricao: 'Do primeiro contato à admissão de aprendizes e estagiários. Ao chegar em "Admitido", o colaborador é criado no RH.',
      cor: '#0ea5e9',
      fases: ['Triagem', 'Entrevista', 'Documentação', 'Admitido', 'Não seguiu'],
    });
    const fasesAdm = db.todos('SELECT * FROM fases WHERE pipe_id = ? ORDER BY ordem', pAdm);
    db.executar('UPDATE fases SET concluida = 1 WHERE id IN (?, ?)', fasesAdm[3].id, fasesAdm[4].id);
    const campoAdm = (rotulo, tipo, extra = {}) => criarCampo(db, pAdm, { rotulo, tipo, ...extra });
    campoAdm('Nome completo', 'texto', { chave: 'nome', obrigatorio: true });
    campoAdm('E-mail', 'email', { chave: 'email' });
    campoAdm('Vínculo', 'selecao', { chave: 'vinculo', obrigatorio: true, opcoes: ['Jovem aprendiz', 'Estagiário', 'CLT'] });
    campoAdm('Departamento', 'departamento', { chave: 'departamento' });
    campoAdm('Cargo', 'texto', { chave: 'cargo' });
    campoAdm('Salário / bolsa', 'moeda', { chave: 'salario' });
    campoAdm('Data de admissão', 'data', { chave: 'admissao' });
    campoAdm('Fim do contrato', 'data', { chave: 'fim_contrato' });
    campoAdm('Instituição / entidade formadora', 'texto', { chave: 'instituicao' });
    criarAutomacao(db, pAdm, {
      fase_id: fasesAdm[3].id,
      acao: 'admitir_colaborador',
      mapeamento: Object.fromEntries(['nome', 'email', 'vinculo', 'departamento', 'cargo', 'salario', 'admissao', 'fim_contrato', 'instituicao'].map((k) => [k, { campo: k }])),
    });
    const inicioAna = somarDias(d, 7);
    const cAna = criarCard(db, pAdm, {
      titulo: 'Ana Clara Souza — aprendiz administrativo',
      responsavel: 'Marina Duarte',
      vencimento: somarDias(d, 5),
      dados: { nome: 'Ana Clara Souza', email: 'ana.souza@exemplo.com', vinculo: 'Jovem aprendiz', departamento: dep.Administrativo, cargo: 'Aprendiz administrativo', salario: reais(1150), admissao: inicioAna, fim_contrato: somarDias(somarMeses(inicioAna, 18), -1), instituicao: 'Entidade Formadora Exemplo' },
    }, usuario);
    moverCard(db, cAna, fasesAdm[1].id, usuario);
    moverCard(db, cAna, fasesAdm[2].id, usuario);
    const cGabriel = criarCard(db, pAdm, { titulo: 'Gabriel Lima — estágio em TI', responsavel: 'Rafael Monteiro', vencimento: somarDias(d, -1), dados: { nome: 'Gabriel Lima', vinculo: 'Estagiário', departamento: dep.Tecnologia, cargo: 'Estagiário de dados' } }, usuario);
    moverCard(db, cGabriel, fasesAdm[1].id, usuario);
    criarCard(db, pAdm, { titulo: 'Sofia Martins — aprendiz comercial', dados: { nome: 'Sofia Martins', vinculo: 'Jovem aprendiz', departamento: dep.Comercial } }, usuario);
    criarCard(db, pAdm, { titulo: 'Thiago Ribeiro — aprendiz operações', dados: { nome: 'Thiago Ribeiro', vinculo: 'Jovem aprendiz', departamento: dep['Operações'] } }, usuario);

    // 2) Requisições internas → Compras
    const pReq = criarPipe(db, {
      nome: 'Requisições internas',
      descricao: 'Pedidos dos times. Quando o gestor aprova, vira solicitação de compra automaticamente.',
      cor: '#f59e0b',
      fases: ['Nova', 'Análise do gestor', 'Aprovada', 'Concluída'],
    });
    const fasesReq = db.todos('SELECT * FROM fases WHERE pipe_id = ? ORDER BY ordem', pReq);
    criarCampo(db, pReq, { rotulo: 'Produto', tipo: 'produto', chave: 'produto', obrigatorio: true });
    criarCampo(db, pReq, { rotulo: 'Quantidade', tipo: 'numero', chave: 'quantidade', obrigatorio: true });
    criarCampo(db, pReq, { rotulo: 'Departamento', tipo: 'departamento', chave: 'departamento' });
    criarCampo(db, pReq, { rotulo: 'Motivo', tipo: 'texto_longo', chave: 'motivo' });
    criarAutomacao(db, pReq, {
      fase_id: fasesReq[2].id,
      acao: 'criar_solicitacao_compra',
      mapeamento: { produto: { campo: 'produto' }, quantidade: { campo: 'quantidade' }, departamento: { campo: 'departamento' }, justificativa: { campo: 'motivo' } },
    });
    const cTeclado = criarCard(db, pReq, { titulo: 'Kits de teclado para onboarding', responsavel: 'Camila Rocha', dados: { produto: p.teclado, quantidade: 4, departamento: dep.Comercial, motivo: 'Quatro novos vendedores começam no próximo mês.' } }, usuario);
    moverCard(db, cTeclado, fasesReq[1].id, usuario);
    moverCard(db, cTeclado, fasesReq[2].id, usuario);
    const cHead = criarCard(db, pReq, { titulo: 'Headsets para o time comercial', responsavel: 'Camila Rocha', vencimento: somarDias(d, 2), dados: { produto: p.headset, quantidade: 6, departamento: dep.Comercial, motivo: 'Os atuais estão com defeito.' } }, usuario);
    moverCard(db, cHead, fasesReq[1].id, usuario);
    criarCard(db, pReq, { titulo: 'Monitores extras para operações', responsavel: 'Beatriz Nogueira', dados: { produto: p.monitor, quantidade: 3, departamento: dep['Operações'] } }, usuario);

    // 3) Contratos de fornecedores → Financeiro
    const pCon = criarPipe(db, {
      nome: 'Contratos de serviços',
      descricao: 'Revisão e assinatura de contratos. Contrato ativo gera a primeira conta a pagar no Financeiro.',
      cor: '#10b981',
      fases: ['Recebido', 'Revisão', 'Assinatura', 'Ativo'],
    });
    const fasesCon = db.todos('SELECT * FROM fases WHERE pipe_id = ? ORDER BY ordem', pCon);
    criarCampo(db, pCon, { rotulo: 'Fornecedor', tipo: 'parceiro', chave: 'fornecedor', obrigatorio: true });
    criarCampo(db, pCon, { rotulo: 'Valor mensal', tipo: 'moeda', chave: 'valor', obrigatorio: true });
    criarCampo(db, pCon, { rotulo: 'Primeiro vencimento', tipo: 'data', chave: 'vencimento' });
    criarAutomacao(db, pCon, {
      fase_id: fasesCon[3].id,
      acao: 'lancar_titulo',
      mapeamento: { tipo: { valor: 'pagar' }, valor: { campo: 'valor' }, vencimento: { campo: 'vencimento' }, descricao: { campo: '_titulo' }, parceiro: { campo: 'fornecedor' } },
    });
    const cLimpeza = criarCard(db, pCon, { titulo: 'Contrato de manutenção de equipamentos', responsavel: 'Marina Duarte', dados: { fornecedor: c.ponte, valor: reais(1850), vencimento: somarDias(d, 12) } }, usuario);
    moverCard(db, cLimpeza, fasesCon[2].id, usuario);
  });

}
