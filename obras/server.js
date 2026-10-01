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
CREATE TABLE IF NOT EXISTS documentos (id INTEGER PRIMARY KEY, obra_id INTEGER NOT NULL, nome TEXT, arquivo TEXT, enviado_em TEXT DEFAULT CURRENT_TIMESTAMP);
`);

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

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3100;
  app.listen(PORT, () => console.log(`Gestão de Obras em http://localhost:${PORT}`));
}
