'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const N0 = n => Math.round(n || 0).toLocaleString('pt-BR');
const PCT = n => (n == null ? '–' : Math.round(n) + '%');
const D = iso => (iso ? iso.split('-').reverse().join('/') : '');
const DM = iso => (iso ? iso.slice(8) + '/' + iso.slice(5, 7) : '');
const utc = iso => Date.parse(iso + 'T00:00:00Z');
const dias = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const compacto = n => (n >= 1e6 ? (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : n >= 1e3 ? (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : N0(n));
const dec = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));

const ICON = {
  geral: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  orcamento: '<path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h3"/>',
  cronograma: '<path d="M3 5h18M3 12h12M3 19h8M7 3v4M15 10v4M11 17v4"/>',
  financeiro: '<path d="M3 7h18v12H3zM3 11h18M7 15h4"/>',
  documentos: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"/>',
  fornecedores: '<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h2M13 11h2"/>',
  usuarios: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5M18 14c2 .7 3 2.5 3 5"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const VIEWS = [['geral', 'Visão geral'], ['importar', 'Importar'], ['orcamento', 'Orçamento'], ['cronograma', 'Cronograma'], ['financeiro', 'Financeiro'], ['fornecedores', 'Fornecedores'], ['documentos', 'Documentos'], ['usuarios', 'Usuários']];

const S = { fila: [], forn: [], etapas: [], user: null, setup: false, codigo: false, obras: [], obra: null, view: 'geral', orc: [] };

/* ---------- rede ---------- */
async function api(u, o) {
  const r = await fetch(u, o);
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !u.startsWith('/api/auth/')) { S.user = null; telaEntrada(); throw new Error('faça login'); }
  if (!r.ok) throw new Error(d.erro || 'Algo deu errado (' + r.status + ')');
  return d;
}
const enviar = (u, b, m = 'POST') => api(u, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const arquivo = (u, f) => { const fd = new FormData(); fd.append('arquivo', f); return api(u, { method: 'POST', body: fd }); };
const O = () => `/api/obras/${S.obra}`;

function aviso(txt, erro) {
  const d = document.createElement('div'); d.textContent = txt; if (erro) d.className = 'erro';
  $('#avisos').append(d); setTimeout(() => d.remove(), erro ? 6000 : 3200);
}
// executa uma ação mostrando o erro como aviso; recarrega a tela se der certo
async function agir(fn, ok, recarregar = true) {
  try { const r = await fn(); if (ok) aviso(ok); if (recarregar) await tela(); return r; }
  catch (e) { if (e.message !== 'faça login') aviso(e.message, true); }
}

/* ---------- diálogo ---------- */
function perguntar({ titulo, texto, campos = [], ok = 'Confirmar', perigo }) {
  return new Promise(res => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form method="dialog"><h3>${esc(titulo)}</h3>${texto ? `<p class="mut" style="margin:0 0 10px">${esc(texto)}</p>` : ''}
      ${campos.map(c => `<label class="campo" style="margin-bottom:8px">${esc(c.rot)}<input name="${c.id}" type="${c.tipo || 'text'}" value="${esc(c.valor ?? '')}" ${c.passo ? `step="${c.passo}"` : ''} ${c.req ? 'required' : ''}></label>`).join('')}
      <div class="rodape"><button class="btn vazado" value="cancelar" formnovalidate>Cancelar</button><button class="btn ${perigo ? 'perigo' : 'amarelo'}" value="ok">${esc(ok)}</button></div></form>`;
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return res(null);
      const o = {}; $$('input', dlg).forEach(i => (o[i.name] = i.value)); res(o);
    };
    dlg.showModal(); const p = $('input', dlg); if (p) p.select();
  });
}

/* ---------- entrada ---------- */
function telaEntrada() {
  $('#raiz').innerHTML = `<div class="entrada"><div class="lado">
    <div class="marca">${logo()}<div><b>Gestão de Obras</b><small>Custo · prazo · caixa</small></div></div>
    <div><h1>Custo e avanço,<br><em>lado a lado.</em></h1><p>Orçamento, cronograma, contas a pagar e documentos de cada obra, num só lugar.</p></div>
    <div class="linha-cota">acesso restrito</div></div>
    <div class="form-lado"><form id="fe" novalidate><h2>${S.setup ? 'Criar administrador' : 'Entrar'}</h2>
    ${S.setup ? '<p class="mut" style="margin:0">Primeiro acesso: cadastre quem vai administrar o sistema.</p><label class="campo">Nome<input name="nome" autocomplete="name"></label>' : ''}
    ${S.setup && S.codigo ? '<label class="campo">Código de instalação<input name="codigo" type="password" autocomplete="off"></label>' : ''}
    <label class="campo">E-mail<input name="email" type="email" autocomplete="username"></label>
    <label class="campo">Senha${S.setup ? ' (mínimo 8 caracteres)' : ''}<input name="senha" type="password" autocomplete="${S.setup ? 'new-password' : 'current-password'}"></label>
    <div class="msg-erro" id="me" role="alert"></div><button class="btn amarelo" type="submit">${S.setup ? 'Criar e entrar' : 'Entrar'}</button></form></div></div>`;
  $('#fe').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); $('#me').textContent = '';
    try { S.user = await enviar('/api/auth/' + (S.setup ? 'setup' : 'login'), f); await abrir(); }
    catch (er) { $('#me').textContent = er.message; }
  };
}
const logo = () => `<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#f5b800"/><path d="M6 24h20M9 24V12l7-5 7 5v12" fill="none" stroke="#1a1400" stroke-width="2.4" stroke-linejoin="round"/></svg>`;

/* ---------- casca ---------- */
async function abrir() {
  S.obras = await api('/api/obras');
  if (!S.obras.some(o => o.id == S.obra)) S.obra = S.obras[0]?.id ?? null;
  casca(); await tela();
}
function casca() {
  const u = S.user;
  $('#raiz').innerHTML = `<div class="app"><aside class="lateral">
    <div class="marca">${logo()}<div><b>Gestão de Obras</b><small>Custo · prazo · caixa</small></div></div>
    <div class="seletor"><label for="sel">Obra</label><select id="sel">${S.obras.map(o => `<option value="${o.id}" ${o.id == S.obra ? 'selected' : ''}>${esc(o.nome)}</option>`).join('') || '<option>Nenhuma obra</option>'}</select></div>
    <button class="btn vazado mini" data-act="novaObra" style="color:#fff;border-color:#2f4556;align-self:flex-start">+ Nova obra</button>
    <nav class="nav" aria-label="Seções">${VIEWS.filter(v => v[0] !== 'usuarios' || u.papel === 'admin').map(([k, n]) =>
      `<a href="#/${k}" data-v="${k}">${ico(k)}<span>${n}</span>${k === 'financeiro' ? '<span class="badge" id="bd" hidden></span>' : ''}</a>`).join('')}</nav>
    <div class="carimbo"><div><small>Responsável</small><b>${esc(u.nome)}</b></div><div><small>Perfil</small><b>${{ admin: 'Administrador', editor: 'Editor', leitura: 'Somente leitura' }[u.papel]}</b></div><div><small>${esc(u.email)}</small><button data-act="sair">Sair</button></div></div>
  </aside><main class="principal" id="main"></main></div>`;
  $('#sel').onchange = e => { S.obra = Number(e.target.value); tela(); };
}
function rota() { const v = (location.hash.match(/^#\/(\w+)/) || [])[1]; S.view = VIEWS.some(x => x[0] === v) ? v : 'geral'; }
window.addEventListener('hashchange', () => { if (S.user) tela(); });

async function tela() {
  rota();
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.v === S.view ? 'page' : 'false'));
  const m = $('#main'); if (!m) return;
  if (S.view === 'usuarios' && S.user.papel !== 'admin') { location.hash = '#/geral'; return; }
  if (!S.obra && !['usuarios', 'fornecedores'].includes(S.view)) {
    m.innerHTML = cab('Comece por aqui', 'Nenhuma obra') + `<div class="cartao"><div class="vazio"><b>Cadastre a primeira obra</b>Depois importe o orçamento por planilha para ver custo e avanço.<br><br><button class="btn amarelo" data-act="novaObra">Nova obra</button></div></div>`;
    return;
  }
  const y = window.scrollY;
  try { m.innerHTML = await VIEW[S.view](); } catch (e) { if (e.message !== 'faça login') m.innerHTML = `<div class="cartao"><div class="vazio"><b>Não foi possível carregar</b>${esc(e.message)}</div></div>`; return; }
  window.scrollTo(0, y); badge(); if (POS[S.view]) POS[S.view]();
}
async function badge() {
  try { const p = await api('/api/painel'); const n = p.atrasadas.contas.filter(c => c.obra_id == S.obra).length; const b = $('#bd'); if (b) { b.hidden = !n; b.textContent = n; } } catch {}
}
const nomeObra = () => S.obras.find(o => o.id == S.obra)?.nome || '';
const cab = (rastro, titulo, extra = '') => `<div class="topo"><div><div class="rastro">${esc(rastro)}</div><h1>${esc(titulo)}</h1></div>${extra}</div>`;
const hojeTxt = h => `<div class="data">${new Date(h + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}<b>${D(h)}</b></div>`;

/* ---------- régua da etapa ---------- */
function regua(e) {
  const gp = e.previsto ? (e.gasto / e.previsto) * 100 : (e.gasto > 0 ? 100.01 : 0);
  const max = Math.max(100, gp), pos = v => Math.min(Math.max(v, 0), max) / max * 100;
  return `<div class="regua" role="img" aria-label="Gasto ${PCT(gp)}, físico ${PCT(e.pct_fisico)}${e.pct_planejado != null ? ', planejado ' + PCT(e.pct_planejado) : ''}">
    <div class="trilho"></div><div class="gasto ${gp > 100 ? 'estouro' : ''}" style="width:${pos(gp)}%"></div>
    <i class="teto" style="left:${100 / max * 100}%"></i>
    ${e.pct_planejado != null ? `<i class="plan" style="left:${pos(e.pct_planejado)}%"></i>` : ''}
    <i class="fisico" style="left:${pos(e.pct_fisico)}%"></i></div>`;
}
const TAG = { concluida: ['ok', 'Concluída'], atrasada: ['ruim', 'Atrasada'], em_dia: ['ok', 'Em dia'], nao_iniciada: ['', 'Não iniciada'], sem_prazo: ['', 'Sem prazo'] };
const tag = s => `<span class="tag ${TAG[s][0]}">${TAG[s][1]}</span>`;

/* ---------- telas ---------- */
const VIEW = {}, POS = {};

VIEW.geral = async () => {
  const [rel, av, cs] = await Promise.all([api(O() + '/relatorio'), api(O() + '/avanco'), api(O() + '/contas')]);
  const abertas = cs.filter(c => c.status !== 'pago'), atras = abertas.filter(c => c.status === 'atrasado');
  const totAb = abertas.reduce((a, c) => a + c.valor, 0), totAt = atras.reduce((a, c) => a + c.valor, 0);
  const fis = av.pct_fisico_obra, gp = rel.pct;
  let cmp = 'Sem orçamento para comparar';
  if (gp != null) { const d = gp - fis; cmp = Math.abs(d) <= 5 ? 'Gasto alinhado ao físico' : d > 0 ? `Gasto ${Math.round(d)} pontos acima do físico` : `Físico ${Math.round(-d)} pontos acima do gasto`; }

  // fila de atenção
  const at = [];
  atras.slice(0, 4).forEach(c => at.push(['ruim', '!', `Conta atrasada: ${c.fornecedor || c.descricao || 'sem descrição'}`, `${BRL(c.valor)} · venceu em ${D(c.vencimento)} · ${c.etapa}`, `<button class="btn mini" data-act="pagar" data-id="${c.id}">Pagar</button>`]));
  abertas.filter(c => c.status === 'vence_hoje').forEach(c => at.push(['aviso', '•', `Vence hoje: ${c.fornecedor || c.descricao}`, `${BRL(c.valor)} · ${c.etapa}`, `<button class="btn mini" data-act="pagar" data-id="${c.id}">Pagar</button>`]));
  av.etapas.forEach(e => {
    const ir = `<a class="lk" href="#/cronograma">Ver</a>`;
    if (e.status === 'atrasada') at.push(['ruim', '!', `Etapa atrasada: ${e.etapa}`, `Físico ${PCT(e.pct_fisico)}${e.pct_planejado != null ? ' · planejado ' + PCT(e.pct_planejado) : ''}${e.fim ? ' · prazo ' + D(e.fim) : ''}`, ir]);
    if (e.previsto > 0 && e.gasto > e.previsto) at.push(['ruim', '▲', `Orçamento estourado: ${e.etapa}`, `${BRL(e.gasto - e.previsto)} acima do previsto`, `<a class="lk" href="#/orcamento">Ver</a>`]);
    else if (e.previsto === 0 && e.gasto > 0) at.push(['aviso', '?', `Gasto sem orçamento: ${e.etapa}`, `${BRL(e.gasto)} pagos em etapa sem previsão`, `<a class="lk" href="#/orcamento">Orçar</a>`]);
    else if (e.pago_alem_do_fisico > 0 && e.status !== 'concluida') at.push(['aviso', '↑', `Pago acima do avanço: ${e.etapa}`, `${BRL(e.pago_alem_do_fisico)} a mais que o físico medido`, `<a class="lk" href="#/cronograma">Medir</a>`]);
  });

  // fluxo: próximas 8 semanas (contas em aberto desta obra)
  const sem = Array.from({ length: 8 }, (_, i) => {
    const ini = addDia(av.hoje, i * 7), fim = addDia(av.hoje, i * 7 + 6);
    return { ini, fim, v: abertas.filter(c => c.vencimento >= ini && c.vencimento <= fim).reduce((a, c) => a + c.valor, 0) };
  });
  const mx = Math.max(1, ...sem.map(s => s.v));

  return cab(nomeObra(), 'Visão geral', hojeTxt(av.hoje)) + `
  <div class="grade g4" style="margin-bottom:16px">
    <div class="cartao kpi"><div class="rot">Orçado</div><div class="val"><small>R$</small>${N0(rel.previsto)}</div><div class="sub">${(n => n + (n === 1 ? ' etapa orçada' : ' etapas orçadas'))(av.etapas.filter(e => e.previsto > 0).length)}</div></div>
    <div class="cartao kpi"><div class="rot">Gasto até agora</div><div class="val"><small>R$</small>${N0(rel.gasto)}</div><div class="sub">${PCT(gp)} do orçado · saldo ${BRL(rel.saldo)}</div><div class="barra"><i style="width:${Math.min(gp || 0, 100)}%;${gp > 100 ? 'background:var(--perigo)' : ''}"></i></div></div>
    <div class="cartao kpi ${atras.length ? 'alerta' : ''}"><div class="rot">A pagar em aberto</div><div class="val"><small>R$</small>${N0(totAb)}</div><div class="sub">${atras.length ? `<b class="neg">${atras.length} atrasada${atras.length > 1 ? 's' : ''}</b> · ${BRL(totAt)}` : 'Nenhuma conta atrasada'}</div></div>
    <div class="cartao kpi"><div class="rot">Avanço físico</div><div class="val">${fis.toFixed(0)}<small style="margin:0 0 0 2px">%</small></div><div class="sub">${cmp}</div><div class="barra"><i style="width:${fis}%;background:var(--amarelo)"></i></div></div>
  </div>
  <div class="grade g2" style="margin-bottom:16px">
    <section class="cartao"><header><h2>Etapas: gasto × físico × prazo</h2></header>
      <div class="reguas">${av.etapas.length ? av.etapas.map(e => `<div class="lin-etapa"><div class="nome">${esc(e.etapa)}<small>${tag(e.status)}</small></div>${regua(e)}<div class="vals">${BRL(e.gasto)}<br><span>de ${BRL(e.previsto)}</span></div></div>`).join('') : `<div class="vazio"><b>Sem etapas ainda</b>Importe o orçamento em <a class="lk" href="#/orcamento">Orçamento</a>.</div>`}</div>
      <div class="legenda"><span><i class="l-gasto"></i>Gasto</span><span><i class="l-fis"></i>Avanço físico</span><span><i class="l-plan"></i>Planejado</span><span><i class="l-teto"></i>Teto do orçamento</span></div></section>
    <section class="cartao"><header><h2>Precisa de atenção</h2><small>${at.length ? at.length + (at.length > 1 ? ' itens' : ' item') : ''}</small></header>
      ${at.length ? `<ul class="atencao">${at.slice(0, 8).map(([t, g, a, b, ac]) => `<li><span class="ico ${t}">${g}</span><div><b>${esc(a)}</b><small>${esc(b)}</small></div><div>${ac}</div></li>`).join('')}</ul>` : `<div class="tudo-certo">✓ Nada pedindo atenção agora.</div>`}</section>
  </div>
  <section class="cartao"><header><h2>Contas a pagar · próximas 8 semanas</h2><small>${BRL(sem.reduce((a, s) => a + s.v, 0))} em aberto no período</small></header>
    <div class="fluxo">${sem.map((s, i) => `<div><span class="v">${s.v ? compacto(s.v) : ''}</span><div class="col ${s.v ? (i === 0 ? 'atual' : '') : 'vazia'}" style="height:${s.v ? Math.max(s.v / mx * 100, 4) * 0.78 : 2}%"></div><small>${DM(s.ini)}</small></div>`).join('')}</div>
    <div class="fluxo-leg">Cada barra é uma semana, começando em ${D(av.hoje)}. Contas atrasadas não entram aqui; estão na fila de atenção.</div></section>`;
};
const addDia = (iso, n) => { const d = new Date(utc(iso)); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

VIEW.orcamento = async () => {
  S.orc = await api(O() + '/orcamento');
  const tot = S.orc.reduce((a, o) => a + o.total, 0);
  return cab(nomeObra(), 'Orçamento', `<div class="data">Total orçado<b class="num" id="orcTot">${BRL(tot)}</b></div>`) + `
  <div class="grade g2e" style="margin-bottom:16px">
    <section class="cartao"><header><h2>Importar planilha</h2></header><div class="corpo">
      <div class="caixa-arq"><b>Orçamento (xlsx ou csv)</b><small>Colunas: Etapa, Item, Unidade, Qtd, Valor unitário, Total. Substitui o orçamento atual.</small><input type="file" accept=".xlsx,.xls,.csv" data-change="importOrc" aria-label="Arquivo de orçamento"></div></div></section>
    <section class="cartao"><header><h2>Adicionar item</h2></header><div class="corpo"><div class="form" style="margin:0">
      <label class="campo">Etapa<input id="ne"></label><label class="campo">Item<input id="ni"></label><label class="campo">Un.<input id="nu"></label>
      <label class="campo">Qtd<input id="nq" inputmode="decimal"></label><label class="campo">Valor unit.<input id="nv" inputmode="decimal"></label><button class="btn amarelo" data-act="itemNovo">Adicionar</button></div></div></section></div>
  <section class="cartao"><header><h2>Itens do orçamento</h2><small>Edite direto na tabela; o valor salva ao sair do campo</small></header><div class="corpo sem-pad rolar">
    ${S.orc.length ? `<table><thead><tr><th>Etapa<th>Item<th>Un.<th class="r">Qtd<th class="r">Valor unit.<th class="r">Total<th></tr></thead><tbody>
    ${S.orc.map(o => `<tr data-id="${o.id}"><td><input data-f="etapa" value="${esc(o.etapa)}" data-change="itemSalva"><td><input data-f="item" value="${esc(o.item)}" data-change="itemSalva"><td style="width:70px"><input data-f="unidade" value="${esc(o.unidade)}" data-change="itemSalva"><td style="width:110px"><input class="mono" data-f="qtd" value="${o.qtd}" data-change="itemSalva" style="text-align:right"><td style="width:130px"><input class="mono" data-f="valor_unit" value="${o.valor_unit}" data-change="itemSalva" style="text-align:right"><td class="r" data-tot>${BRL(o.total)}<td class="acoes"><button class="lk perigo" data-act="itemDel" data-id="${o.id}">Excluir</button></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td class="r" id="orcTot2">${BRL(tot)}</td><td></td></tr></tfoot></table>` : `<div class="vazio"><b>Orçamento vazio</b>Importe uma planilha ou adicione o primeiro item.</div>`}</div></section>`;
};

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
VIEW.cronograma = async () => {
  const av = await api(O() + '/avanco');
  const com = av.etapas.filter(e => e.inicio && e.fim);
  let g = '';
  if (com.length) {
    let min = com.map(e => e.inicio).sort()[0], max = com.map(e => e.fim).sort().slice(-1)[0];
    if (av.hoje < min) min = av.hoje; if (av.hoje > max) max = av.hoje;
    min = addDia(min, -2); max = addDia(max, 2);
    const span = dias(min, max), pc = iso => (dias(min, iso) / span) * 100;
    const meses = []; let d = new Date(utc(min)); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.toISOString().slice(0, 10) <= max) { const iso = d.toISOString().slice(0, 10); meses.push(`<span style="left:${pc(iso)}%">${MES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}</span>`); d.setUTCMonth(d.getUTCMonth() + 1); }
    g = `<div class="rolar"><div class="gantt"><div class="g-cab"><div>Etapa</div><div class="g-meses">${meses.join('')}</div></div>
      ${av.etapas.map(e => e.inicio && e.fim ? `<div class="g-lin"><div class="nome">${esc(e.etapa)}</div><div class="g-trilho"><div class="g-hoje" style="left:${pc(av.hoje)}%"></div>
        <div class="g-barra ${e.status === 'atrasada' ? 'atrasada' : e.status === 'concluida' ? 'concluida' : ''}" style="left:${pc(e.inicio)}%;width:${Math.max(pc(addDia(e.fim, 1)) - pc(e.inicio), 1)}%" title="${D(e.inicio)} a ${D(e.fim)} · físico ${PCT(e.pct_fisico)}"><i style="width:${e.pct_fisico}%"></i></div></div></div>` : `<div class="g-lin"><div class="nome">${esc(e.etapa)}</div><div class="g-sem">Sem datas. Defina início e fim na tabela abaixo.</div></div>`).join('')}</div></div>
      <div class="legenda" style="padding-top:10px"><span><i class="l-gasto"></i>Parte preenchida = avanço físico medido</span><span><i style="width:0;height:12px;border-left:2px solid var(--amarelo)"></i>Hoje</span></div>`;
  } else g = `<div class="vazio"><b>Nenhuma etapa com prazo</b>Defina início e fim de cada etapa na tabela abaixo para ver o Gantt.</div>`;
  return cab(nomeObra(), 'Cronograma e avanço', hojeTxt(av.hoje)) + `
  <section class="cartao" style="margin-bottom:16px"><header><h2>Linha do tempo</h2><small>Obra a ${av.pct_fisico_obra.toFixed(1)}% no físico</small></header><div class="corpo sem-pad">${g}</div></section>
  <section class="cartao"><header><h2>Etapas</h2><small>Prazo e medição física</small></header><div class="corpo sem-pad rolar">
  ${av.etapas.length ? `<table><thead><tr><th>Etapa<th>Início<th>Fim<th class="r">Físico<th class="r">Planejado<th>Situação<th class="r">Valor medido<th class="r">A pagar<th></tr></thead><tbody>
  ${av.etapas.map(e => `<tr data-etapa="${esc(e.etapa)}"><td><b>${esc(e.etapa)}</b><td style="width:150px"><input type="date" data-f="inicio" value="${e.inicio || ''}" data-change="prazo"><td style="width:150px"><input type="date" data-f="fim" value="${e.fim || ''}" data-change="prazo">
   <td class="r">${PCT(e.pct_fisico)}<td class="r">${PCT(e.pct_planejado)}<td>${tag(e.status)}<td class="r">${BRL(e.valor_fisico)}
   <td class="r ${e.pago_alem_do_fisico ? 'neg' : ''}">${e.pago_alem_do_fisico ? '−' + BRL(e.pago_alem_do_fisico) : BRL(e.a_pagar_sugerido)}<td class="acoes"><button class="btn mini vazado" data-act="medir" data-etapa="${esc(e.etapa)}" data-pct="${e.pct_fisico}">Medir</button></tr>`).join('')}</tbody></table>
  <div class="fluxo-leg">Planejado = avanço linear entre início e fim. A pagar = valor medido menos o já pago; em vermelho, já se pagou além do físico. Etapa atrasada: prazo vencido, ou físico 10 pontos abaixo do planejado.</div>` : `<div class="vazio"><b>Sem etapas</b>As etapas vêm do orçamento. Importe-o primeiro.</div>`}</div></section>`;
};

const STC = { atrasado: ['ruim', 'Atrasada'], vence_hoje: ['aviso', 'Vence hoje'], a_pagar: ['', 'A pagar'], pago: ['ok', 'Paga'] };
VIEW.financeiro = async () => {
  const [cs, gs] = await Promise.all([api(O() + '/contas'), api(O() + '/gastos')]);
  const ab = cs.filter(c => c.status !== 'pago');
  return cab(nomeObra(), 'Financeiro', `<div class="data">Em aberto<b class="num">${BRL(ab.reduce((a, c) => a + c.valor, 0))}</b></div>`) + `
  <section class="cartao" style="margin-bottom:16px"><header><h2>Contas a pagar</h2><small>Ao pagar, o valor entra nos gastos da etapa</small></header><div class="corpo">
    <div class="form"><label class="campo">Fornecedor<input id="cf"></label><label class="campo">Etapa<input id="ce"></label><label class="campo">Descrição<input id="cd"></label>
    <label class="campo">Vencimento<input id="cv" type="date"></label><label class="campo">Valor<input id="cm" inputmode="decimal" placeholder="0,00"></label><label class="campo">Parcelas<input id="cp" type="number" min="1" max="60" value="1"></label>
    <button class="btn amarelo" data-act="conta">Adicionar</button></div></div>
    <div class="rolar">${cs.length ? `<table><thead><tr><th>Vencimento<th>Fornecedor<th>Etapa<th>Descrição<th class="r">Valor<th>Situação<th></tr></thead><tbody>
    ${cs.map(c => `<tr><td class="n">${D(c.vencimento)}<td>${esc(c.fornecedor || '–')}<td>${esc(c.etapa)}<td>${esc(c.descricao)}<td class="r">${BRL(c.valor)}<td><span class="tag ${STC[c.status][0]}">${STC[c.status][1]}${c.pago_em ? ' · ' + DM(c.pago_em) : ''}</span>
    <td class="acoes">${c.pago_em ? `<button class="lk" data-act="estornar" data-id="${c.id}">Estornar</button>` : `<button class="btn mini" data-act="pagar" data-id="${c.id}">Pagar</button> <button class="lk perigo" data-act="delConta" data-id="${c.id}">Excluir</button>`}</tr>`).join('')}</tbody></table>`
    : `<div class="vazio"><b>Nenhuma conta lançada</b>Adicione a primeira conta acima. Para parcelar, informe o número de parcelas.</div>`}</div></section>
  <div class="grade g2e"><section class="cartao"><header><h2>Importar gastos já realizados</h2></header><div class="corpo"><div class="caixa-arq"><b>Gastos (xlsx ou csv)</b><small>Colunas: Etapa, Descrição, Fornecedor, Data, Valor. Soma aos gastos existentes. Use para trazer o histórico de uma obra em andamento.</small><input type="file" accept=".xlsx,.xls,.csv" data-change="importGastos" aria-label="Arquivo de gastos"></div></div></section>
  <section class="cartao"><header><h2>Lançar gasto avulso</h2></header><div class="corpo"><div class="form" style="margin:0"><label class="campo">Etapa<input id="ge"></label><label class="campo">Descrição<input id="gd"></label><label class="campo">Fornecedor<input id="gf"></label><label class="campo">Data<input id="gt" type="date"></label><label class="campo">Valor<input id="gv" inputmode="decimal"></label><button class="btn amarelo" data-act="gasto">Lançar</button></div></div></section></div>
  <section class="cartao" style="margin-top:16px"><header><h2>Gastos pagos</h2><small>${gs.length} lançamento${gs.length === 1 ? '' : 's'}${gs.length > 50 ? ' · mostrando os 50 mais recentes' : ''}</small></header><div class="corpo sem-pad rolar">
  ${gs.length ? `<table><thead><tr><th>Data<th>Etapa<th>Descrição<th>Fornecedor<th class="r">Valor<th></tr></thead><tbody>${gs.slice(0, 50).map(g => `<tr><td class="n">${D(g.data)}<td>${esc(g.etapa)}<td>${esc(g.descricao)}<td>${esc(g.fornecedor || '–')}<td class="r">${BRL(g.valor)}<td class="acoes">${g.conta_id ? '<span class="tag">via conta</span>' : `<button class="lk perigo" data-act="delGasto" data-id="${g.id}">Excluir</button>`}</tr>`).join('')}</tbody></table>` : `<div class="vazio"><b>Nenhum gasto ainda</b>Pague uma conta, importe o histórico ou lance um gasto avulso.</div>`}</div></section>`;
};

VIEW.documentos = async () => {
  const ds = await api(O() + '/documentos');
  return cab(nomeObra(), 'Documentos') + `<div class="grade g2e"><section class="cartao"><header><h2>Enviar arquivo</h2></header><div class="corpo"><div class="caixa-arq"><b>PDF, imagem ou planilha</b><small>Contratos, notas fiscais, projetos, medições. Até 4 MB por arquivo.</small><input type="file" data-change="docUp" aria-label="Arquivo"></div></div></section>
  <section class="cartao"><header><h2>Arquivos da obra</h2><small>${ds.length}</small></header>${ds.length ? `<ul class="atencao">${ds.map(d => `<li><span class="ico info">${/\.pdf$/i.test(d.nome) ? 'PDF' : '▤'}</span><div><b>${esc(d.nome)}</b><small>enviado em ${esc(d.enviado_em)}</small></div><a class="btn mini vazado" href="/api/documentos/${d.id}/download">Baixar</a></li>`).join('')}</ul>` : `<div class="vazio"><b>Nenhum documento</b>Envie o primeiro arquivo ao lado.</div>`}</section></div>`;
};

VIEW.usuarios = async () => {
  const us = await api('/api/usuarios');
  return cab('Administração', 'Usuários') + `<div class="grade g2"><section class="cartao"><header><h2>Quem tem acesso</h2></header><div class="corpo sem-pad rolar"><table><thead><tr><th>Nome<th>E-mail<th>Perfil<th></tr></thead><tbody>
  ${us.map(u => `<tr><td><b>${esc(u.nome)}</b><td>${esc(u.email)}<td><span class="tag ${u.papel === 'admin' ? 'info' : ''}">${{ admin: 'Administrador', editor: 'Editor', leitura: 'Somente leitura' }[u.papel]}</span><td class="acoes">${u.id === S.user.id ? '<span class="mut3">você</span>' : `<button class="lk perigo" data-act="delUsuario" data-id="${u.id}">Excluir</button>`}</tr>`).join('')}</tbody></table></div></section>
  <section class="cartao"><header><h2>Novo usuário</h2></header><div class="corpo"><div class="form" style="grid-template-columns:1fr"><label class="campo">Nome<input id="un"></label><label class="campo">E-mail<input id="ue" type="email"></label><label class="campo">Senha (mínimo 8)<input id="us" type="password" autocomplete="new-password"></label>
  <label class="campo">Perfil<select id="up"><option value="editor">Editor: lança e altera</option><option value="leitura">Somente leitura: só consulta</option><option value="admin">Administrador: também gerencia usuários</option></select></label><button class="btn amarelo" data-act="novoUsuario">Adicionar usuário</button></div></div></section></div>`;
};


/* ---------- importação: soltar arquivos, conferir, gravar ---------- */
const CAMPOS_UI = {
  orcamento: [['etapa', 'Etapa'], ['item', 'Item'], ['unidade', 'Unidade'], ['qtd', 'Quantidade'], ['valor_unit', 'Valor unitário'], ['total', 'Total']],
  materiais: [['etapa', 'Etapa'], ['item', 'Item'], ['unidade', 'Unidade'], ['qtd', 'Quantidade']],
  gastos: [['data', 'Data'], ['etapa', 'Etapa'], ['descricao', 'Descrição'], ['fornecedor', 'Fornecedor'], ['valor', 'Valor']],
  fornecedores: [['nome', 'Nome ou razão social'], ['cnpj', 'CNPJ'], ['especialidade', 'Especialidade'], ['cidade', 'Cidade'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['contato', 'Contato']],
};
const TIPO_OPC = [['orcamento', 'Orçamento'], ['materiais', 'Lista de materiais'], ['gastos', 'Gastos pagos'], ['fornecedores', 'Fornecedores'], ['nota_fiscal', 'Nota fiscal'], ['cotacao', 'Cotação (só guardar)'], ['documento', 'Só guardar em Documentos']];
const ehPlan = t => !!CAMPOS_UI[t];
let filaSeq = 0;

VIEW.importar = async () => {
  S.etapas = (await api(O() + '/avanco')).etapas.map(e => e.etapa);
  return cab(nomeObra(), 'Importar') + `
  <section class="cartao"><div class="corpo"><div class="zona" data-zona>
    <h3>Solte aqui os arquivos da obra</h3><p>O sistema identifica o que cada um é e mostra o que entendeu antes de gravar qualquer coisa.</p>
    <label class="btn amarelo" style="cursor:pointer">Escolher arquivos<input type="file" multiple accept=".xlsx,.xls,.csv,.xml,.pdf" data-change="escolher" class="sr"></label>
    <div class="chips"><span>Nota fiscal XML</span><span>Nota fiscal PDF</span><span>Orçamento</span><span>Gastos pagos</span><span>Lista de materiais</span><span>Fornecedores</span><span>Cotação</span></div>
  </div></div></section>
  <div id="fila"></div>
  <p class="fluxo-leg" style="padding-left:0">Até 4 MB por arquivo. Nota fiscal em <b>XML</b> é lida com exatidão; em PDF, o sistema lê o que consegue e você confere. PDF escaneado ou foto não é lido: fica guardado em Documentos. Planilhas já importadas não duplicam se forem enviadas de novo.</p>`;
};
POS.importar = () => pintaFila();

const sel = (attrs, opcoes, atual) => `<select ${attrs}>${opcoes.map(([v, r]) => `<option value="${esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
function cartaoArquivo(it) {
  const kb = it.file.size < 1048576 ? Math.round(it.file.size / 1024) + ' KB' : (it.file.size / 1048576).toFixed(1) + ' MB';
  const topo = `<div class="arq-cab"><div><div class="nm">${esc(it.file.name)}</div><small>${kb}</small></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${it.estado === 'pronto' || it.estado === 'erro' ? `${it.a ? `<span class="tag ${it.a.confianca === 'alta' ? 'ok' : it.a.confianca === 'media' ? 'aviso' : ''}">Confiança ${it.a.confianca}</span>` : ''}${sel(`data-ft="${it.id}" aria-label="Tipo do arquivo"`, TIPO_OPC, it.tipo)}` : ''}
    <button class="lk" data-act="filaTirar" data-id="${it.id}">Remover</button></div></div>`;
  if (it.estado === 'analisando') return `<section class="cartao arq" id="arq-${it.id}">${topo}<div class="arq-corpo"><span class="dot"></span>Analisando o arquivo…</div></section>`;
  if (it.estado === 'erro' && !it.a) return `<section class="cartao arq" id="arq-${it.id}">${topo}<div class="arq-corpo neg">${esc(it.erro)}</div></section>`;
  const avisos = [...(it.a.aviso || []), ...(it.avisosNorm || [])];
  let corpo = avisos.length ? `<ul class="avisos">${avisos.map(a => `<li class="${/Conferido/.test(a) ? 'ok' : /difere|Nenhuma/.test(a) ? 'ruim' : ''}">${esc(a)}</li>`).join('')}</ul>` : '';
  if (ehPlan(it.tipo)) {
    const opc = [['', '— não usar —'], ...(it.a.cabecalho || []).map((h, i) => [i, h || `Coluna ${i + 1}`])];
    corpo += `<div class="mapa-grid">${CAMPOS_UI[it.tipo].map(([c, r]) => `<label class="campo">${r}${sel(`data-fm="${it.id}" data-campo="${c}"`, opc, it.config.mapa?.[c])}</label>`).join('')}
      ${it.tipo === 'orcamento' ? `<label class="campo">Se a obra já tem orçamento${sel(`data-fx="${it.id}" data-k="modo"`, [['somar', 'Adicionar ao existente'], ['substituir', 'Substituir tudo']], it.modo || 'somar')}</label>` : ''}
      ${it.tipo === 'gastos' ? `<label class="campo">Etapa para linhas sem etapa<input data-fx="${it.id}" data-k="etapaPadrao" list="dl-etapas" value="${esc(it.etapaPadrao || '')}"></label>` : ''}</div>`;
    const p = it.previa;
    if (p) {
      const cols = CAMPOS_UI[it.tipo].map(c => c[0]).filter(c => p.previa.some(x => x[c] !== undefined && x[c] !== '' && x[c] !== 0) || ['item', 'valor', 'nome'].includes(c));
      const rot = Object.fromEntries(CAMPOS_UI[it.tipo]), num = new Set(['qtd', 'valor_unit', 'total', 'valor']);
      corpo += `<div style="margin-bottom:8px"><b>${p.total} linha${p.total === 1 ? '' : 's'} reconhecida${p.total === 1 ? '' : 's'}</b>${p.soma ? ` · soma ${BRL(p.soma)}` : ''} <span class="mut">${p.total > p.previa.length ? `(mostrando ${p.previa.length})` : ''}</span></div>
      <div class="previa"><table><thead><tr>${cols.map(c => `<th class="${num.has(c) ? 'r' : ''}">${rot[c]}</th>`).join('')}</tr></thead><tbody>${p.previa.map(x => `<tr>${cols.map(c => `<td class="${num.has(c) ? 'r' : ''}">${num.has(c) && x[c] !== '' ? (c === 'qtd' ? N0(x[c]) : BRL(x[c])) : c === 'data' ? D(x[c]) : esc(x[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
  } else if (it.tipo === 'nota_fiscal') {
    const n = it.nota || { parcelas: [] };
    corpo += it.duplicada ? `<ul class="avisos"><li class="ruim">Esta nota já foi lançada nesta obra.</li></ul>` : '';
    corpo += `<div class="form" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <label class="campo">Fornecedor<input data-fn="${it.id}" data-k="fornecedor" value="${esc(n.fornecedor || '')}"></label>
      <label class="campo">CNPJ<input data-fn="${it.id}" data-k="cnpj" value="${esc(n.cnpj || '')}"></label>
      <label class="campo">Nº da nota<input data-fn="${it.id}" data-k="numero" value="${esc(n.numero || '')}"></label>
      <label class="campo">Emissão<input type="date" data-fn="${it.id}" data-k="emissao" value="${esc(n.emissao || '')}"></label>
      <label class="campo">Valor da nota<input data-fn="${it.id}" data-k="valor" inputmode="decimal" value="${n.valor ? String(n.valor).replace('.', ',') : ''}"></label>
      <label class="campo">Etapa da obra<input data-fn="${it.id}" data-k="etapa" list="dl-etapas" value="${esc(n.etapa || '')}" placeholder="Escolha ou digite"></label></div>
      ${(it.a.similares || []).filter(x => x.nome !== n.fornecedor).map(x => `<div class="avisos"><li class="ruim" style="list-style:none">Já existe um fornecedor parecido: <b>${esc(x.nome)}</b> <button class="btn mini vazado" data-act="usarForn" data-id="${it.id}" data-nome="${esc(x.nome)}">Usar este</button> para não duplicar o cadastro.</li></div>`).join('')}
      <div style="font:500 10.5px var(--f-dado);letter-spacing:.1em;text-transform:uppercase;color:var(--tinta-2);margin:4px 0 6px">${n.parcelas.length ? 'Parcelas (vencimentos)' : 'Vencimento'}</div>
      ${(n.parcelas.length ? n.parcelas : [{ vencimento: n.vencimento || '', valor: '' }]).map((p, i) => `<div class="parc"><label class="campo">Vencimento<input type="date" data-fp="${it.id}" data-i="${i}" data-k="vencimento" value="${esc(p.vencimento || '')}"></label>
        <label class="campo">Valor<input data-fp="${it.id}" data-i="${i}" data-k="valor" inputmode="decimal" value="${p.valor ? String(p.valor).replace('.', ',') : ''}" ${n.parcelas.length ? '' : 'disabled placeholder="valor total da nota"'}></label>
        ${n.parcelas.length > 1 ? `<button class="lk perigo" data-act="parcDel" data-id="${it.id}" data-i="${i}">Tirar</button>` : '<span></span>'}</div>`).join('')}
      <button class="btn mini vazado" data-act="parcAdd" data-id="${it.id}">+ Parcela</button>
      ${it.a.nota?.itens?.length ? `<details style="margin-top:12px"><summary class="mut" style="cursor:pointer">${it.a.nota.itens.length} item(ns) da nota</summary><div class="previa" style="margin-top:8px"><table><thead><tr><th>Item<th>Un.<th class="r">Qtd<th class="r">Valor unit.<th class="r">Total</tr></thead><tbody>${it.a.nota.itens.map(x => `<tr><td>${esc(x.item)}<td>${esc(x.unidade)}<td class="r">${N0(x.qtd)}<td class="r">${BRL(x.valor_unit)}<td class="r">${BRL(x.total)}</tr>`).join('')}</tbody></table></div></details>` : ''}`;
  } else {
    corpo += `<div class="mut">${it.tipo === 'cotacao' ? 'Este comparativo será guardado em Documentos.' : 'O arquivo será guardado em Documentos, sem lançar dados.'}</div>`;
  }
  let rod;
  if (it.estado === 'feito') rod = `<div class="res"><span class="ok">✓ ${esc(it.resultado)}</span></div>`;
  else rod = `<div class="res"><span class="${it.erro ? 'ruim' : 'mut'}">${it.erro ? esc(it.erro) : it.estado === 'gravando' ? 'Gravando…' : 'Nada foi gravado ainda.'}</span><span>${it.podeForcar ? `<button class="btn vazado" data-act="filaImportar" data-id="${it.id}" data-forcar="1">Lançar mesmo assim</button> ` : ''}<button class="btn amarelo" data-act="filaImportar" data-id="${it.id}" ${it.estado === 'gravando' ? 'disabled' : ''}>${it.tipo === 'documento' || it.tipo === 'cotacao' ? 'Guardar' : 'Importar'}</button></span></div>`;
  return `<section class="cartao arq" id="arq-${it.id}">${topo}<div class="arq-corpo">${corpo}</div>${rod}</section>`;
}
function pintaFila() {
  const el = $('#fila'); if (!el) return;
  el.innerHTML = `<datalist id="dl-etapas">${S.etapas.map(e => `<option value="${esc(e)}">`).join('')}</datalist>` + S.fila.map(cartaoArquivo).join('') +
    (S.fila.filter(i => i.estado === 'pronto').length > 1 ? `<div style="margin-top:14px;text-align:right"><button class="btn" data-act="filaTodos">Importar todos os prontos</button></div>` : '');
}
const enviarArq = (it, config, simular) => { const fd = new FormData(); fd.append('arquivo', it.file); if (config) fd.append('config', JSON.stringify(config)); if (simular) fd.append('simular', '1'); return api(`${O()}/importacao/processar`, { method: 'POST', body: fd }); };
async function adicionarArquivos(files) {
  for (const file of [...files]) {
    if (file.size > 4 * 1024 * 1024) { aviso(`${file.name}: acima de 4 MB`, true); continue; }
    const it = { id: ++filaSeq, file, estado: 'analisando' }; S.fila.push(it); pintaFila();
    try {
      const a = await enviarArq(it);
      Object.assign(it, { a, tipo: a.tipo, config: a.config ? { ...a.config, mapa: { ...a.config.mapa } } : { mapa: {} }, previa: a.previa, avisosNorm: a.avisosNorm || [], modo: 'somar', estado: 'pronto', duplicada: !!a.duplicada });
      if (a.nota) it.nota = { ...a.nota, etapa: '', vencimento: '', parcelas: (a.nota.parcelas || []).map(p => ({ ...p })) };
    } catch (e) { it.estado = 'erro'; it.erro = e.message; }
    pintaFila();
  }
}
async function recalculaPrevia(it) {
  if (!ehPlan(it.tipo)) return;
  try { const r = await enviarArq(it, { ...it.config, tipo: it.tipo, etapaPadrao: it.etapaPadrao, modo: it.modo }, true); it.previa = r; it.avisosNorm = r.avisos || []; it.erro = ''; }
  catch (e) { it.erro = e.message; }
  pintaFila();
}
function configDe(it, forcar) {
  if (ehPlan(it.tipo)) return { ...it.config, tipo: it.tipo, etapaPadrao: it.etapaPadrao, modo: it.modo };
  if (it.tipo === 'nota_fiscal') { const n = it.nota; return { tipo: 'nota_fiscal', forcar, nota: { ...n, valor: typeof n.valor === 'number' ? n.valor : dec(n.valor), parcelas: n.parcelas.map(p => ({ ...p, valor: typeof p.valor === 'string' ? dec(p.valor) : p.valor })) } }; }
  return { tipo: it.tipo };
}
async function gravarItem(it, forcar) {
  it.estado = 'gravando'; it.erro = ''; it.podeForcar = false; pintaFila();
  try {
    const r = await enviarArq(it, configDe(it, forcar));
    it.estado = 'feito';
    it.resultado = r.documento ? 'Arquivo guardado em Documentos.' : it.tipo === 'nota_fiscal' ? `${r.contas} conta${r.contas > 1 ? 's' : ''} a pagar criada${r.contas > 1 ? 's' : ''}${r.fornecedorNovo ? ' e fornecedor novo cadastrado' : ''}. O arquivo foi guardado em Documentos.`
      : it.tipo === 'fornecedores' ? `${r.criados} novo${r.criados === 1 ? '' : 's'}, ${r.atualizados} completado${r.atualizados === 1 ? '' : 's'}${r.ignorados ? `, ${r.ignorados} sem mudança` : ''}.`
      : `${r.gravados} linha${r.gravados === 1 ? '' : 's'} gravada${r.gravados === 1 ? '' : 's'}${r.ignorados ? `; ${r.ignorados} já existia${r.ignorados === 1 ? '' : 'm'} e foi ignorada${r.ignorados === 1 ? '' : 's'}` : ''}.`;
  } catch (e) {
    it.estado = 'pronto'; it.erro = e.message;
    if (/já foi lançada/.test(e.message)) { it.duplicada = true; it.podeForcar = true; }
  }
  pintaFila(); badge();
}

/* ---------- fornecedores ---------- */
VIEW.fornecedores = async () => {
  [S.forn, S.dup] = await Promise.all([api('/api/fornecedores'), api('/api/fornecedores/duplicados')]);
  const esp = [...new Set(S.forn.map(f => f.especialidade).filter(Boolean))].sort();
  const aberto = S.forn.reduce((a, f) => a + f.em_aberto, 0);
  return cab('Cadastro', 'Fornecedores', `<div class="data">${S.forn.length} cadastrado${S.forn.length === 1 ? '' : 's'}<b class="num">${BRL(aberto)} em aberto</b></div>`) + `
 ${S.dup.length ? `<section class="cartao" style="margin-bottom:16px;border-color:var(--aviso)"><header><h2>Possíveis duplicados</h2><small>${S.dup.length} par${S.dup.length > 1 ? 'es' : ''} com nome parecido</small></header><ul class="atencao">${S.dup.map(p => `<li><span class="ico aviso">≈</span><div><b>${esc(p.a.nome)}</b> e <b>${esc(p.b.nome)}</b><small>Se for a mesma empresa, junte: contas e pagamentos vão para o cadastro mantido.</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn mini vazado" data-act="mesclar" data-manter="${p.a.id}" data-tirar="${p.b.id}" data-nm="${esc(p.a.nome)}" data-nt="${esc(p.b.nome)}">Manter “${esc(p.a.nome.slice(0, 22))}”</button><button class="btn mini vazado" data-act="mesclar" data-manter="${p.b.id}" data-tirar="${p.a.id}" data-nm="${esc(p.b.nome)}" data-nt="${esc(p.a.nome)}">Manter “${esc(p.b.nome.slice(0, 22))}”</button></div></li>`).join('')}</ul></section>` : ''}
  <section class="cartao"><div class="corpo"><div class="busca"><input id="fq" type="search" placeholder="Buscar por nome, CNPJ, cidade ou contato" aria-label="Buscar fornecedor">
    <select id="fe" aria-label="Filtrar por especialidade"><option value="">Todas as especialidades</option>${esp.map(e => `<option>${esc(e)}</option>`).join('')}</select>
    <button class="btn amarelo" data-act="fornNovo">+ Novo fornecedor</button></div>
    <div class="rolar" id="tf"></div>
    <p class="fluxo-leg" style="padding:10px 0 0">"Pago" soma os gastos lançados com o nome do fornecedor, em todas as obras. Para trazer uma lista pronta, use <a class="lk" href="#/importar">Importar</a>.</p></div></section>`;
};
POS.fornecedores = () => pintaForn();
function pintaForn() {
  const t = $('#tf'); if (!t) return;
  const q = norm1($('#fq').value), e = $('#fe').value;
  const l = S.forn.filter(f => (!e || f.especialidade === e) && (!q || norm1([f.nome, f.cnpj, f.cidade, f.contato, f.email, f.telefone, f.especialidade].join(' ')).includes(q)));
  t.innerHTML = l.length ? `<table><thead><tr><th>Fornecedor<th>Especialidade<th>Cidade<th>Contato<th class="r">Pago<th class="r">Em aberto<th></tr></thead><tbody>${l.map(f => `<tr><td><b>${esc(f.nome)}</b>${f.cnpj ? `<br><small class="mut num">${esc(fmtCnpj(f.cnpj))}</small>` : ''}<td>${esc(f.especialidade || '–')}<td>${esc(f.cidade || '–')}
    <td>${esc(f.contato || '')}${f.telefone ? `<br><small class="mut">${esc(f.telefone)}</small>` : ''}${f.email ? `<br><small class="mut">${esc(f.email)}</small>` : ''}${!f.contato && !f.telefone && !f.email ? '–' : ''}
    <td class="r">${BRL(f.pago)}<td class="r ${f.atrasado > 0 ? 'neg' : ''}">${BRL(f.em_aberto)}${f.atrasado > 0 ? '<br><small>atrasado</small>' : ''}<td class="acoes"><button class="btn mini vazado" data-act="fornEditar" data-id="${f.id}">Editar</button></tr>`).join('')}</tbody></table>`
    : `<div class="vazio"><b>${S.forn.length ? 'Nenhum fornecedor com esse filtro' : 'Nenhum fornecedor cadastrado'}</b>${S.forn.length ? 'Limpe a busca para ver todos.' : 'Cadastre um ou importe a lista que você já tem em Importar.'}</div>`;
}
const norm1 = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtCnpj = d => (d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d);
async function formFornecedor(f = {}) {
  return perguntar({ titulo: f.id ? 'Editar fornecedor' : 'Novo fornecedor', ok: 'Salvar', campos: [
    { id: 'nome', rot: 'Nome ou razão social', valor: f.nome, req: true }, { id: 'cnpj', rot: 'CNPJ ou CPF', valor: f.cnpj ? fmtCnpj(f.cnpj) : '' }, { id: 'especialidade', rot: 'Especialidade (ex.: elétrica, esquadrias)', valor: f.especialidade },
    { id: 'cidade', rot: 'Cidade', valor: f.cidade }, { id: 'contato', rot: 'Pessoa de contato', valor: f.contato }, { id: 'telefone', rot: 'Telefone', valor: f.telefone }, { id: 'email', rot: 'E-mail', tipo: 'email', valor: f.email }, { id: 'observacoes', rot: 'Observações', valor: f.observacoes }] });
}

/* ---------- ações ---------- */
const val = id => $('#' + id).value;
const ACT = {
  async mesclar(a) {
    const d = a.dataset;
    if (!(await perguntar({ titulo: 'Juntar fornecedores', texto: `“${d.nt}” será juntado em “${d.nm}”. As contas e os pagamentos dele passam para “${d.nm}”, e o cadastro “${d.nt}” é removido.`, ok: 'Juntar', perigo: true }))) return;
    const r = await agir(() => enviar('/api/fornecedores/mesclar', { origem_id: Number(d.tirar), destino_id: Number(d.manter) }), null);
    if (r) aviso(`Juntado: ${r.contas} conta(s) e ${r.pagamentos} pagamento(s) movidos.`);
  },
  async fornNovo() { const r = await formFornecedor(); if (r) await agir(() => enviar('/api/fornecedores', r), 'Fornecedor cadastrado'); },
  async fornEditar(a) { const f = S.forn.find(x => x.id == a.dataset.id); const r = f && await formFornecedor(f); if (r) await agir(() => enviar('/api/fornecedores/' + f.id, r, 'PUT'), 'Fornecedor atualizado'); },
  filaTirar(a) { S.fila = S.fila.filter(i => i.id != a.dataset.id); pintaFila(); },
  async filaImportar(a) { const it = S.fila.find(i => i.id == a.dataset.id); if (it) await gravarItem(it, !!a.dataset.forcar); },
  async filaTodos() { for (const it of S.fila.filter(i => i.estado === 'pronto' && !i.duplicada)) await gravarItem(it); },
  usarForn(a) { const it = S.fila.find(i => i.id == a.dataset.id); it.nota.fornecedor = a.dataset.nome; pintaFila(); },
  parcAdd(a) { const it = S.fila.find(i => i.id == a.dataset.id); it.nota.parcelas.push({ vencimento: '', valor: '' }); pintaFila(); },
  parcDel(a) { const it = S.fila.find(i => i.id == a.dataset.id); it.nota.parcelas.splice(Number(a.dataset.i), 1); pintaFila(); },
  async novaObra() {
    const r = await perguntar({ titulo: 'Nova obra', campos: [{ id: 'nome', rot: 'Nome da obra', req: true }], ok: 'Criar obra' });
    if (!r || !r.nome.trim()) return;
    await agir(async () => { const o = await enviar('/api/obras', { nome: r.nome }); S.obras = await api('/api/obras'); S.obra = o.id; casca(); location.hash = '#/geral'; }, 'Obra criada');
  },
  async sair() { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); },
  async itemNovo() { await agir(() => enviar(O() + '/orcamento', { etapa: val('ne'), item: val('ni'), unidade: val('nu'), qtd: val('nq'), valor_unit: val('nv') }), 'Item adicionado'); },
  async itemDel(a) { if (await perguntar({ titulo: 'Excluir item', texto: 'Remover este item do orçamento?', ok: 'Excluir', perigo: true })) await agir(() => api('/api/orcamento/' + a.dataset.id, { method: 'DELETE' }), 'Item excluído'); },
  async conta() { await agir(() => enviar(O() + '/contas', { fornecedor: val('cf'), etapa: val('ce'), descricao: val('cd'), vencimento: val('cv'), valor: dec(val('cm')), parcelas: val('cp') }), 'Conta adicionada'); },
  async pagar(a) {
    const c = (await api(O() + '/contas')).find(x => x.id == a.dataset.id); if (!c) return;
    const r = await perguntar({ titulo: 'Registrar pagamento', texto: `${c.fornecedor || c.descricao} · ${BRL(c.valor)}`, campos: [{ id: 'valor', rot: 'Valor pago', valor: String(c.valor).replace('.', ','), req: true }, { id: 'data', rot: 'Data do pagamento', tipo: 'date', valor: (await api(O() + '/avanco')).hoje }], ok: 'Registrar pagamento' });
    if (r) await agir(() => enviar(`/api/contas/${c.id}/pagar`, { valor: dec(r.valor), data: r.data }), 'Pagamento registrado');
  },
  async estornar(a) { if (await perguntar({ titulo: 'Estornar pagamento', texto: 'A conta volta para "a pagar" e o gasto é removido.', ok: 'Estornar', perigo: true })) await agir(() => enviar(`/api/contas/${a.dataset.id}/estornar`, {}), 'Pagamento estornado'); },
  async delConta(a) { if (await perguntar({ titulo: 'Excluir conta', texto: 'Essa conta será removida.', ok: 'Excluir', perigo: true })) await agir(() => api('/api/contas/' + a.dataset.id, { method: 'DELETE' }), 'Conta excluída'); },
  async gasto() { await agir(() => enviar(O() + '/gastos', { etapa: val('ge'), descricao: val('gd'), fornecedor: val('gf'), data: val('gt'), valor: dec(val('gv')) }), 'Gasto lançado'); },
  async delGasto(a) { if (await perguntar({ titulo: 'Excluir gasto', ok: 'Excluir', perigo: true })) await agir(() => api('/api/gastos/' + a.dataset.id, { method: 'DELETE' }), 'Gasto excluído'); },
  async medir(a) {
    const r = await perguntar({ titulo: 'Medir avanço', texto: a.dataset.etapa, campos: [{ id: 'pct', rot: 'Avanço físico (0 a 100%)', tipo: 'number', passo: '0.5', valor: Math.round(a.dataset.pct), req: true }], ok: 'Registrar medição' });
    if (r) await agir(() => enviar(O() + '/medicoes', { etapa: a.dataset.etapa, pct: dec(r.pct) }), 'Medição registrada');
  },
  async novoUsuario() { await agir(() => enviar('/api/usuarios', { nome: val('un'), email: val('ue'), senha: val('us'), papel: val('up') }), 'Usuário criado'); },
  async delUsuario(a) { if (await perguntar({ titulo: 'Excluir usuário', texto: 'Essa pessoa perde o acesso.', ok: 'Excluir', perigo: true })) await agir(() => api('/api/usuarios/' + a.dataset.id, { method: 'DELETE' }), 'Usuário excluído'); },
};
const CHG = {
  escolher(el) { adicionarArquivos(el.files); el.value = ''; },
  async importOrc(el) {
    const f = el.files[0]; if (!f) return;
    if (S.orc.length && !(await perguntar({ titulo: 'Substituir orçamento', texto: `A planilha vai substituir os ${S.orc.length} itens atuais.`, ok: 'Substituir', perigo: true }))) { el.value = ''; return; }
    const r = await agir(() => arquivo(O() + '/orcamento/importar', f), null); if (r) aviso(r.importados + ' itens importados');
  },
  async importGastos(el) { const f = el.files[0]; if (!f) return; const r = await agir(() => arquivo(O() + '/gastos/importar', f), null); if (r) aviso(r.importados + ' gastos importados'); },
  async docUp(el) { const f = el.files[0]; if (f) await agir(() => arquivo(O() + '/documentos', f), 'Arquivo enviado'); },
  async prazo(el) {
    const tr = el.closest('tr'), i = $('[data-f=inicio]', tr).value, f = $('[data-f=fim]', tr).value;
    await agir(() => enviar(O() + '/cronograma', { etapa: tr.dataset.etapa, inicio: i, fim: f }, 'PUT'), 'Prazo salvo');
  },
  async itemSalva(el) {
    const tr = el.closest('tr'), g = f => $(`[data-f=${f}]`, tr).value;
    const corpo = { etapa: g('etapa'), item: g('item'), unidade: g('unidade'), qtd: g('qtd'), valor_unit: g('valor_unit') };
    try {
      await enviar('/api/orcamento/' + tr.dataset.id, corpo, 'PUT');
      const it = S.orc.find(o => o.id == tr.dataset.id); Object.assign(it, corpo, { qtd: dec(corpo.qtd) || 0, valor_unit: dec(corpo.valor_unit) || 0 });
      it.total = Math.round(it.qtd * it.valor_unit * 100) / 100; $('[data-tot]', tr).textContent = BRL(it.total);
      const t = BRL(S.orc.reduce((a, o) => a + o.total, 0)); $('#orcTot').textContent = t; $('#orcTot2').textContent = t; aviso('Salvo');
    } catch (e) { aviso(e.message, true); }
  },
};
document.addEventListener('input', e => { if (e.target.id === 'fq') pintaForn(); });
document.addEventListener('dragover', e => { const z = e.target.closest('[data-zona]'); if (z) { e.preventDefault(); z.classList.add('sobre'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest('[data-zona]'); if (z) z.classList.remove('sobre'); });
document.addEventListener('drop', e => { const z = e.target.closest('[data-zona]'); if (z) { e.preventDefault(); z.classList.remove('sobre'); adicionarArquivos(e.dataTransfer.files); } });
document.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a); } });
document.addEventListener('change', e => {
  const t = e.target, it = S.fila.find(i => i.id == (t.dataset.ft || t.dataset.fm || t.dataset.fx || t.dataset.fn || t.dataset.fp));
  if (t.dataset.ft && it) { it.tipo = t.value; if (ehPlan(it.tipo)) { it.config.mapa = { ...(it.a.mapas?.[it.tipo] || {}) }; recalculaPrevia(it); } else pintaFila(); return; }
  if (t.dataset.fm && it) { if (t.value === '') delete it.config.mapa[t.dataset.campo]; else it.config.mapa[t.dataset.campo] = Number(t.value); recalculaPrevia(it); return; }
  if (t.dataset.fx && it) { it[t.dataset.k] = t.value; recalculaPrevia(it); return; }
  if (t.dataset.fn && it) { it.nota[t.dataset.k] = t.value; if (it.duplicada && ['numero', 'cnpj'].includes(t.dataset.k)) { it.duplicada = false; it.podeForcar = false; } return; }
  if (t.dataset.fp && it) { it.nota.parcelas[Number(t.dataset.i)][t.dataset.k] = t.value; return; }
  if (t.id === 'fe') return pintaForn(); const a = e.target.closest('[data-change]'); if (a && CHG[a.dataset.change]) CHG[a.dataset.change](a); });

/* ---------- início ---------- */
(async () => {
  try {
    const st = await fetch('/api/auth/status').then(r => r.json()); S.setup = st.precisa_setup; S.codigo = !!st.exige_codigo;
    if (st.usuario) { S.user = st.usuario; await abrir(); } else telaEntrada();
  } catch { $('#raiz').innerHTML = '<div class="vazio"><b>Sem conexão com o servidor</b>Recarregue a página.</div>'; }
})();
