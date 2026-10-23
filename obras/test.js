const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
const XLSX = require('xlsx');
const { Client } = require('pg');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://obras:obras@localhost:5432/obras_test';

const xlsx = rows => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'a');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
const form = (name, buf, fn) => { const f = new FormData(); f.append(name, new Blob([buf]), fn); return f; };

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end();
  const app = require('./server'); await app.pronto;
  const srv = app.listen(0); const base = `http://localhost:${srv.address().port}/api`;
  const realFetch = global.fetch; let cookie = '';
  global.fetch = (u, o = {}) => realFetch(u, { ...o, headers: { ...(o.headers || {}), Cookie: cookie } });
  const semLogin = (u, o) => realFetch(base + u, o);
  const J = { 'Content-Type': 'application/json' };

  // ---- saúde e código de instalação ----
  const raiz = base.replace('/api', '');
  assert.equal((await realFetch(raiz + '/healthz').then(r => r.json())).ok, true);
  process.env.SETUP_TOKEN = 'abre-sesamo';
  assert.equal((await semLogin('/auth/status').then(r => r.json())).exige_codigo, true);
  const semCodigo = await semLogin('/auth/setup', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Eng', email: 'eng@x.com', senha: 'senha-forte-1' }) });
  assert.equal(semCodigo.status, 403);
  assert.equal((await semLogin('/auth/setup', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Eng', email: 'eng@x.com', senha: 'senha-forte-1', codigo: 'errado' }) })).status, 403);
  delete process.env.SETUP_TOKEN;

  // ---- bloqueio de tentativas (guardado no banco) ----
  for (let i = 0; i < 5; i++) await semLogin('/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'alvo@x.com', senha: 'x' + i }) });
  assert.equal((await semLogin('/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'alvo@x.com', senha: 'qualquer' }) })).status, 429);

  // ---- autenticação ----
  assert.equal((await semLogin('/obras')).status, 401);
  assert.equal((await semLogin('/auth/status').then(r => r.json())).precisa_setup, true);
  assert.equal((await semLogin('/auth/setup', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Eng', email: 'eng@x.com', senha: 'curta' }) })).status, 400);
  const setup = await semLogin('/auth/setup', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Eng', email: 'Eng@X.com', senha: 'senha-forte-1' }) });
  assert.equal(setup.status, 201);
  const sc = setup.headers.get('set-cookie'); assert.ok(/HttpOnly/.test(sc) && /SameSite=Strict/.test(sc));
  cookie = sc.split(';')[0];
  assert.equal((await semLogin('/auth/setup', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Outro', email: 'o@x.com', senha: 'senha-forte-2' }) })).status, 409);
  assert.equal((await semLogin('/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'eng@x.com', senha: 'errada' }) })).status, 401);
  const lg = await semLogin('/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'eng@x.com', senha: 'senha-forte-1' }) });
  assert.equal(lg.status, 200); assert.equal((await lg.json()).papel, 'admin');
  assert.equal((await fetch(base + '/obras')).status, 200);
  // perfil somente leitura: consulta, mas não grava; só admin gerencia usuários
  assert.equal((await fetch(base + '/usuarios', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Leitor', email: 'l@x.com', senha: 'leitura-123', papel: 'leitura' }) })).status, 201);
  assert.equal((await fetch(base + '/usuarios', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'Dup', email: 'L@x.com', senha: 'leitura-123', papel: 'leitura' }) })).status, 409);
  const adminCookie = cookie;
  const rl = await semLogin('/auth/login', { method: 'POST', headers: J, body: JSON.stringify({ email: 'l@x.com', senha: 'leitura-123' }) });
  cookie = rl.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base + '/obras')).status, 200);
  assert.equal((await fetch(base + '/obras', { method: 'POST', headers: J, body: JSON.stringify({ nome: 'X' }) })).status, 403);
  assert.equal((await fetch(base + '/usuarios')).status, 403);
  await semLogin('/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal((await fetch(base + '/obras')).status, 401); // sessão encerrada
  cookie = adminCookie;
  assert.equal((await fetch(base + '/obras/99999/gastos', { method: 'POST', headers: J, body: JSON.stringify({ valor: 5 }) })).status, 404);

  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  const { id } = await post('/obras', { nome: 'Casa Teste' });

  let r = await fetch(`${base}/obras/${id}/orcamento/importar`, { method: 'POST', body: form('arquivo', xlsx([
    { Etapa: 'Fundação', Item: 'Concreto', Unidade: 'm3', Qtd: 10, 'Valor Unitário': 500 },
    { Etapa: 'Alvenaria', Item: 'Tijolo', Unidade: 'un', Qtd: 1000, 'Valor Unitário': 2, Total: 2000 },
  ]), 'o.xlsx') }).then(r => r.json());
  assert.equal(r.importados, 2);

  r = await fetch(`${base}/obras/${id}/gastos/importar`, { method: 'POST', body: form('arquivo', xlsx([
    { Etapa: 'Fundação', Descrição: 'NF 123', Fornecedor: 'Concreteira', Data: '15/03/2026', Valor: '3.500,50' },
    { Etapa: 'Elétrica', Descrição: 'Fios', Valor: 800 },
  ]), 'g.xlsx') }).then(r => r.json());
  assert.equal(r.importados, 2);
  await post(`/obras/${id}/gastos`, { etapa: 'Alvenaria', descricao: 'Areia', valor: 500 });

  await fetch(`${base}/obras/${id}/documentos`, { method: 'POST', body: form('arquivo', 'PDF', 'nota.pdf') });
  const docs = await fetch(`${base}/obras/${id}/documentos`).then(r => r.json());
  assert.equal(docs.length, 1);
  const dl = await fetch(`${base}/documentos/${docs[0].id}/download`);
  assert.equal(dl.status, 200); assert.equal(await dl.text(), 'PDF'); assert.ok(/nota\.pdf/.test(dl.headers.get('content-disposition')));
  const grande = await fetch(`${base}/obras/${id}/documentos`, { method: 'POST', body: form('arquivo', Buffer.alloc(4 * 1024 * 1024 + 10), 'grande.pdf') });
  assert.equal(grande.status, 413);

  const rel = await fetch(`${base}/obras/${id}/relatorio`).then(r => r.json());
  assert.equal(rel.previsto, 7000);
  assert.equal(rel.gasto, 3500.5 + 800 + 500);
  const f = rel.etapas.find(e => e.etapa === 'Fundação');
  assert.equal(f.previsto, 5000); assert.equal(f.gasto, 3500.5);
  assert.equal(rel.etapas.find(e => e.etapa === 'Elétrica').previsto, 0);

  // ---- financeiro ----
  const H = '?hoje=2026-10-10';
  const j = (u, o) => fetch(base + u, o).then(r => r.json());
  await post(`/obras/${id}/contas`, { fornecedor: 'Concreteira', etapa: 'Fundação', descricao: 'NF 77', vencimento: '2026-10-05', valor: 1000 });
  await post(`/obras/${id}/contas`, { fornecedor: 'Concreteira', etapa: 'Fundação', descricao: 'Hoje', vencimento: '2026-10-10', valor: 200 });
  await post(`/obras/${id}/contas`, { fornecedor: 'Equipe Silva', etapa: 'Alvenaria', descricao: 'Empreitada', vencimento: '2026-10-31', valor: 1000, parcelas: 3 });
  let painel = await j('/painel' + H);
  assert.equal(painel.atrasadas.total, 1000);
  assert.equal(painel.vence_hoje.total, 200);
  assert.equal(painel.total_a_pagar, 2200);
  const parc = (await j(`/obras/${id}/contas` + H)).filter(c => c.descricao.startsWith('Empreitada'));
  assert.deepEqual(parc.map(c => c.vencimento), ['2026-10-31', '2026-11-30', '2026-12-31']);
  assert.equal(Math.round(parc.reduce((a, c) => a + c.valor, 0) * 100), 100000);
  assert.equal((await j('/fornecedores')).filter(f => f.nome === 'Concreteira').length, 1);

  // pagar gera gasto e entra no relatório; estornar desfaz
  const atrasada = (await j(`/obras/${id}/contas` + H)).find(c => c.status === 'atrasado');
  await post(`/contas/${atrasada.id}/pagar` + H, { valor: 1000 });
  assert.equal((await fetch(`${base}/contas/${atrasada.id}/pagar` + H, { method: 'POST', headers: J, body: '{}' })).status, 409);
  assert.equal((await fetch(`${base}/contas/999999/pagar`, { method: 'POST', headers: J, body: '{}' })).status, 404);
  let rel2 = await j(`/obras/${id}/relatorio`);
  assert.equal(rel2.gasto, 4800.5 + 1000);
  await post(`/contas/${atrasada.id}/estornar`, {});
  rel2 = await j(`/obras/${id}/relatorio`);
  assert.equal(rel2.gasto, 4800.5);
  painel = await j('/painel' + H);
  assert.equal(painel.atrasadas.total, 1000);
  assert.equal(painel.fluxo_semanal.length, 8);
  assert.ok(painel.etapas_estouradas.some(e => e.etapa === 'Fundação') === false); // 3500,5 de 5000
  // dois cliques simultâneos em "pagar": só um pagamento pode valer
  const outra = (await j(`/obras/${id}/contas` + H)).find(c => c.status === 'vence_hoje');
  const rs = await Promise.all([1, 2, 3].map(() => fetch(`${base}/contas/${outra.id}/pagar` + H, { method: 'POST', headers: J, body: '{}' }).then(r => r.status)));
  assert.deepEqual(rs.sort(), [200, 409, 409]);
  assert.equal((await j(`/obras/${id}/gastos`)).filter(g => g.conta_id === outra.id).length, 1);
  await post(`/contas/${outra.id}/estornar`, {});
  console.log('financeiro OK');

  // ---- orçamento editável, medição e cronograma ----
  const itens = await j(`/obras/${id}/orcamento`);
  const novoItem = await post(`/obras/${id}/orcamento`, { etapa: 'Cobertura', item: 'Telhado', unidade: 'm2', qtd: 100, valor_unit: '85,50' });
  assert.equal((await j(`/obras/${id}/orcamento`)).find(i => i.id === novoItem.id).total, 8550);
  await fetch(`${base}/orcamento/${novoItem.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'Cobertura', item: 'Telhado', unidade: 'm2', qtd: 120, valor_unit: 100 }) });
  assert.equal((await j(`/obras/${id}/relatorio`)).previsto, 7000 + 12000);
  await fetch(`${base}/orcamento/${novoItem.id}`, { method: 'DELETE' });
  assert.equal((await j(`/obras/${id}/relatorio`)).previsto, 7000);

  await fetch(`${base}/obras/${id}/cronograma`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'Fundação', inicio: '2026-09-01', fim: '2026-10-01' }) });
  await fetch(`${base}/obras/${id}/cronograma`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'Alvenaria', inicio: '2026-10-01', fim: '2026-10-21' }) });
  assert.equal((await fetch(`${base}/obras/${id}/cronograma`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'X', inicio: '2026-10-05', fim: '2026-10-01' }) })).status, 400);
  assert.equal((await fetch(`${base}/obras/${id}/medicoes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etapa: 'Fundação', pct: 120 }) })).status, 400);
  await post(`/obras/${id}/medicoes`, { etapa: 'Fundação', pct: 50, data: '2026-09-20' });
  await post(`/obras/${id}/medicoes`, { etapa: 'Fundação', pct: 80, data: '2026-09-30' });
  await post(`/obras/${id}/medicoes`, { etapa: 'Alvenaria', pct: 10, data: '2026-10-10' });
  const av = await j(`/obras/${id}/avanco?hoje=2026-10-10`);
  const fu = av.etapas.find(e => e.etapa === 'Fundação'), al = av.etapas.find(e => e.etapa === 'Alvenaria');
  assert.equal(fu.pct_fisico, 80); assert.equal(fu.status, 'atrasada'); // prazo venceu em 01/10 e não chegou a 100%
  assert.equal(fu.valor_fisico, 4000); assert.equal(fu.a_pagar_sugerido, 499.5); // 4000 - 3500,50
  assert.equal(al.status, 'atrasada'); // planejado 45%, físico 10%
  assert.equal(Math.round(al.pct_planejado), 45);
  assert.ok(Math.abs(av.pct_fisico_obra - (5000 * 80 + 2000 * 10) / 7000) < 1e-9);
  console.log('avanço OK');
  console.log('OK', JSON.stringify(rel));
  srv.close();
})().catch(e => { console.error(e); process.exit(1); });
