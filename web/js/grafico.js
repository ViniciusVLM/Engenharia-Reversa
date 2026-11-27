import { h, fmt } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function escalaBonita(min, max, passos = 4) {
  if (min === max) { min -= 1; max += 1; }
  const bruto = (max - min) / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  const ini = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const marcas = [];
  for (let v = ini; v <= fim + passo / 2; v += passo) marcas.push(v);
  return { ini, fim, marcas };
}

/**
 * Linha de saldo projetado (série única) com área, linha do zero e dica ao passar o mouse/dedo.
 * pontos: [{ data, saldo, entradas, saidas }] em centavos.
 */
export function graficoSaldo(pontos, { altura = 220, titulo = 'Saldo projetado' } = {}) {
  const largura = 720;
  const m = { t: 12, r: 12, b: 26, l: 64 };
  const valores = pontos.map((p) => p.saldo);
  const esc = escalaBonita(Math.min(0, ...valores), Math.max(...valores));
  const x = (i) => m.l + (i / Math.max(1, pontos.length - 1)) * (largura - m.l - m.r);
  const y = (v) => m.t + (1 - (v - esc.ini) / (esc.fim - esc.ini)) * (altura - m.t - m.b);

  const svg = s('svg', { viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': `${titulo}: de ${fmt.moeda(valores[0])} a ${fmt.moeda(valores.at(-1))}` });
  const eixo = s('g', { class: 'eixo' });
  for (const v of esc.marcas) {
    eixo.append(s('line', { class: 'grade-linha', x1: m.l, x2: largura - m.r, y1: y(v), y2: y(v) }));
    const t = s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
    t.textContent = fmt.moedaCurta(v);
    eixo.append(t);
  }
  const passoX = Math.ceil(pontos.length / 6);
  pontos.forEach((p, i) => {
    if (i % passoX !== 0 && i !== pontos.length - 1) return;
    const t = s('text', { x: x(i), y: altura - 6, 'text-anchor': i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle' });
    t.textContent = fmt.dataCurta(p.data);
    eixo.append(t);
  });
  svg.append(eixo);

  if (esc.ini < 0) svg.append(s('line', { class: 'zero', x1: m.l, x2: largura - m.r, y1: y(0), y2: y(0) }));

  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
  const base = y(Math.max(esc.ini, 0));
  svg.append(s('path', { class: 'area', d: `${caminho} L${x(pontos.length - 1)},${base} L${x(0)},${base} Z` }));
  svg.append(s('path', { class: 'linha', d: caminho }));

  const mira = s('line', { class: 'mira', y1: m.t, y2: altura - m.b, visibility: 'hidden' });
  const marcador = s('circle', { class: 'marcador', r: 5, visibility: 'hidden' });
  svg.append(mira, marcador);
  // área de captura maior que a linha
  const captura = s('rect', { x: m.l, y: 0, width: largura - m.l - m.r, height: altura, fill: 'transparent' });
  svg.append(captura);

  const dica = h('div', { class: 'dica oculto', role: 'status' });
  const caixa = h('div', { class: 'grafico' }, svg, dica);

  function mostrar(evento) {
    const r = svg.getBoundingClientRect();
    const px = ((evento.clientX - r.left) / r.width) * largura;
    const i = Math.max(0, Math.min(pontos.length - 1, Math.round(((px - m.l) / (largura - m.l - m.r)) * (pontos.length - 1))));
    const p = pontos[i];
    for (const el of [mira, marcador]) el.setAttribute('visibility', 'visible');
    mira.setAttribute('x1', x(i)); mira.setAttribute('x2', x(i));
    marcador.setAttribute('cx', x(i)); marcador.setAttribute('cy', y(p.saldo));
    dica.replaceChildren(
      h('b', null, fmt.data(p.data)),
      h('div', { class: 'linha-dica' }, h('span', null, 'Saldo'), h('span', null, fmt.moeda(p.saldo))),
      p.entradas ? h('div', { class: 'linha-dica' }, h('span', null, 'Entradas'), h('span', null, fmt.moeda(p.entradas))) : null,
      p.saidas ? h('div', { class: 'linha-dica' }, h('span', null, 'Saídas'), h('span', null, fmt.moeda(-p.saidas))) : null,
    );
    dica.classList.remove('oculto');
    const escala = r.width / largura;
    const esquerda = Math.min(Math.max(x(i) * escala, 80), r.width - 80);
    dica.style.left = `${esquerda}px`;
    dica.style.top = `${y(p.saldo) * escala}px`;
  }
  function esconder() {
    for (const el of [mira, marcador]) el.setAttribute('visibility', 'hidden');
    dica.classList.add('oculto');
  }
  captura.addEventListener('pointermove', mostrar);
  captura.addEventListener('pointerdown', mostrar);
  captura.addEventListener('pointerleave', esconder);
  return caixa;
}
