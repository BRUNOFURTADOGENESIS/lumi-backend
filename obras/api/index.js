// Ponto de entrada da Vercel. Tudo o que não for um arquivo estático publicado pela Vercel chega aqui
// (ver vercel.json). Assim as páginas continuam abrindo mesmo que a pasta de saída esteja mal configurada.
const app = require('../server');

const usaBanco = url => /^\/(api|healthz)(\/|\?|$)/.test(url || '');

module.exports = async (req, res) => {
  if (usaBanco(req.url)) {
    try {
      await app.pronto; // garante que as tabelas existem antes de atender
    } catch (e) {
      console.error('Banco indisponível:', e.message);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ erro: 'Banco de dados indisponível. Confira a variável DATABASE_URL.' }));
    }
  }
  return app(req, res);
};
