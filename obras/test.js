const assert = require('assert');
const os = require('os'), fs = require('fs'), path = require('path');
const XLSX = require('xlsx');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'obras-'));
const app = require('./server');

const xlsx = rows => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'a');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
const form = (name, buf, fn) => { const f = new FormData(); f.append(name, new Blob([buf]), fn); return f; };

(async () => {
  const srv = app.listen(0); const base = `http://localhost:${srv.address().port}/api`;
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
  assert.equal((await fetch(`${base}/documentos/${docs[0].id}/download`)).status, 200);

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
  assert.equal((await post(`/contas/${atrasada.id}/pagar` + H, {}).catch(() => ({}))).erro, 'conta já paga');
  let rel2 = await j(`/obras/${id}/relatorio`);
  assert.equal(rel2.gasto, 4800.5 + 1000);
  await post(`/contas/${atrasada.id}/estornar`, {});
  rel2 = await j(`/obras/${id}/relatorio`);
  assert.equal(rel2.gasto, 4800.5);
  painel = await j('/painel' + H);
  assert.equal(painel.atrasadas.total, 1000);
  assert.equal(painel.fluxo_semanal.length, 8);
  assert.ok(painel.etapas_estouradas.some(e => e.etapa === 'Fundação') === false); // 3500,5 de 5000
  console.log('financeiro OK');
  console.log('OK', JSON.stringify(rel));
  srv.close();
})().catch(e => { console.error(e); process.exit(1); });
