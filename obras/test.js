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

  // ---- central de importação ----
  const proc = async (buf, nome, config, simular) => {
    const f = new FormData(); f.append('arquivo', new Blob([buf]), nome);
    if (config) f.append('config', JSON.stringify(config)); if (simular) f.append('simular', '1');
    const r = await fetch(`${base}/obras/${id}/importacao/processar`, { method: 'POST', body: f }); return { status: r.status, ...(await r.json()) };
  };
  const dv = c => { let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(c[i]) * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const c43 = '35' + '2610' + '12345678000195' + '55' + '001' + '000004321' + '1' + '12345678', CHAVE = c43 + dv(c43);
  const aoa = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'a'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };

  // planilha de gastos com formato brasileiro: reconhece, grava e não duplica ao subir de novo
  const gastosX = aoa([['Data', 'Fornecedor', 'Descrição', 'Valor Pago', 'Etapa'], ['10/03/2026', 'Hidro Forte', 'NF 900', '1.234,50', 'Hidráulica'], ['11/03/2026', 'Hidro Forte', 'NF 901', '765,50', 'Hidráulica']]);
  let a1 = await proc(gastosX, 'pag.xlsx'); assert.equal(a1.tipo, 'gastos'); assert.equal(a1.previa.total, 2); assert.equal(a1.previa.soma, 2000);
  let g1 = await proc(gastosX, 'pag.xlsx', { ...a1.config, tipo: 'gastos' }); assert.deepEqual([g1.gravados, g1.ignorados], [2, 0]);
  let g2 = await proc(gastosX, 'pag.xlsx', { ...a1.config, tipo: 'gastos' }); assert.deepEqual([g2.gravados, g2.ignorados], [0, 2]); // mesma planilha de novo: ignora

  // orçamento com títulos de etapa e conferência do total
  const eap = aoa([['Código', 'Descrição', 'Un', 'Quant.', 'Preço Unit.', 'Total'], ['1', 'COBERTURA', '', '', '', 12000], ['1.1', 'Telhas', 'm²', 100, 80, 8000], ['1.2', 'Calhas', 'm', 50, 80, 4000], ['TOTAL', '', '', '', '', 12000]]);
  let a2 = await proc(eap, 'eap.xlsx'); assert.equal(a2.tipo, 'orcamento'); assert.ok(a2.avisosNorm.some(x => /bate com o total/.test(x)));
  let o1 = await proc(eap, 'eap.xlsx', { ...a2.config, tipo: 'orcamento', modo: 'somar' }); assert.equal(o1.gravados, 2);
  assert.equal((await j(`/obras/${id}/orcamento`)).filter(i => i.etapa === 'COBERTURA').length, 2);
  assert.equal((await proc(eap, 'eap.xlsx', { ...a2.config, tipo: 'orcamento', modo: 'somar' })).ignorados, 2);
  assert.equal((await proc(aoa([['x', 'y'], [1, 2]]), 'x.xlsx', { tipo: 'orcamento', folha: 'a', linhaCab: 0, mapa: {} })).status, 400); // sem colunas válidas

  // fornecedores por planilha (completa o que está vazio, sem apagar o que existe)
  const fornX = aoa([['Razão Social', 'CNPJ', 'Especialidade', 'Cidade', 'Telefone'], ['Concreteira Sul Ltda', '12.345.678/0001-95', 'Concreto', 'Porto Alegre', '(51) 3333-4444'], ['Elétrica Luz', '', 'Elétrica', 'Canoas', '']]);
  let a3 = await proc(fornX, 'forn.xlsx'); assert.equal(a3.tipo, 'fornecedores');
  let f1 = await proc(fornX, 'forn.xlsx', { ...a3.config, tipo: 'fornecedores' }); assert.equal(f1.criados + f1.atualizados, 2);
  const fl = await j('/fornecedores'); const cs = fl.find(f => f.nome === 'Concreteira'); assert.ok(cs);
  const ce = fl.find(f => f.nome === 'Concreteira Sul Ltda'); assert.equal(ce.cnpj, '12345678000195'); assert.equal(ce.especialidade, 'Concreto');

  // nota fiscal XML: lê exato, cria fornecedor/contas a pagar e bloqueia a mesma nota duas vezes
  const nfe = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${CHAVE}"><ide><nNF>4321</nNF><serie>1</serie><dhEmi>2026-10-12T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>CONCRETEIRA SUL LTDA</xNome></emit><det nItem="1"><prod><xProd>Concreto</xProd><uCom>M3</uCom><qCom>10</qCom><vUnCom>600</vUnCom><vProd>6000.00</vProd></prod></det><total><ICMSTot><vNF>6000.00</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>2026-11-12</dVenc><vDup>3000.00</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-12</dVenc><vDup>3000.00</vDup></dup></cobr></infNFe></NFe></nfeProc>`;
  let a4 = await proc(Buffer.from(nfe), 'nota.xml'); assert.equal(a4.tipo, 'nota_fiscal'); assert.equal(a4.nota.valor, 6000); assert.equal(a4.nota.parcelas.length, 2); assert.equal(a4.duplicada, false);
  assert.equal((await proc(Buffer.from(nfe), 'nota.xml', { tipo: 'nota_fiscal', nota: { ...a4.nota, etapa: 'Fundação', parcelas: [{ vencimento: '2026-11-12', valor: 1000 }] } })).status, 400); // parcelas não somam
  const n1 = await proc(Buffer.from(nfe), 'nota.xml', { tipo: 'nota_fiscal', nota: { ...a4.nota, etapa: 'Fundação' } }); assert.equal(n1.contas, 2); assert.equal(n1.fornecedorNovo, false); // já existia pelo CNPJ
  const nc = (await j(`/obras/${id}/contas?hoje=2026-10-10`)).filter(c => c.descricao.startsWith('NF 4321')); assert.equal(nc.length, 2); assert.equal(nc[0].fornecedor, 'Concreteira Sul Ltda');
  assert.equal((await proc(Buffer.from(nfe), 'nota.xml', { tipo: 'nota_fiscal', nota: { ...a4.nota, etapa: 'Fundação' } })).status, 409); // mesma nota de novo
  assert.equal((await proc(Buffer.from(nfe), 'nota.xml')).duplicada, true);

  // nome parecido com fornecedor já cadastrado: o sistema avisa em vez de duplicar
  const nfe2 = nfe.replace(/12345678000195/g, '55555555000155').replace('CONCRETEIRA SUL LTDA', 'Concreteira Sul').replace(/NFe\d{44}/, 'NFe' + (() => { const c = '35261055555555000155550010000099991123456789'.slice(0, 43); return c + dv(c); })());
  const a6 = await proc(Buffer.from(nfe2), 'nota2.xml'); assert.ok(a6.similares && a6.similares.some(x => x.nome === 'Concreteira Sul Ltda'), JSON.stringify(a6.similares));

  // duplicados: acha, junta, move contas e pagamentos, e recusa CNPJs diferentes
  await post(`/obras/${id}/contas`, { fornecedor: 'Equipe Beta', etapa: 'Alvenaria', descricao: 'Empreitada', vencimento: '2026-12-01', valor: 500 });
  await post(`/obras/${id}/gastos`, { etapa: 'Alvenaria', descricao: 'Medição', fornecedor: 'Equipe Beta', data: '2026-09-01', valor: 700 });
  await post('/fornecedores', { nome: 'Equipe Beta Ltda', cnpj: '33.444.555/0001-66', cidade: 'Canoas' });
  const dups = await j('/fornecedores/duplicados'); const par = dups.find(p => [p.a.nome, p.b.nome].includes('Equipe Beta') && [p.a.nome, p.b.nome].includes('Equipe Beta Ltda')); assert.ok(par);
  const fbeta = (await j('/fornecedores')).find(f => f.nome === 'Equipe Beta'), fltda = (await j('/fornecedores')).find(f => f.nome === 'Equipe Beta Ltda');
  assert.equal(fbeta.pago, 700);
  const m = await post('/fornecedores/mesclar', { origem_id: fbeta.id, destino_id: fltda.id }); assert.deepEqual([m.contas, m.pagamentos], [1, 1]);
  const depois = (await j('/fornecedores')).find(f => f.nome === 'Equipe Beta Ltda'); assert.equal(depois.pago, 700); assert.equal(depois.em_aberto, 500); assert.equal(depois.cnpj, '33444555000166');
  assert.equal((await j('/fornecedores')).some(f => f.nome === 'Equipe Beta'), false);
  await post('/fornecedores', { nome: 'Alfa Obras', cnpj: '11.111.111/0001-11' }); await post('/fornecedores', { nome: 'Alfa Obras Sul', cnpj: '22.222.222/0001-22' });
  const fa = (await j('/fornecedores')).find(f => f.nome === 'Alfa Obras'), fs = (await j('/fornecedores')).find(f => f.nome === 'Alfa Obras Sul');
  assert.equal((await fetch(`${base}/fornecedores/mesclar`, { method: 'POST', headers: J, body: JSON.stringify({ origem_id: fa.id, destino_id: fs.id }) })).status, 409);

  // cotação e arquivos desconhecidos: só guarda
  const cot = aoa([['Item', 'Un', 'Qtd', 'Forn. A', 'Forn. B', 'Forn. C'], ['Porta', 'un', 20, 850, 790, 910], ['Janela', 'un', 30, 620, 655, 600]]);
  const a5 = await proc(cot, 'cot.xlsx'); assert.equal(a5.tipo, 'cotacao');
  assert.equal((await proc(cot, 'cot.xlsx', { tipo: 'cotacao' })).documento, true);
  assert.equal((await proc(Buffer.from('%PDF-1.4\n%%EOF'), 'scan.pdf')).tipo, 'documento');
  assert.equal((await fetch(`${base}/obras/99999/importacao/processar`, { method: 'POST', body: new FormData() })).status, 404);
  console.log('importação OK');
  console.log('OK', JSON.stringify(rel));
  srv.close();
})().catch(e => { console.error(e); process.exit(1); });
