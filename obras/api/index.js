// Ponto de entrada da Vercel: todas as chamadas /api/* e /healthz chegam aqui (ver vercel.json).
const app = require('../server');

module.exports = async (req, res) => {
  try {
    await app.pronto; // garante que as tabelas existem antes de atender
  } catch (e) {
    console.error('Banco indisponível:', e.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ erro: 'Banco de dados indisponível. Confira a variável DATABASE_URL.' }));
  }
  return app(req, res);
};
