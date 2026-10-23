const crypto = require('crypto');
const { q, one } = require('./db');

const DIAS_SESSAO = 14;
const PAPEIS = ['admin', 'editor', 'leitura'];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (senha, salt) => new Promise((ok, no) => crypto.scrypt(senha, salt, 64, (e, k) => (e ? no(e) : ok(k))));

async function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scrypt(senha, salt)).toString('hex')}`;
}
async function confereSenha(senha, guardado) {
  const [alg, salt, hash] = String(guardado).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = await scrypt(senha, Buffer.from(salt, 'hex')), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));

async function abreSessao(req, res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q(`INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?,?, now() + (?::int * interval '1 day'))`, [sha(token), usuarioId, DIAS_SESSAO]);
  const seguro = req.secure || process.env.COOKIE_SECURE === '1';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DIAS_SESSAO * 86400}${seguro ? '; Secure' : ''}`);
}
async function fechaSessao(req, res) {
  const t = cookies(req).sid;
  if (t) await q('DELETE FROM sessoes WHERE token_hash=?', [sha(t)]);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}
async function usuarioDaSessao(req) {
  const t = cookies(req).sid;
  if (!t) return null;
  return (await one(`SELECT u.id, u.nome, u.email, u.papel FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token_hash=? AND s.expira_em > now()`, [sha(t)])) || null;
}

// Bloqueio simples contra tentativa em massa: 5 erros por e-mail+IP trava por 15 min
const falhas = new Map();
const chave = (req, email) => `${req.ip}|${String(email).toLowerCase()}`;
const bloqueado = k => { const f = falhas.get(k); return !!f && f.n >= 5 && Date.now() < f.ate; };
const registraFalha = k => { const f = falhas.get(k) || { n: 0 }; f.n++; f.ate = Date.now() + 15 * 60 * 1000; falhas.set(k, f); };

function validaNovoUsuario(b) {
  const nome = String(b.nome || '').trim(), email = String(b.email || '').trim().toLowerCase(), senha = String(b.senha || '');
  if (!nome) return 'nome obrigatório';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'e-mail inválido';
  if (senha.length < 8) return 'a senha precisa ter pelo menos 8 caracteres';
  return null;
}

// exige login em tudo que está em /api (exceto /api/auth); papel "leitura" só consulta
async function exigeLogin(req, res, next) {
  if (req.path.startsWith('/auth/')) return next();
  const u = await usuarioDaSessao(req);
  if (!u) return res.status(401).json({ erro: 'faça login' });
  if (req.method !== 'GET' && u.papel === 'leitura') return res.status(403).json({ erro: 'seu perfil é somente leitura' });
  if (req.path.startsWith('/usuarios') && u.papel !== 'admin') return res.status(403).json({ erro: 'somente administrador' });
  req.usuario = u;
  next();
}

module.exports = { PAPEIS, hashSenha, confereSenha, abreSessao, fechaSessao, usuarioDaSessao, bloqueado, registraFalha, chave, falhas, validaNovoUsuario, exigeLogin };
