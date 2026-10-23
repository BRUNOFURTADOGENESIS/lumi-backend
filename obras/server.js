const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA, 'docs'), { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA, 'obras.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS obras (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, criada_em TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orcamento (id INTEGER PRIMARY KEY, obra_id INTEGER NOT NULL, etapa TEXT, item TEXT, unidade TEXT, qtd REAL, valor_unit REAL, total REAL);
CREATE TABLE IF NOT EXISTS gastos (id INTEGER PRIMARY KEY, obra_id INTEGER NOT NULL, etapa TEXT, descricao TEXT, fornecedor TEXT, data TEXT, valor REAL NOT NULL);
CREATE TABLE IF NOT EXISTS fornecedores (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, documento TEXT, contato TEXT);
CREATE TABLE IF NOT EXISTS contas (id INTEGER PRIMARY KEY, obra_id INTEGER NOT NULL, fornecedor_id INTEGER, etapa TEXT, descricao TEXT, vencimento TEXT NOT NULL, valor REAL NOT NULL, pago_em TEXT, valor_pago REAL);
CREATE TABLE IF NOT EXISTS documentos (id INTEGER PRIMARY KEY, obra_id INTEGER NOT NULL, nome TEXT, arquivo TEXT, enviado_em TEXT DEFAULT CURRENT_TIMESTAMP);
`);

if (!db.prepare('PRAGMA table_info(gastos)').all().some(c => c.name === 'conta_id')) db.exec('ALTER TABLE gastos ADD COLUMN conta_id INTEGER');

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = v => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
};
// aceita nomes de coluna variados (pt-BR)
const ALIAS = {
  etapa: ['etapa', 'fase', 'grupo', 'categoria', 'servico'],
  item: ['item', 'descricao', 'insumo', 'produto'],
  descricao: ['descricao', 'historico', 'item', 'produto'],
  unidade: ['unidade', 'un', 'und'],
  qtd: ['qtd', 'quantidade', 'qtde'],
  valor_unit: ['valor unitario', 'preco unitario', 'unitario', 'vl unit', 'valor unit'],
  total: ['total', 'valor total', 'preco total', 'custo'],
  fornecedor: ['fornecedor', 'favorecido', 'empresa'],
  data: ['data', 'emissao', 'vencimento'],
  valor: ['valor', 'valor total', 'total', 'valor pago'],
};
function readRows(buf) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
  return rows.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) o[norm(k)] = v;
    return o;
  });
}
function pick(row, field) {
  for (const a of ALIAS[field]) if (row[a] !== undefined && row[a] !== '') return row[a];
  return '';
}
function fmtDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v || '');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.get('/api/obras', (req, res) => res.json(db.prepare('SELECT * FROM obras ORDER BY id DESC').all()));
app.post('/api/obras', (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const r = db.prepare('INSERT INTO obras (nome) VALUES (?)').run(nome);
  res.status(201).json({ id: Number(r.lastInsertRowid), nome });
});

// Importa orçamento (substitui o anterior da obra)
app.post('/api/obras/:id/orcamento/importar', upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
  const id = Number(req.params.id);
  const ins = db.prepare('INSERT INTO orcamento (obra_id,etapa,item,unidade,qtd,valor_unit,total) VALUES (?,?,?,?,?,?,?)');
  let n = 0;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM orcamento WHERE obra_id=?').run(id);
    for (const r of readRows(req.file.buffer)) {
      const qtd = num(pick(r, 'qtd')), vu = num(pick(r, 'valor_unit'));
      const total = num(pick(r, 'total')) || qtd * vu;
      const item = String(pick(r, 'item'));
      if (!item && !total) continue;
      ins.run(id, String(pick(r, 'etapa')) || 'Sem etapa', item, String(pick(r, 'unidade')), qtd, vu, total);
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ erro: e.message }); }
  res.json({ importados: n });
});

// Importa gastos já realizados (obra em andamento) – soma aos existentes
app.post('/api/obras/:id/gastos/importar', upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
  const id = Number(req.params.id);
  const ins = db.prepare('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor) VALUES (?,?,?,?,?,?)');
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const r of readRows(req.file.buffer)) {
      const valor = num(pick(r, 'valor'));
      if (!valor) continue;
      ins.run(id, String(pick(r, 'etapa')) || 'Sem etapa', String(pick(r, 'descricao')), String(pick(r, 'fornecedor')), fmtDate(pick(r, 'data')), valor);
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ erro: e.message }); }
  res.json({ importados: n });
});

app.post('/api/obras/:id/gastos', (req, res) => {
  const { etapa, descricao, fornecedor, data, valor } = req.body;
  if (!(Number(valor) > 0)) return res.status(400).json({ erro: 'valor inválido' });
  db.prepare('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor) VALUES (?,?,?,?,?,?)')
    .run(Number(req.params.id), etapa || 'Sem etapa', descricao || '', fornecedor || '', data || '', Number(valor));
  res.status(201).json({ ok: true });
});
app.get('/api/obras/:id/gastos', (req, res) =>
  res.json(db.prepare('SELECT * FROM gastos WHERE obra_id=? ORDER BY data DESC, id DESC').all(Number(req.params.id))));
app.delete('/api/gastos/:id', (req, res) => { db.prepare('DELETE FROM gastos WHERE id=?').run(Number(req.params.id)); res.json({ ok: true }); });

// Documentos (PDF, imagens, planilhas) vinculados à obra
app.post('/api/obras/:id/documentos', upload.single('arquivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
  const arquivo = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(req.file.originalname).toLowerCase();
  fs.writeFileSync(path.join(DATA, 'docs', arquivo), req.file.buffer);
  const nome = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  db.prepare('INSERT INTO documentos (obra_id,nome,arquivo) VALUES (?,?,?)').run(Number(req.params.id), nome, arquivo);
  res.status(201).json({ ok: true });
});
app.get('/api/obras/:id/documentos', (req, res) =>
  res.json(db.prepare('SELECT id,nome,enviado_em FROM documentos WHERE obra_id=? ORDER BY id DESC').all(Number(req.params.id))));
app.get('/api/documentos/:id/download', (req, res) => {
  const d = db.prepare('SELECT * FROM documentos WHERE id=?').get(Number(req.params.id));
  if (!d) return res.sendStatus(404);
  res.download(path.join(DATA, 'docs', d.arquivo), d.nome);
});

// Relatório: previsto × gasto por etapa
app.get('/api/obras/:id/relatorio', (req, res) => {
  const id = Number(req.params.id);
  const prev = db.prepare('SELECT etapa, SUM(total) v FROM orcamento WHERE obra_id=? GROUP BY etapa').all(id);
  const real = db.prepare('SELECT etapa, SUM(valor) v FROM gastos WHERE obra_id=? GROUP BY etapa').all(id);
  const map = new Map();
  for (const p of prev) map.set(p.etapa, { etapa: p.etapa, previsto: p.v, gasto: 0 });
  for (const g of real) {
    const e = map.get(g.etapa) || { etapa: g.etapa, previsto: 0, gasto: 0 };
    e.gasto = g.v; map.set(g.etapa, e);
  }
  const etapas = [...map.values()].map(e => ({
    ...e, saldo: e.previsto - e.gasto, pct: e.previsto ? (e.gasto / e.previsto) * 100 : null,
  }));
  const previsto = etapas.reduce((a, e) => a + e.previsto, 0);
  const gasto = etapas.reduce((a, e) => a + e.gasto, 0);
  res.json({ previsto, gasto, saldo: previsto - gasto, pct: previsto ? (gasto / previsto) * 100 : null, etapas });
});

// ---------- Financeiro: fornecedores, contas a pagar, fluxo, painel ----------
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const hoje = req => (isoDate(req.query.hoje) ? req.query.hoje : new Date().toISOString().slice(0, 10));
const addDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const statusConta = (c, h) => c.pago_em ? 'pago' : c.vencimento < h ? 'atrasado' : c.vencimento === h ? 'vence_hoje' : 'a_pagar';
const SEL_CONTAS = `SELECT c.*, f.nome AS fornecedor, o.nome AS obra FROM contas c
  LEFT JOIN fornecedores f ON f.id=c.fornecedor_id JOIN obras o ON o.id=c.obra_id`;

app.get('/api/fornecedores', (req, res) => res.json(db.prepare('SELECT * FROM fornecedores ORDER BY nome').all()));
app.post('/api/fornecedores', (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  db.prepare('INSERT OR IGNORE INTO fornecedores (nome,documento,contato) VALUES (?,?,?)').run(nome, req.body.documento || '', req.body.contato || '');
  res.status(201).json(db.prepare('SELECT * FROM fornecedores WHERE nome=?').get(nome));
});

app.post('/api/obras/:id/contas', (req, res) => {
  const { fornecedor, etapa, descricao, vencimento, valor, parcelas } = req.body;
  if (!isoDate(vencimento)) return res.status(400).json({ erro: 'vencimento inválido (aaaa-mm-dd)' });
  if (!(Number(valor) > 0)) return res.status(400).json({ erro: 'valor inválido' });
  const n = Math.min(Math.max(parseInt(parcelas) || 1, 1), 60);
  let fid = null;
  if (String(fornecedor || '').trim()) {
    db.prepare('INSERT OR IGNORE INTO fornecedores (nome) VALUES (?)').run(String(fornecedor).trim());
    fid = db.prepare('SELECT id FROM fornecedores WHERE nome=?').get(String(fornecedor).trim()).id;
  }
  const ins = db.prepare('INSERT INTO contas (obra_id,fornecedor_id,etapa,descricao,vencimento,valor) VALUES (?,?,?,?,?,?)');
  const cents = Math.round(Number(valor) * 100), base = Math.floor(cents / n);
  db.exec('BEGIN');
  for (let i = 0; i < n; i++) {
    const d = new Date(vencimento + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + i);
    const venc = d.getUTCDate() === Number(vencimento.slice(8)) ? d.toISOString().slice(0, 10)
      : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10); // dia 31 → último dia do mês
    const v = (i === n - 1 ? cents - base * (n - 1) : base) / 100;
    ins.run(Number(req.params.id), fid, etapa || 'Sem etapa', n > 1 ? `${descricao || ''} (${i + 1}/${n})`.trim() : descricao || '', venc, v);
  }
  db.exec('COMMIT');
  res.status(201).json({ criadas: n });
});

app.get('/api/obras/:id/contas', (req, res) => {
  const h = hoje(req);
  const rows = db.prepare(SEL_CONTAS + ' WHERE c.obra_id=? ORDER BY c.pago_em IS NOT NULL, c.vencimento').all(Number(req.params.id));
  res.json(rows.map(c => ({ ...c, status: statusConta(c, h) })));
});

app.post('/api/contas/:id/pagar', (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT c.*, f.nome AS fornecedor FROM contas c LEFT JOIN fornecedores f ON f.id=c.fornecedor_id WHERE c.id=?').get(id);
  if (!c) return res.sendStatus(404);
  if (c.pago_em) return res.status(409).json({ erro: 'conta já paga' });
  const data = isoDate(req.body.data) ? req.body.data : hoje(req);
  const valor = Number(req.body.valor) > 0 ? Number(req.body.valor) : c.valor;
  db.exec('BEGIN');
  db.prepare('UPDATE contas SET pago_em=?, valor_pago=? WHERE id=?').run(data, valor, id);
  db.prepare('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor,conta_id) VALUES (?,?,?,?,?,?,?)')
    .run(c.obra_id, c.etapa, c.descricao, c.fornecedor || '', data, valor, id);
  db.exec('COMMIT');
  res.json({ ok: true });
});
app.post('/api/contas/:id/estornar', (req, res) => {
  const id = Number(req.params.id);
  db.exec('BEGIN');
  db.prepare('DELETE FROM gastos WHERE conta_id=?').run(id);
  db.prepare('UPDATE contas SET pago_em=NULL, valor_pago=NULL WHERE id=?').run(id);
  db.exec('COMMIT');
  res.json({ ok: true });
});
app.delete('/api/contas/:id', (req, res) => {
  const id = Number(req.params.id);
  db.exec('BEGIN');
  db.prepare('DELETE FROM gastos WHERE conta_id=?').run(id);
  db.prepare('DELETE FROM contas WHERE id=?').run(id);
  db.exec('COMMIT');
  res.json({ ok: true });
});

// Painel do dia (todas as obras): vencidas, hoje, próximos 7 dias, fluxo por semana, etapas estouradas
app.get('/api/painel', (req, res) => {
  const h = hoje(req), em7 = addDias(h, 7);
  const abertas = db.prepare(SEL_CONTAS + ' WHERE c.pago_em IS NULL ORDER BY c.vencimento').all();
  const soma = l => l.reduce((a, c) => a + c.valor, 0);
  const atrasadas = abertas.filter(c => c.vencimento < h);
  const hojeL = abertas.filter(c => c.vencimento === h);
  const prox7 = abertas.filter(c => c.vencimento > h && c.vencimento <= em7);
  const semanas = [];
  for (let i = 0; i < 8; i++) {
    const ini = addDias(h, i * 7), fim = addDias(h, i * 7 + 6);
    const l = abertas.filter(c => c.vencimento >= ini && c.vencimento <= fim);
    semanas.push({ inicio: ini, fim, total: soma(l), contas: l.length });
  }
  const estouradas = [];
  for (const o of db.prepare('SELECT id,nome FROM obras').all()) {
    const prev = new Map(db.prepare('SELECT etapa, SUM(total) v FROM orcamento WHERE obra_id=? GROUP BY etapa').all(o.id).map(r => [r.etapa, r.v]));
    for (const g of db.prepare('SELECT etapa, SUM(valor) v FROM gastos WHERE obra_id=? GROUP BY etapa').all(o.id)) {
      const p = prev.get(g.etapa) || 0;
      if (p > 0 && g.v > p) estouradas.push({ obra_id: o.id, obra: o.nome, etapa: g.etapa, previsto: p, gasto: g.v, excesso: g.v - p });
    }
  }
  res.json({
    hoje: h,
    atrasadas: { total: soma(atrasadas), contas: atrasadas },
    vence_hoje: { total: soma(hojeL), contas: hojeL },
    proximos_7_dias: { total: soma(prox7), contas: prox7 },
    total_a_pagar: soma(abertas),
    fluxo_semanal: semanas,
    etapas_estouradas: estouradas,
  });
});

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3100;
  app.listen(PORT, () => console.log(`Gestão de Obras em http://localhost:${PORT}`));
}
