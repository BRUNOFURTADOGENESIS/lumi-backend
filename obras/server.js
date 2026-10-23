const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { q, one, tx, migrate } = require('./db');
const auth = require('./auth');

const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA, 'docs'), { recursive: true });

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = v => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
};
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
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
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
// "hoje" no fuso da obra (padrão Brasília), não em UTC: depois das 21h o dia UTC já é o seguinte
const hojeLocal = () => new Date().toLocaleDateString('sv-SE', { timeZone: process.env.TZ_OBRA || 'America/Sao_Paulo' });
const hoje = req => (isoDate(req.query.hoje) ? req.query.hoje : hojeLocal());
const addDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ID = v => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 2147483647 ? Number(v) : 0);

const app = express();
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---------- Autenticação ----------
app.get('/api/auth/status', wrap(async (req, res) => {
  const { n } = await one('SELECT COUNT(*)::int AS n FROM usuarios');
  res.json({ precisa_setup: n === 0, usuario: await auth.usuarioDaSessao(req) });
}));
app.post('/api/auth/setup', wrap(async (req, res) => {
  const erro = auth.validaNovoUsuario(req.body);
  if (erro) return res.status(400).json({ erro });
  const hash = await auth.hashSenha(String(req.body.senha));
  // só cria o primeiro usuário; a checagem e o insert são uma única instrução (sem corrida)
  const u = await one(`INSERT INTO usuarios (nome,email,senha_hash,papel)
    SELECT ?,?,?, 'admin' WHERE NOT EXISTS (SELECT 1 FROM usuarios) RETURNING id,nome,email,papel`,
    [String(req.body.nome).trim(), String(req.body.email).trim().toLowerCase(), hash]);
  if (!u) return res.status(409).json({ erro: 'o sistema já foi configurado' });
  await auth.abreSessao(req, res, u.id);
  res.status(201).json(u);
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), k = auth.chave(req, email);
  if (auth.bloqueado(k)) return res.status(429).json({ erro: 'muitas tentativas; tente novamente em 15 minutos' });
  const u = await one('SELECT * FROM usuarios WHERE email=?', [email]);
  const ok = u ? await auth.confereSenha(String(req.body.senha || ''), u.senha_hash) : (await auth.hashSenha('x'), false);
  if (!ok) { auth.registraFalha(k); return res.status(401).json({ erro: 'e-mail ou senha incorretos' }); }
  auth.falhas.delete(k);
  await auth.abreSessao(req, res, u.id);
  res.json({ id: u.id, nome: u.nome, email: u.email, papel: u.papel });
}));
app.post('/api/auth/logout', wrap(async (req, res) => { await auth.fechaSessao(req, res); res.json({ ok: true }); }));

app.use('/api', wrap(auth.exigeLogin));

app.get('/api/usuarios', wrap(async (req, res) => res.json(await q('SELECT id,nome,email,papel,criado_em FROM usuarios ORDER BY id'))));
app.post('/api/usuarios', wrap(async (req, res) => {
  const erro = auth.validaNovoUsuario(req.body);
  if (erro) return res.status(400).json({ erro });
  if (!auth.PAPEIS.includes(req.body.papel)) return res.status(400).json({ erro: 'papel inválido' });
  const hash = await auth.hashSenha(String(req.body.senha));
  const email = String(req.body.email).trim().toLowerCase();
  const u = await one('INSERT INTO usuarios (nome,email,senha_hash,papel) VALUES (?,?,?,?) ON CONFLICT (email) DO NOTHING RETURNING id,nome,email,papel',
    [String(req.body.nome).trim(), email, hash, req.body.papel]);
  if (!u) return res.status(409).json({ erro: 'já existe usuário com este e-mail' });
  res.status(201).json(u);
}));
app.delete('/api/usuarios/:id', wrap(async (req, res) => {
  const id = ID(req.params.id);
  if (id === req.usuario.id) return res.status(400).json({ erro: 'você não pode excluir o próprio usuário' });
  await q('DELETE FROM usuarios WHERE id=?', [id]);
  res.json({ ok: true });
}));

// ---------- Obras ----------
app.get('/api/obras', wrap(async (req, res) => res.json(await q('SELECT * FROM obras ORDER BY id DESC'))));
app.post('/api/obras', wrap(async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  const o = await one('INSERT INTO obras (nome) VALUES (?) RETURNING id', [nome]);
  res.status(201).json({ id: o.id, nome });
}));
// garante que a obra existe antes de gravar nela (evita erro de chave estrangeira virar 500)
const obraExiste = wrap(async (req, res, next) => {
  if (!(await one('SELECT 1 AS x FROM obras WHERE id=?', [ID(req.params.id)]))) return res.status(404).json({ erro: 'obra não encontrada' });
  next();
});

// Importa orçamento (substitui o anterior da obra)
app.post('/api/obras/:id/orcamento/importar', obraExiste, upload.single('arquivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
  const id = ID(req.params.id);
  const n = await tx(async t => {
    await t.q('DELETE FROM orcamento WHERE obra_id=?', [id]);
    let n = 0;
    for (const r of readRows(req.file.buffer)) {
      const qtd = num(pick(r, 'qtd')), vu = num(pick(r, 'valor_unit'));
      const total = num(pick(r, 'total')) || qtd * vu;
      const item = String(pick(r, 'item'));
      if (!item && !total) continue;
      await t.q('INSERT INTO orcamento (obra_id,etapa,item,unidade,qtd,valor_unit,total) VALUES (?,?,?,?,?,?,?)',
        [id, String(pick(r, 'etapa')) || 'Sem etapa', item, String(pick(r, 'unidade')), qtd, vu, r2(total)]);
      n++;
    }
    return n;
  });
  res.json({ importados: n });
}));

// Importa gastos já realizados (obra em andamento) – soma aos existentes
app.post('/api/obras/:id/gastos/importar', obraExiste, upload.single('arquivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
  const id = ID(req.params.id);
  const n = await tx(async t => {
    let n = 0;
    for (const r of readRows(req.file.buffer)) {
      const valor = num(pick(r, 'valor'));
      if (!valor) continue;
      await t.q('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor) VALUES (?,?,?,?,?,?)',
        [id, String(pick(r, 'etapa')) || 'Sem etapa', String(pick(r, 'descricao')), String(pick(r, 'fornecedor')), fmtDate(pick(r, 'data')), r2(valor)]);
      n++;
    }
    return n;
  });
  res.json({ importados: n });
}));

app.post('/api/obras/:id/gastos', obraExiste, wrap(async (req, res) => {
  const { etapa, descricao, fornecedor, data, valor } = req.body;
  if (!(Number(valor) > 0)) return res.status(400).json({ erro: 'valor inválido' });
  await q('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor) VALUES (?,?,?,?,?,?)',
    [ID(req.params.id), etapa || 'Sem etapa', descricao || '', fornecedor || '', data || '', r2(Number(valor))]);
  res.status(201).json({ ok: true });
}));
app.get('/api/obras/:id/gastos', wrap(async (req, res) =>
  res.json(await q('SELECT * FROM gastos WHERE obra_id=? ORDER BY data DESC, id DESC', [ID(req.params.id)]))));
app.delete('/api/gastos/:id', wrap(async (req, res) => { await q('DELETE FROM gastos WHERE id=?', [ID(req.params.id)]); res.json({ ok: true }); }));

// Documentos (PDF, imagens, planilhas) vinculados à obra
app.post('/api/obras/:id/documentos', obraExiste, upload.single('arquivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
  const arquivo = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
  await fs.promises.writeFile(path.join(DATA, 'docs', arquivo), req.file.buffer);
  const nome = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  await q('INSERT INTO documentos (obra_id,nome,arquivo) VALUES (?,?,?)', [ID(req.params.id), nome, arquivo]);
  res.status(201).json({ ok: true });
}));
app.get('/api/obras/:id/documentos', wrap(async (req, res) =>
  res.json(await q('SELECT id,nome,enviado_em FROM documentos WHERE obra_id=? ORDER BY id DESC', [ID(req.params.id)]))));
app.get('/api/documentos/:id/download', wrap(async (req, res) => {
  const d = await one('SELECT * FROM documentos WHERE id=?', [ID(req.params.id)]);
  if (!d) return res.sendStatus(404);
  res.download(path.join(DATA, 'docs', d.arquivo), d.nome);
}));

// Relatório: previsto × gasto por etapa
app.get('/api/obras/:id/relatorio', wrap(async (req, res) => {
  const id = ID(req.params.id);
  const prev = await q('SELECT etapa, SUM(total) v FROM orcamento WHERE obra_id=? GROUP BY etapa', [id]);
  const real = await q('SELECT etapa, SUM(valor) v FROM gastos WHERE obra_id=? GROUP BY etapa', [id]);
  const map = new Map();
  for (const p of prev) map.set(p.etapa, { etapa: p.etapa, previsto: p.v, gasto: 0 });
  for (const g of real) {
    const e = map.get(g.etapa) || { etapa: g.etapa, previsto: 0, gasto: 0 };
    e.gasto = g.v; map.set(g.etapa, e);
  }
  const etapas = [...map.values()].map(e => ({
    ...e, saldo: r2(e.previsto - e.gasto), pct: e.previsto ? (e.gasto / e.previsto) * 100 : null,
  }));
  const previsto = r2(etapas.reduce((a, e) => a + e.previsto, 0));
  const gasto = r2(etapas.reduce((a, e) => a + e.gasto, 0));
  res.json({ previsto, gasto, saldo: r2(previsto - gasto), pct: previsto ? (gasto / previsto) * 100 : null, etapas });
}));

// ---------- Financeiro: fornecedores, contas a pagar, fluxo, painel ----------
const statusConta = (c, h) => c.pago_em ? 'pago' : c.vencimento < h ? 'atrasado' : c.vencimento === h ? 'vence_hoje' : 'a_pagar';
const SEL_CONTAS = `SELECT c.*, f.nome AS fornecedor, o.nome AS obra FROM contas c
  LEFT JOIN fornecedores f ON f.id=c.fornecedor_id JOIN obras o ON o.id=c.obra_id`;

app.get('/api/fornecedores', wrap(async (req, res) => res.json(await q('SELECT * FROM fornecedores ORDER BY nome'))));
app.post('/api/fornecedores', wrap(async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'nome obrigatório' });
  await q('INSERT INTO fornecedores (nome,documento,contato) VALUES (?,?,?) ON CONFLICT (nome) DO NOTHING', [nome, req.body.documento || '', req.body.contato || '']);
  res.status(201).json(await one('SELECT * FROM fornecedores WHERE nome=?', [nome]));
}));

app.post('/api/obras/:id/contas', obraExiste, wrap(async (req, res) => {
  const { fornecedor, etapa, descricao, vencimento, valor, parcelas } = req.body;
  if (!isoDate(vencimento)) return res.status(400).json({ erro: 'vencimento inválido (aaaa-mm-dd)' });
  if (!(Number(valor) > 0)) return res.status(400).json({ erro: 'valor inválido' });
  const n = Math.min(Math.max(parseInt(parcelas) || 1, 1), 60);
  const cents = Math.round(Number(valor) * 100), base = Math.floor(cents / n);
  await tx(async t => {
    let fid = null;
    const nomeF = String(fornecedor || '').trim();
    if (nomeF) {
      await t.q('INSERT INTO fornecedores (nome) VALUES (?) ON CONFLICT (nome) DO NOTHING', [nomeF]);
      fid = (await t.one('SELECT id FROM fornecedores WHERE nome=?', [nomeF])).id;
    }
    for (let i = 0; i < n; i++) {
      const d = new Date(vencimento + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + i);
      const venc = d.getUTCDate() === Number(vencimento.slice(8)) ? d.toISOString().slice(0, 10)
        : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10); // dia 31 → último dia do mês
      const v = (i === n - 1 ? cents - base * (n - 1) : base) / 100;
      await t.q('INSERT INTO contas (obra_id,fornecedor_id,etapa,descricao,vencimento,valor) VALUES (?,?,?,?,?,?)',
        [ID(req.params.id), fid, etapa || 'Sem etapa', n > 1 ? `${descricao || ''} (${i + 1}/${n})`.trim() : descricao || '', venc, v]);
    }
  });
  res.status(201).json({ criadas: n });
}));

app.get('/api/obras/:id/contas', wrap(async (req, res) => {
  const h = hoje(req);
  const rows = await q(SEL_CONTAS + ' WHERE c.obra_id=? ORDER BY c.pago_em IS NOT NULL, c.vencimento, c.id', [ID(req.params.id)]);
  res.json(rows.map(c => ({ ...c, status: statusConta(c, h) })));
}));

app.post('/api/contas/:id/pagar', wrap(async (req, res) => {
  const id = ID(req.params.id);
  const data = isoDate(req.body.data) ? req.body.data : hoje(req);
  const r = await tx(async t => {
    // o UPDATE condicional impede pagamento duplicado mesmo com dois cliques simultâneos
    const c = await t.one(`UPDATE contas SET pago_em=?, valor_pago=COALESCE(?::numeric, valor) WHERE id=? AND pago_em IS NULL RETURNING *`,
      [data, Number(req.body.valor) > 0 ? r2(Number(req.body.valor)) : null, id]);
    if (!c) return null;
    const f = c.fornecedor_id ? (await t.one('SELECT nome FROM fornecedores WHERE id=?', [c.fornecedor_id])).nome : '';
    await t.q('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor,conta_id) VALUES (?,?,?,?,?,?,?)',
      [c.obra_id, c.etapa, c.descricao, f, data, c.valor_pago, id]);
    return c;
  });
  if (r) return res.json({ ok: true });
  res.status((await one('SELECT 1 AS x FROM contas WHERE id=?', [id])) ? 409 : 404).json({ erro: 'conta já paga ou inexistente' });
}));
app.post('/api/contas/:id/estornar', wrap(async (req, res) => {
  const id = ID(req.params.id);
  await tx(async t => {
    await t.q('DELETE FROM gastos WHERE conta_id=?', [id]);
    await t.q('UPDATE contas SET pago_em=NULL, valor_pago=NULL WHERE id=?', [id]);
  });
  res.json({ ok: true });
}));
app.delete('/api/contas/:id', wrap(async (req, res) => {
  const id = ID(req.params.id);
  await tx(async t => {
    await t.q('DELETE FROM gastos WHERE conta_id=?', [id]);
    await t.q('DELETE FROM contas WHERE id=?', [id]);
  });
  res.json({ ok: true });
}));

// Painel do dia (todas as obras): vencidas, hoje, próximos 7 dias, fluxo por semana, etapas estouradas
app.get('/api/painel', wrap(async (req, res) => {
  const h = hoje(req), em7 = addDias(h, 7);
  const abertas = await q(SEL_CONTAS + ' WHERE c.pago_em IS NULL ORDER BY c.vencimento, c.id');
  const soma = l => r2(l.reduce((a, c) => a + c.valor, 0));
  const atrasadas = abertas.filter(c => c.vencimento < h);
  const hojeL = abertas.filter(c => c.vencimento === h);
  const prox7 = abertas.filter(c => c.vencimento > h && c.vencimento <= em7);
  const semanas = [];
  for (let i = 0; i < 8; i++) {
    const ini = addDias(h, i * 7), fim = addDias(h, i * 7 + 6);
    const l = abertas.filter(c => c.vencimento >= ini && c.vencimento <= fim);
    semanas.push({ inicio: ini, fim, total: soma(l), contas: l.length });
  }
  const estouradas = await q(`
    SELECT o.id AS obra_id, o.nome AS obra, g.etapa, p.v AS previsto, g.v AS gasto, g.v - p.v AS excesso
    FROM (SELECT obra_id, etapa, SUM(valor) v FROM gastos GROUP BY obra_id, etapa) g
    JOIN (SELECT obra_id, etapa, SUM(total) v FROM orcamento GROUP BY obra_id, etapa) p ON p.obra_id=g.obra_id AND p.etapa=g.etapa
    JOIN obras o ON o.id=g.obra_id WHERE p.v > 0 AND g.v > p.v ORDER BY excesso DESC`);
  res.json({
    hoje: h,
    atrasadas: { total: soma(atrasadas), contas: atrasadas },
    vence_hoje: { total: soma(hojeL), contas: hojeL },
    proximos_7_dias: { total: soma(prox7), contas: prox7 },
    total_a_pagar: soma(abertas),
    fluxo_semanal: semanas,
    etapas_estouradas: estouradas,
  });
}));

// ---------- Orçamento editável ----------
app.get('/api/obras/:id/orcamento', wrap(async (req, res) =>
  res.json(await q('SELECT * FROM orcamento WHERE obra_id=? ORDER BY etapa, id', [ID(req.params.id)]))));
function itemOrc(b) {
  const qtd = num(b.qtd), vu = num(b.valor_unit);
  return [String(b.etapa || '').trim() || 'Sem etapa', String(b.item || ''), String(b.unidade || ''), qtd, vu, r2(qtd * vu)];
}
app.post('/api/obras/:id/orcamento', obraExiste, wrap(async (req, res) => {
  if (!String(req.body.item || '').trim()) return res.status(400).json({ erro: 'item obrigatório' });
  const o = await one('INSERT INTO orcamento (obra_id,etapa,item,unidade,qtd,valor_unit,total) VALUES (?,?,?,?,?,?,?) RETURNING id', [ID(req.params.id), ...itemOrc(req.body)]);
  res.status(201).json({ id: o.id });
}));
app.put('/api/orcamento/:id', wrap(async (req, res) => {
  const r = await q('UPDATE orcamento SET etapa=?,item=?,unidade=?,qtd=?,valor_unit=?,total=? WHERE id=? RETURNING id', [...itemOrc(req.body), ID(req.params.id)]);
  res.sendStatus(r.length ? 200 : 404);
}));
app.delete('/api/orcamento/:id', wrap(async (req, res) => { await q('DELETE FROM orcamento WHERE id=?', [ID(req.params.id)]); res.json({ ok: true }); }));

// ---------- Medição física e cronograma ----------
app.post('/api/obras/:id/medicoes', obraExiste, wrap(async (req, res) => {
  const pct = Number(req.body.pct), etapa = String(req.body.etapa || '').trim();
  if (!etapa) return res.status(400).json({ erro: 'etapa obrigatória' });
  if (!(pct >= 0 && pct <= 100)) return res.status(400).json({ erro: 'percentual deve estar entre 0 e 100' });
  const data = isoDate(req.body.data) ? req.body.data : hoje(req);
  await q('INSERT INTO medicoes (obra_id,etapa,pct,data,obs) VALUES (?,?,?,?,?)', [ID(req.params.id), etapa, pct, data, req.body.obs || '']);
  res.status(201).json({ ok: true });
}));
app.get('/api/obras/:id/medicoes', wrap(async (req, res) =>
  res.json(await q('SELECT * FROM medicoes WHERE obra_id=? ORDER BY data DESC, id DESC', [ID(req.params.id)]))));

app.put('/api/obras/:id/cronograma', obraExiste, wrap(async (req, res) => {
  const { etapa, inicio, fim } = req.body;
  if (!String(etapa || '').trim()) return res.status(400).json({ erro: 'etapa obrigatória' });
  if ((inicio && !isoDate(inicio)) || (fim && !isoDate(fim))) return res.status(400).json({ erro: 'data inválida (aaaa-mm-dd)' });
  if (inicio && fim && fim < inicio) return res.status(400).json({ erro: 'fim anterior ao início' });
  await q('INSERT INTO cronograma (obra_id,etapa,inicio,fim) VALUES (?,?,?,?) ON CONFLICT (obra_id,etapa) DO UPDATE SET inicio=EXCLUDED.inicio, fim=EXCLUDED.fim',
    [ID(req.params.id), String(etapa).trim(), inicio || null, fim || null]);
  res.json({ ok: true });
}));

// Avanço por etapa: físico (última medição), planejado (linear entre início e fim), custo e sugestão de pagamento
app.get('/api/obras/:id/avanco', wrap(async (req, res) => {
  const id = ID(req.params.id), h = hoje(req);
  const prev = new Map((await q('SELECT etapa, SUM(total) v FROM orcamento WHERE obra_id=? GROUP BY etapa', [id])).map(r => [r.etapa, r.v]));
  const gasto = new Map((await q('SELECT etapa, SUM(valor) v FROM gastos WHERE obra_id=? GROUP BY etapa', [id])).map(r => [r.etapa, r.v]));
  const cron = new Map((await q('SELECT * FROM cronograma WHERE obra_id=?', [id])).map(r => [r.etapa, r]));
  const med = new Map();
  for (const m of await q('SELECT * FROM medicoes WHERE obra_id=? ORDER BY data, id', [id])) med.set(m.etapa, m);
  const nomes = [...new Set([...prev.keys(), ...gasto.keys(), ...cron.keys(), ...med.keys()])].sort();
  const etapas = nomes.map(etapa => {
    const c = cron.get(etapa) || {}, m = med.get(etapa);
    const previsto = prev.get(etapa) || 0, g = gasto.get(etapa) || 0, pct_fisico = m ? m.pct : 0;
    let pct_planejado = null;
    if (c.inicio && c.fim) {
      const tot = Math.max(diasEntre(c.inicio, c.fim), 1);
      pct_planejado = Math.min(100, Math.max(0, (diasEntre(c.inicio, h) / tot) * 100));
    }
    let status = 'sem_prazo';
    if (pct_fisico >= 100) status = 'concluida';
    else if (c.fim && h > c.fim) status = 'atrasada';
    else if (c.inicio && h < c.inicio) status = 'nao_iniciada';
    else if (pct_planejado != null) status = pct_fisico + 10 < pct_planejado ? 'atrasada' : 'em_dia';
    const valor_fisico = r2(previsto * pct_fisico / 100);
    return { etapa, inicio: c.inicio || null, fim: c.fim || null, previsto, gasto: g, pct_fisico, ultima_medicao: m ? m.data : null,
      pct_planejado, status, valor_fisico, a_pagar_sugerido: r2(Math.max(0, valor_fisico - g)), pago_alem_do_fisico: r2(Math.max(0, g - valor_fisico)) };
  });
  const totPrev = etapas.reduce((a, e) => a + e.previsto, 0);
  res.json({ hoje: h, pct_fisico_obra: totPrev ? etapas.reduce((a, e) => a + e.previsto * e.pct_fisico, 0) / totPrev : 0, etapas });
}));

// erro inesperado: registra no servidor e devolve resposta genérica (sem vazar detalhes)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ erro: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ erro: 'erro interno' });
});

module.exports = app;
module.exports.pronto = migrate();
if (require.main === module) {
  if (!process.env.DATABASE_URL) { console.error('Defina DATABASE_URL (ex.: postgres://usuario:senha@localhost:5432/obras)'); process.exit(1); }
  const PORT = process.env.PORT || 3100;
  app.pronto.then(() => app.listen(PORT, () => console.log(`Gestão de Obras em http://localhost:${PORT}`)))
    .catch(e => { console.error('Falha ao preparar o banco:', e.message); process.exit(1); });
}
