-- Alicerce ERP — schema
-- Valores monetários em CENTAVOS (INTEGER). Alíquotas em percentual (REAL). Datas em ISO (YYYY-MM-DD).

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sequencias (
  serie  TEXT PRIMARY KEY,
  ultimo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usuarios (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  perfil     TEXT NOT NULL DEFAULT 'admin',
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- Cadastros
CREATE TABLE IF NOT EXISTS departamentos (
  id   INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS parceiros (
  id        INTEGER PRIMARY KEY,
  tipo      TEXT NOT NULL CHECK (tipo IN ('fornecedor', 'cliente', 'ambos')),
  nome      TEXT NOT NULL,
  documento TEXT,
  email     TEXT,
  telefone  TEXT,
  uf        TEXT NOT NULL DEFAULT 'SP',
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS produtos (
  id          INTEGER PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  descricao   TEXT NOT NULL,
  unidade     TEXT NOT NULL DEFAULT 'UN',
  ncm         TEXT,
  custo       INTEGER NOT NULL DEFAULT 0,
  preco       INTEGER NOT NULL DEFAULT 0,
  aliq_icms   REAL NOT NULL DEFAULT 18,
  aliq_ipi    REAL NOT NULL DEFAULT 0,
  aliq_pis    REAL NOT NULL DEFAULT 1.65,
  aliq_cofins REAL NOT NULL DEFAULT 7.6,
  estoque     REAL NOT NULL DEFAULT 0,
  ativo       INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------- Compras
CREATE TABLE IF NOT EXISTS solicitacoes (
  id              INTEGER PRIMARY KEY,
  numero          TEXT NOT NULL UNIQUE,
  solicitante     TEXT NOT NULL,
  departamento_id INTEGER REFERENCES departamentos(id),
  justificativa   TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'reprovada', 'atendida')),
  motivo          TEXT,
  origem_card_id  INTEGER,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  decidido_em     TEXT,
  decidido_por    TEXT
);

CREATE TABLE IF NOT EXISTS solicitacao_itens (
  id             INTEGER PRIMARY KEY,
  solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id),
  quantidade     REAL NOT NULL CHECK (quantidade > 0)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id             INTEGER PRIMARY KEY,
  numero         TEXT NOT NULL UNIQUE,
  fornecedor_id  INTEGER NOT NULL REFERENCES parceiros(id),
  solicitacao_id INTEGER REFERENCES solicitacoes(id),
  status         TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'enviado', 'recebido', 'cancelado')),
  condicao       TEXT NOT NULL DEFAULT '30',
  previsao       TEXT,
  total          INTEGER NOT NULL DEFAULT 0,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  recebido_em    TEXT,
  nota_id        INTEGER
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id         INTEGER PRIMARY KEY,
  pedido_id  INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade REAL NOT NULL CHECK (quantidade > 0),
  preco      INTEGER NOT NULL CHECK (preco >= 0)
);

-- ---------------------------------------------------------------- Fiscal
CREATE TABLE IF NOT EXISTS notas (
  id             INTEGER PRIMARY KEY,
  tipo           TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  numero         INTEGER NOT NULL,
  serie          TEXT NOT NULL DEFAULT '1',
  chave          TEXT NOT NULL,
  parceiro_id    INTEGER NOT NULL REFERENCES parceiros(id),
  emissao        TEXT NOT NULL,
  cfop           TEXT NOT NULL,
  natureza       TEXT NOT NULL,
  condicao       TEXT NOT NULL DEFAULT '30',
  valor_produtos INTEGER NOT NULL,
  valor_icms     INTEGER NOT NULL,
  valor_ipi      INTEGER NOT NULL,
  valor_pis      INTEGER NOT NULL,
  valor_cofins   INTEGER NOT NULL,
  valor_total    INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'cancelada')),
  pedido_id      INTEGER REFERENCES pedidos(id),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nota_itens (
  id             INTEGER PRIMARY KEY,
  nota_id        INTEGER NOT NULL REFERENCES notas(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id),
  quantidade     REAL NOT NULL,
  valor_unitario INTEGER NOT NULL,
  valor_total    INTEGER NOT NULL,
  aliq_icms      REAL NOT NULL,
  valor_icms     INTEGER NOT NULL,
  aliq_ipi       REAL NOT NULL,
  valor_ipi      INTEGER NOT NULL,
  aliq_pis       REAL NOT NULL,
  valor_pis      INTEGER NOT NULL,
  aliq_cofins    REAL NOT NULL,
  valor_cofins   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS apuracoes (
  competencia TEXT PRIMARY KEY,
  gerada_em   TEXT NOT NULL DEFAULT (datetime('now')),
  dados       TEXT NOT NULL
);

-- ---------------------------------------------------------------- Financeiro
CREATE TABLE IF NOT EXISTS contas (
  id            INTEGER PRIMARY KEY,
  nome          TEXT NOT NULL,
  banco         TEXT,
  agencia       TEXT,
  numero        TEXT,
  saldo_inicial INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS titulos (
  id          INTEGER PRIMARY KEY,
  tipo        TEXT NOT NULL CHECK (tipo IN ('pagar', 'receber')),
  descricao   TEXT NOT NULL,
  parceiro_id INTEGER REFERENCES parceiros(id),
  categoria   TEXT NOT NULL DEFAULT 'outros',
  origem      TEXT NOT NULL DEFAULT 'manual',
  origem_id   INTEGER,
  parcela     TEXT NOT NULL DEFAULT '1/1',
  valor       INTEGER NOT NULL CHECK (valor > 0),
  vencimento  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  pago_em     TEXT,
  valor_pago  INTEGER,
  conta_id    INTEGER REFERENCES contas(id),
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_titulos_venc ON titulos (status, vencimento);
CREATE INDEX IF NOT EXISTS idx_titulos_origem ON titulos (origem, origem_id);

CREATE TABLE IF NOT EXISTS movimentos (
  id        INTEGER PRIMARY KEY,
  conta_id  INTEGER NOT NULL REFERENCES contas(id),
  data      TEXT NOT NULL,
  valor     INTEGER NOT NULL,
  descricao TEXT NOT NULL,
  titulo_id INTEGER REFERENCES titulos(id)
);

-- ---------------------------------------------------------------- RH
CREATE TABLE IF NOT EXISTS colaboradores (
  id              INTEGER PRIMARY KEY,
  nome            TEXT NOT NULL,
  cpf             TEXT,
  email           TEXT,
  telefone        TEXT,
  departamento_id INTEGER REFERENCES departamentos(id),
  cargo           TEXT,
  vinculo         TEXT NOT NULL CHECK (vinculo IN ('clt', 'aprendiz', 'estagiario')),
  salario         INTEGER NOT NULL CHECK (salario > 0),
  dependentes     INTEGER NOT NULL DEFAULT 0,
  admissao        TEXT NOT NULL,
  fim_contrato    TEXT,
  instituicao     TEXT,
  status          TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'desligado')),
  desligamento    TEXT,
  origem_card_id  INTEGER
);

CREATE TABLE IF NOT EXISTS folhas (
  id           INTEGER PRIMARY KEY,
  competencia  TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  bruto        INTEGER NOT NULL DEFAULT 0,
  inss         INTEGER NOT NULL DEFAULT 0,
  irrf         INTEGER NOT NULL DEFAULT 0,
  fgts         INTEGER NOT NULL DEFAULT 0,
  liquido      INTEGER NOT NULL DEFAULT 0,
  calculada_em TEXT,
  fechada_em   TEXT
);

CREATE TABLE IF NOT EXISTS folha_itens (
  id             INTEGER PRIMARY KEY,
  folha_id       INTEGER NOT NULL REFERENCES folhas(id) ON DELETE CASCADE,
  colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
  vinculo        TEXT NOT NULL,
  salario        INTEGER NOT NULL,
  inss           INTEGER NOT NULL,
  irrf           INTEGER NOT NULL,
  fgts           INTEGER NOT NULL,
  liquido        INTEGER NOT NULL,
  memoria        TEXT NOT NULL
);

-- ---------------------------------------------------------------- Processos (pipes)
CREATE TABLE IF NOT EXISTS pipes (
  id        INTEGER PRIMARY KEY,
  nome      TEXT NOT NULL,
  descricao TEXT,
  cor       TEXT NOT NULL DEFAULT '#4f46e5',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fases (
  id        INTEGER PRIMARY KEY,
  pipe_id   INTEGER NOT NULL REFERENCES pipes(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  ordem     INTEGER NOT NULL DEFAULT 0,
  concluida INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS campos (
  id          INTEGER PRIMARY KEY,
  pipe_id     INTEGER NOT NULL REFERENCES pipes(id) ON DELETE CASCADE,
  chave       TEXT NOT NULL,
  rotulo      TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  obrigatorio INTEGER NOT NULL DEFAULT 0,
  opcoes      TEXT NOT NULL DEFAULT '[]',
  ordem       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (pipe_id, chave)
);

CREATE TABLE IF NOT EXISTS cards (
  id            INTEGER PRIMARY KEY,
  pipe_id       INTEGER NOT NULL REFERENCES pipes(id) ON DELETE CASCADE,
  fase_id       INTEGER NOT NULL REFERENCES fases(id),
  titulo        TEXT NOT NULL,
  dados         TEXT NOT NULL DEFAULT '{}',
  vinculos      TEXT NOT NULL DEFAULT '[]',
  responsavel   TEXT,
  vencimento    TEXT,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  concluido_em  TEXT
);

CREATE TABLE IF NOT EXISTS card_eventos (
  id      INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tipo    TEXT NOT NULL,
  texto   TEXT NOT NULL,
  usuario TEXT,
  em      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automacoes (
  id         INTEGER PRIMARY KEY,
  pipe_id    INTEGER NOT NULL REFERENCES pipes(id) ON DELETE CASCADE,
  fase_id    INTEGER NOT NULL REFERENCES fases(id) ON DELETE CASCADE,
  acao       TEXT NOT NULL,
  mapeamento TEXT NOT NULL DEFAULT '{}',
  ativo      INTEGER NOT NULL DEFAULT 1
);
