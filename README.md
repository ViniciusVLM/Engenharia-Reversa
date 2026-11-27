# Alicerce ERP

Um ERP com **motor de processos em kanban** e quatro módulos integrados: **Compras, RH, Financeiro e Fiscal**. Funciona no **navegador** e como **aplicativo instalável** (PWA). Os dois usam a mesma API e o mesmo login.

Este é um projeto de estudo de **engenharia reversa**: a ideia foi entender como ferramentas como Pipefy (processos) e TOTVS (ERP) se organizam e reconstruir o essencial do zero, com nome e código próprios. Não é afiliado a nenhuma dessas empresas.

> Ambiente de demonstração: todos os dados (empresa, pessoas, CNPJs, valores) são fictícios.

## O que ele faz

**Processos (estilo Pipefy).** Quadros kanban com fases, campos personalizados por processo (texto, valor, data, lista, produto, fornecedor...), histórico, comentários e **automações**: quando um card entra numa fase, o sistema cria um registro em outro módulo.

| Processo de exemplo | Quando o card chega em... | A automação... |
|---|---|---|
| Admissão de jovens talentos | Admitido | admite o colaborador no **RH** |
| Requisições internas | Aprovada | cria uma solicitação em **Compras** |
| Contratos de serviços | Ativo | lança uma conta a pagar no **Financeiro** |

**Compras.** Solicitação → aprovação/reprovação → pedido de compra (com preço negociado e condição 30/60/90) → recebimento.

**Fiscal.** NF de entrada (gerada pelo recebimento) e NF de venda com cálculo de ICMS, IPI, PIS e COFINS, CFOP automático (dentro/fora do estado), prévia dos tributos antes de emitir, cancelamento e **apuração mensal** (débitos − créditos, com crédito transportado para o mês seguinte). A apuração fechada vira guias no Financeiro.

**Financeiro.** Contas a pagar e a receber (manuais ou geradas pelos outros módulos), parcelamento, baixa e estorno com movimento bancário, contas bancárias com extrato e **fluxo de caixa projetado**.

**RH.** Colaboradores **CLT, jovens aprendizes e estagiários**, com as regras de cada vínculo: contrato de aprendizagem/estágio com término obrigatório e limite de 2 anos, alerta de contratos terminando, e **folha de pagamento** com INSS progressivo, IRRF (incluindo a redução de 2026), FGTS de 8% (CLT) ou 2% (aprendiz), salário proporcional em admissão/desligamento e memória de cálculo de cada holerite. Fechar a folha lança salários, FGTS, INSS e IRRF no Financeiro.

### Como os módulos conversam

```
 Processo (card) ──automação──► Compras / RH / Financeiro

 Solicitação ─► Pedido ─► Recebimento ─┬─► NF de entrada (Fiscal) ─► crédito de impostos
                                       ├─► Estoque +
                                       └─► Contas a pagar (Financeiro)

 NF de venda (Fiscal) ─┬─► Estoque −
                       ├─► Contas a receber (Financeiro)
                       └─► débito de impostos ─► Apuração ─► Guias a pagar (Financeiro)

 Folha (RH) ─► Salários, FGTS, INSS e IRRF a pagar (Financeiro)
```

Cada passo que mexe em mais de um módulo roda numa **transação**: ou tudo é gravado, ou nada.

## Rodar

Requer **Node.js 22.13 ou mais novo**. Não há dependências para instalar.

```bash
npm start
```

Abra `http://localhost:3000` e entre com `admin@alicerce.dev` / `alicerce123` (já vem preenchido). No primeiro início o banco é criado em `dados/alicerce.db` com uma empresa de demonstração e cerca de dois meses de movimento.

```bash
npm run reset   # apaga o banco e recria a demonstração
npm test        # testes de regras (folha, impostos) e de fluxos completos pela API
npm run dev     # reinicia o servidor ao salvar arquivos
```

Variáveis de ambiente opcionais: `PORT`, `HOST`, `ALICERCE_BANCO` (caminho do banco), `ALICERCE_SEGREDO` (segredo dos tokens), `ALICERCE_CORS_ORIGEM` e `ALICERCE_SEM_DEMO=1` (não cria a demonstração).

## Usar como aplicativo

O front-end é um PWA, ou seja, pode ser instalado:

- **Celular na mesma rede:** rode `npm start`. O terminal mostra o endereço da rede local (ex.: `http://192.168.0.10:3000`). Abra esse endereço no celular.
- **Android/Chrome:** menu ⋮ → *Instalar app*. **iPhone/Safari:** Compartilhar → *Adicionar à Tela de Início*.
- **Outro servidor:** na tela de login, *Conectar a outro servidor* aponta o app para qualquer instância da API. A API aceita CORS com token Bearer, então um app nativo (React Native, Flutter, Capacitor) também pode consumi-la.

O app instalado abre em tela cheia, tem navegação inferior no celular e carrega a interface mesmo sem rede. Os dados sempre vêm do servidor e não ficam em cache no aparelho.

## Estrutura

```
server/
  index.js            sobe o servidor e cria a demonstração no primeiro uso
  app.js              HTTP: API REST em /api + arquivos do front-end
  lib/                banco (SQLite nativo do Node), roteador, autenticação, validação, datas
  dominio/            regras puras: tabelas INSS/IRRF, cálculo de folha e de impostos
  modulos/            cadastros, compras, fiscal, financeiro, rh, processos, painel
  db/schema.sql       modelo de dados (valores em centavos)
  db/seed.js          empresa de demonstração
web/
  index.html, sw.js, manifest.webmanifest   casca do PWA
  js/app.js           rotas e layout · js/api.js cliente da API · js/ui.js componentes
  js/views/           uma tela por módulo
test/                 node:test — regras e fluxos ponta a ponta
```

Decisões de projeto:

- **Sem dependências.** O backend usa só a biblioteca padrão do Node (`node:http`, `node:sqlite`, `node:crypto`) e o front-end é JavaScript puro, sem framework e sem build.
- **Dinheiro em centavos** (inteiros) para não haver erro de arredondamento de ponto flutuante.
- **Regras de negócio isoladas em `server/dominio/`**: funções puras, fáceis de testar e de atualizar quando a legislação muda.
- **Autenticação** com senha em `scrypt` e token assinado (HMAC-SHA256), sem estado no servidor.

## Limites conhecidos (importante)

O projeto é demonstrativo e **não substitui um ERP homologado**:

- **Notas fiscais são simuladas.** Não há transmissão à SEFAZ, certificado digital nem XML/DANFE oficiais. A chave de acesso é gerada localmente.
- **Cálculo fiscal simplificado.** Considera regime não cumulativo, ICMS interestadual fixo de 12% e ICMS excluído da base de PIS/COFINS. Ficam de fora: substituição tributária, DIFAL, FCP, benefícios fiscais, Simples Nacional e os novos IBS/CBS da reforma tributária.
- **Folha simplificada.** Ficam de fora: férias, 13º, rescisão, horas extras, INSS patronal, eSocial e feriados no cálculo do 5º dia útil.
- **Tabelas de INSS/IRRF** estão em `server/dominio/tabelas.js` como valores de referência para 2025 e 2026. **Confira com a contabilidade** antes de qualquer uso real.
- **Usuário único** (perfil administrador). Não há controle de permissões por perfil.

## Próximos passos

Permissões por perfil, aprovação em múltiplos níveis em Compras, campos obrigatórios por fase nos processos, anexos nos cards, férias e 13º no RH, conciliação bancária (OFX) e exportação de relatórios.

## Licença

MIT
