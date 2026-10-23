const { Pool, types } = require('pg');

// NUMERIC (1700) chega como string; os valores do sistema cabem com folga em number
types.setTypeParser(1700, parseFloat);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const conv = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + ++i); }; // aceita ? como placeholder
const run = (client, sql, params = []) => client.query(conv(sql), params).then(r => r.rows);

const q = (sql, params) => run(pool, sql, params);
const one = async (sql, params) => (await q(sql, params))[0];

async function tx(fn) {
  const c = await pool.connect();
  const t = { q: (sql, params) => run(c, sql, params), one: async (sql, params) => (await run(c, sql, params))[0] };
  try {
    await c.query('BEGIN');
    const r = await fn(t);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin','editor','leitura')), criado_em TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS'));
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, expira_em TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS obras (id SERIAL PRIMARY KEY, nome TEXT NOT NULL, criada_em TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS'));
CREATE TABLE IF NOT EXISTS orcamento (id SERIAL PRIMARY KEY, obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa TEXT, item TEXT, unidade TEXT, qtd NUMERIC(15,4), valor_unit NUMERIC(15,4), total NUMERIC(15,2));
CREATE TABLE IF NOT EXISTS gastos (id SERIAL PRIMARY KEY, obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa TEXT, descricao TEXT, fornecedor TEXT, data TEXT, valor NUMERIC(15,2) NOT NULL, conta_id INTEGER);
CREATE TABLE IF NOT EXISTS fornecedores (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE, documento TEXT, contato TEXT);
CREATE TABLE IF NOT EXISTS contas (id SERIAL PRIMARY KEY, obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  fornecedor_id INTEGER REFERENCES fornecedores(id), etapa TEXT, descricao TEXT, vencimento TEXT NOT NULL,
  valor NUMERIC(15,2) NOT NULL, pago_em TEXT, valor_pago NUMERIC(15,2));
CREATE TABLE IF NOT EXISTS medicoes (id SERIAL PRIMARY KEY, obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL, pct NUMERIC(5,2) NOT NULL, data TEXT NOT NULL, obs TEXT);
CREATE TABLE IF NOT EXISTS cronograma (obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa TEXT NOT NULL, inicio TEXT, fim TEXT, PRIMARY KEY (obra_id, etapa));
CREATE TABLE IF NOT EXISTS documentos (id SERIAL PRIMARY KEY, obra_id INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome TEXT, arquivo TEXT, enviado_em TEXT DEFAULT to_char(now(),'YYYY-MM-DD HH24:MI:SS'));
CREATE INDEX IF NOT EXISTS idx_contas_venc ON contas (pago_em, vencimento);
CREATE INDEX IF NOT EXISTS idx_gastos_obra ON gastos (obra_id, etapa);
`;
const migrate = () => pool.query(SCHEMA);

module.exports = { q, one, tx, migrate, pool };
