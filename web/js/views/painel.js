import { get } from '../api.js';
import { h, fmt, cabecalho, kpi, etiqueta, vazio } from '../ui.js';
import { graficoSaldo } from '../grafico.js';

export async function painel(alvo) {
  const d = await get('/api/painel');
  const f = d.financeiro;
  const ativos = Object.fromEntries(d.rh.ativos.map((a) => [a.vinculo, a.n]));
  const totalAtivos = d.rh.ativos.reduce((s, a) => s + a.n, 0);
  const vencidos = f.pagarVencido + f.receberVencido;

  alvo.append(
    cabecalho(`Olá! Aqui está o resumo de hoje`, { sub: `${d.empresa.nome} · ${fmt.data(d.hoje)}` }),
    h('div', { class: 'grade grade-4' },
      kpi({ rotulo: 'Saldo em contas', valor: fmt.moeda(f.saldo), detalhe: `Projetado em 30 dias: ${fmt.moeda(f.saldoProjetado30)}` }),
      kpi({ rotulo: 'A receber (7 dias)', valor: fmt.moeda(f.receber7), detalhe: f.receberVencido ? `${fmt.moeda(f.receberVencido)} em atraso` : 'Nada em atraso' }),
      kpi({ rotulo: 'A pagar (7 dias)', valor: fmt.moeda(f.pagar7), detalhe: f.pagarVencido ? `${fmt.moeda(f.pagarVencido)} vencido` : 'Nada vencido' }),
      kpi({ rotulo: 'Títulos vencidos', valor: fmt.moeda(vencidos), alerta: vencidos > 0, detalhe: h('a', { href: '#/financeiro?aba=pagar&status=vencido' }, 'Ver vencidos') }),
    ),
    h('div', { class: 'grade grade-lado', style: { marginTop: '16px' } },
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Saldo projetado — próximos 30 dias'), h('a', { href: '#/financeiro?aba=fluxo' }, 'Fluxo de caixa')),
        h('div', { class: 'cartao-corpo' }, graficoSaldo(f.serie)),
      ),
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Processos'), h('a', { href: '#/processos' }, 'Abrir')),
        d.processos.length
          ? h('ul', { class: 'lista-simples' }, d.processos.map((p) => h('li', null,
              h('a', { href: `#/processos/${p.id}` }, h('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: p.cor, marginRight: '8px' } }), p.nome),
              h('span', { class: 'mudo' }, `${p.abertos} em aberto`, p.atrasados ? h('span', { class: 'erro-txt' }, ` · ${p.atrasados} atrasado(s)`) : null))))
          : vazio('Nenhum processo', null, h('a', { class: 'btn', href: '#/processos' }, 'Criar processo')),
      ),
    ),
    h('div', { class: 'grade grade-3', style: { marginTop: '16px' } },
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Compras'), h('a', { href: '#/compras' }, 'Abrir')),
        h('ul', { class: 'lista-simples' },
          h('li', null, 'Solicitações aguardando aprovação', h('a', { href: '#/compras?aba=solicitacoes&status=pendente' }, h('b', null, d.compras.pendentes))),
          h('li', null, 'Aprovadas sem pedido', h('b', null, d.compras.aprovadas)),
          h('li', null, 'Pedidos em andamento', h('a', { href: '#/compras?aba=pedidos' }, h('b', null, d.compras.pedidosAbertos))),
          h('li', null, 'Entregas atrasadas', h('b', { class: d.compras.atrasados ? 'erro-txt' : '' }, d.compras.atrasados)),
        ),
      ),
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, 'Pessoas'), h('a', { href: '#/rh' }, 'Abrir')),
        h('div', { class: 'cartao-corpo' },
          h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } },
            h('div', null, h('div', { class: 'fraco' }, 'Ativos'), h('b', { style: { fontSize: '20px' } }, totalAtivos)),
            h('div', null, h('div', { class: 'fraco' }, 'CLT'), h('b', { style: { fontSize: '20px' } }, ativos.clt ?? 0)),
            h('div', null, h('div', { class: 'fraco' }, 'Aprendizes'), h('b', { style: { fontSize: '20px' } }, ativos.aprendiz ?? 0)),
            h('div', null, h('div', { class: 'fraco' }, 'Estagiários'), h('b', { style: { fontSize: '20px' } }, ativos.estagiario ?? 0)),
          ),
        ),
        d.rh.alertas.length
          ? h('ul', { class: 'lista-simples', style: { borderTop: '1px solid var(--borda)' } }, d.rh.alertas.map((a) => h('li', null,
              h('a', { href: `#/rh/colaboradores/${a.id}` }, a.nome, ' ', etiqueta(a.vinculo)),
              h('span', { class: a.dias < 30 ? 'erro-txt' : 'mudo' }, a.dias < 0 ? 'contrato vencido' : `termina em ${a.dias} dias`))))
          : h('p', { class: 'cartao-corpo fraco' }, 'Nenhum contrato de aprendiz ou estágio terminando nos próximos 60 dias.'),
      ),
      h('div', { class: 'cartao' },
        h('div', { class: 'cartao-topo' }, h('h2', null, `Fiscal · ${fmt.competencia(d.fiscal.competencia)}`), h('a', { href: '#/fiscal?aba=apuracao' }, 'Apuração')),
        h('ul', { class: 'lista-simples' },
          h('li', null, 'Faturamento (NF de saída)', h('b', null, fmt.moeda(d.fiscal.faturamento))),
          h('li', null, 'Compras (NF de entrada)', h('b', null, fmt.moeda(d.fiscal.compras))),
          h('li', null, 'Tributos estimados a recolher', h('b', null, fmt.moeda(d.fiscal.totalRecolher))),
        ),
        d.estoqueBaixo.length
          ? h('div', { class: 'cartao-corpo', style: { borderTop: '1px solid var(--borda)' } },
              h('div', { class: 'fraco', style: { marginBottom: '6px' } }, 'Estoque baixo (até 5 unidades)'),
              h('div', { class: 'chips' }, d.estoqueBaixo.map((p) => h('span', { class: 'etiqueta aviso' }, `${p.descricao}: ${fmt.numero(p.estoque)} ${p.unidade}`))))
          : null,
      ),
    ),
  );
}
