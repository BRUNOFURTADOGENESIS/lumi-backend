// Central de importação (notas, planilhas) e cadastro de fornecedores.
const { q, one, tx } = require('./db');
const I = require('./importacao');

module.exports = (app, { wrap, upload, obraExiste, ID, r2, isoDate, hoje }) => {
  const so = v => String(v ?? '').trim();
  const dig = v => String(v ?? '').replace(/\D/g, '');
  const emailOk = e => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const nomeArq = f => Buffer.from(f.originalname, 'latin1').toString('utf8');
  const guardaDoc = (t, obraId, f) => t.q('INSERT INTO documentos (obra_id,nome,arquivo,conteudo) VALUES (?,?,?,?)', [obraId, nomeArq(f), '', f.buffer]);

  // cria ou completa um fornecedor: acha por CNPJ, depois por nome; só preenche o que estiver vazio
  async function upsertFornecedor(t, f) {
    const nome = so(f.nome), cnpj = dig(f.cnpj);
    let row = cnpj ? await t.one('SELECT * FROM fornecedores WHERE documento=?', [cnpj]) : null;
    if (!row && nome) row = await t.one('SELECT * FROM fornecedores WHERE lower(nome)=lower(?)', [nome]);
    const campos = { especialidade: so(f.especialidade), cidade: so(f.cidade), email: so(f.email).toLowerCase(), telefone: so(f.telefone), contato: so(f.contato) };
    if (row) {
      const sets = [], vals = [];
      for (const [c, v] of Object.entries({ ...campos, documento: cnpj })) if (v && !so(row[c])) { sets.push(`${c}=?`); vals.push(v); }
      if (sets.length) await t.q(`UPDATE fornecedores SET ${sets.join(',')} WHERE id=?`, [...vals, row.id]);
      return { id: row.id, criado: false, atualizado: sets.length > 0 };
    }
    const r = await t.one('INSERT INTO fornecedores (nome,documento,especialidade,cidade,email,telefone,contato) VALUES (?,?,?,?,?,?,?) RETURNING id',
      [nome, cnpj || null, campos.especialidade, campos.cidade, campos.email, campos.telefone, campos.contato]);
    return { id: r.id, criado: true };
  }

  // nomes parecidos: ignora acento, pontuação e sufixos de empresa; "hidro forte" ~ "hidro forte instalações"
  const SUFIXO = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'e', 'de', 'do', 'da', 'comercio', 'servicos', 'industria']);
  const chaveNome = n => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t && !SUFIXO.has(t));
  const parecido = (a, b) => { const x = chaveNome(a), y = chaveNome(b); if (!x.length || !y.length) return false; const [c, l] = x.length <= y.length ? [x, y] : [y, x]; return c.every((t, i) => l[i] === t) && c.join('').length >= 4; };
  const similares = async (nome, cnpj) => (await q('SELECT id,nome,documento AS cnpj FROM fornecedores')).filter(f => (!cnpj || f.cnpj !== cnpj) && f.nome.toLowerCase() !== String(nome).toLowerCase() && parecido(nome, f.nome)).slice(0, 3);

  /* ---------- fornecedores ---------- */
  app.get('/api/fornecedores', wrap(async (req, res) => res.json(await q(`
    SELECT f.id, f.nome, f.documento AS cnpj, f.especialidade, f.cidade, f.email, f.telefone, f.contato, f.observacoes,
      COALESCE(g.pago,0) AS pago, COALESCE(g.n,0)::int AS lancamentos, COALESCE(c.aberto,0) AS em_aberto, COALESCE(c.atrasado,0) AS atrasado
    FROM fornecedores f
    LEFT JOIN (SELECT lower(fornecedor) k, SUM(valor) pago, COUNT(*) n FROM gastos GROUP BY 1) g ON g.k = lower(f.nome)
    LEFT JOIN (SELECT fornecedor_id, SUM(valor) aberto, SUM(CASE WHEN vencimento < ? THEN valor ELSE 0 END) atrasado FROM contas WHERE pago_em IS NULL GROUP BY 1) c ON c.fornecedor_id = f.id
    ORDER BY lower(f.nome)`, [hoje(req)]))));
  // pares com nomes parecidos (candidatos a cadastro duplicado)
  app.get('/api/fornecedores/duplicados', wrap(async (req, res) => {
    const l = await q('SELECT id,nome,documento AS cnpj FROM fornecedores ORDER BY lower(nome)'), pares = [];
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++)
      if (!(l[i].cnpj && l[j].cnpj && l[i].cnpj !== l[j].cnpj) && parecido(l[i].nome, l[j].nome)) pares.push({ a: l[i], b: l[j] });
    res.json(pares.slice(0, 50));
  }));
  // junta o cadastro "origem" no "destino": contas e pagamentos passam para o destino e a origem é removida
  app.post('/api/fornecedores/mesclar', wrap(async (req, res) => {
    const o = ID(req.body.origem_id), d = ID(req.body.destino_id);
    if (!o || !d || o === d) return res.status(400).json({ erro: 'escolha dois fornecedores diferentes' });
    const r = await tx(async t => {
      const orig = await t.one('SELECT * FROM fornecedores WHERE id=?', [o]), dest = await t.one('SELECT * FROM fornecedores WHERE id=?', [d]);
      if (!orig || !dest) return null;
      if (orig.documento && dest.documento && orig.documento !== dest.documento) return { conflito: true };
      const c = await t.q('UPDATE contas SET fornecedor_id=? WHERE fornecedor_id=? RETURNING id', [d, o]);
      const g = await t.q('UPDATE gastos SET fornecedor=? WHERE lower(fornecedor)=lower(?) RETURNING id', [dest.nome, orig.nome]);
      await t.q('DELETE FROM fornecedores WHERE id=?', [o]); // antes de copiar o CNPJ, que é único
      const sets = [], vals = [];
      for (const col of ['documento', 'especialidade', 'cidade', 'email', 'telefone', 'contato', 'observacoes']) if (so(orig[col]) && !so(dest[col])) { sets.push(`${col}=?`); vals.push(orig[col]); }
      if (sets.length) await t.q(`UPDATE fornecedores SET ${sets.join(',')} WHERE id=?`, [...vals, d]);
      return { contas: c.length, pagamentos: g.length };
    });
    if (!r) return res.status(404).json({ erro: 'fornecedor não encontrado' });
    if (r.conflito) return res.status(409).json({ erro: 'Os dois têm CNPJ diferente. São empresas distintas.' });
    res.json({ ok: true, ...r });
  }));
  const dadosFornecedor = b => {
    const nome = so(b.nome); if (!nome) return { erro: 'nome obrigatório' };
    const cnpj = dig(b.cnpj); if (cnpj && ![11, 14].includes(cnpj.length)) return { erro: 'CNPJ/CPF deve ter 14 ou 11 dígitos' };
    if (!emailOk(so(b.email))) return { erro: 'e-mail inválido' };
    return { v: [nome, cnpj || null, so(b.especialidade), so(b.cidade), so(b.email).toLowerCase(), so(b.telefone), so(b.contato), so(b.observacoes)] };
  };
  app.post('/api/fornecedores', wrap(async (req, res) => {
    const d = dadosFornecedor(req.body); if (d.erro) return res.status(400).json({ erro: d.erro });
    try {
      const r = await one('INSERT INTO fornecedores (nome,documento,especialidade,cidade,email,telefone,contato,observacoes) VALUES (?,?,?,?,?,?,?,?) RETURNING id', d.v);
      res.status(201).json({ id: r.id });
    } catch (e) { if (e.code === '23505') return res.status(409).json({ erro: 'já existe fornecedor com este nome ou CNPJ' }); throw e; }
  }));
  app.put('/api/fornecedores/:id', wrap(async (req, res) => {
    const d = dadosFornecedor(req.body); if (d.erro) return res.status(400).json({ erro: d.erro });
    try {
      const r = await q('UPDATE fornecedores SET nome=?,documento=?,especialidade=?,cidade=?,email=?,telefone=?,contato=?,observacoes=? WHERE id=? RETURNING id', [...d.v, ID(req.params.id)]);
      res.sendStatus(r.length ? 200 : 404);
    } catch (e) { if (e.code === '23505') return res.status(409).json({ erro: 'já existe fornecedor com este nome ou CNPJ' }); throw e; }
  }));

  /* ---------- importação ---------- */
  const PLAN = ['orcamento', 'materiais', 'gastos', 'fornecedores'];
  const resumo = (itens, tipo) => ({ total: itens.length, soma: r2(itens.reduce((a, x) => a + (x.total ?? x.valor ?? 0), 0)), previa: itens.slice(0, 40), tipo });

  // valida e padroniza os dados da nota (editados na conferência)
  function validaNota(n) {
    const valor = Number(n.valor), emissao = so(n.emissao);
    if (!so(n.fornecedor)) return { erro: 'informe o fornecedor' };
    if (!(valor > 0)) return { erro: 'informe o valor da nota' };
    let parcelas = (Array.isArray(n.parcelas) ? n.parcelas : []).map(p => ({ vencimento: so(p.vencimento), valor: Number(p.valor), numero: so(p.numero) }));
    if (!parcelas.length) parcelas = [{ vencimento: so(n.vencimento), valor, numero: '' }];
    if (parcelas.some(p => !isoDate(p.vencimento) || !(p.valor > 0))) return { erro: 'confira vencimento e valor de cada parcela' };
    if (Math.abs(parcelas.reduce((a, p) => a + p.valor, 0) - valor) > 0.05) return { erro: 'as parcelas não somam o valor da nota' };
    return { n: { fornecedor: so(n.fornecedor), cnpj: dig(n.cnpj), numero: so(n.numero), chave: dig(n.chave), emissao, valor, parcelas, etapa: so(n.etapa) || 'Sem etapa', cidade: so(n.cidade), telefone: so(n.telefone) } };
  }
  const notaExistente = async (n) => (n.chave ? await one('SELECT id FROM contas WHERE nf_chave=? LIMIT 1', [n.chave])
    : n.numero && n.cnpj ? await one('SELECT c.id FROM contas c JOIN fornecedores f ON f.id=c.fornecedor_id WHERE c.nf_numero=? AND f.documento=? LIMIT 1', [n.numero, n.cnpj]) : null);

  app.post('/api/obras/:id/importacao/processar', obraExiste, upload.single('arquivo'), wrap(async (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ erro: 'envie o campo "arquivo"' });
    const obraId = ID(req.params.id), simular = req.body.simular === '1';
    let config = null; try { config = req.body.config ? JSON.parse(req.body.config) : null; } catch { return res.status(400).json({ erro: 'configuração inválida' }); }
    const nome = nomeArq(f);

    // 1) sem configuração: só analisa e sugere
    if (!config || !config.tipo) {
      const a = await I.analisarArquivo(f.buffer, nome);
      const out = { nome, tamanho: f.size, ...a, rotulo: I.ROTULO[a.tipo] };
      if (PLAN.includes(a.tipo)) { const n = I.normalizarPlanilha(f.buffer, a.tipo, a.config); out.previa = resumo(n.itens, a.tipo); out.avisosNorm = n.avisos; }
      if (a.nota) { const ja = await notaExistente({ chave: a.nota.chave, numero: a.nota.numero, cnpj: a.nota.cnpj }); out.duplicada = !!ja;
        const forn = a.nota.cnpj ? await one('SELECT nome FROM fornecedores WHERE documento=?', [a.nota.cnpj]) : null;
        if (forn && !a.nota.fornecedor) a.nota.fornecedor = forn.nome; out.fornecedorCadastrado = !!forn;
        if (!forn && a.nota.fornecedor) out.similares = await similares(a.nota.fornecedor, a.nota.cnpj); }
      return res.json(out);
    }

    // 2) com configuração: pré-visualiza (simular) ou grava
    const tipo = config.tipo;
    if (PLAN.includes(tipo)) {
      const n = I.normalizarPlanilha(f.buffer, tipo, config);
      if (simular) return res.json({ ...resumo(n.itens, tipo), avisos: n.avisos });
      if (!n.itens.length) return res.status(400).json({ erro: 'Nenhuma linha válida encontrada. Confira as colunas.' });
      const r = await tx(async t => {
        let gravados = 0, ignorados = 0, extra = {};
        if (tipo === 'orcamento' || tipo === 'materiais') {
          if (config.modo === 'substituir' && tipo === 'orcamento') await t.q('DELETE FROM orcamento WHERE obra_id=?', [obraId]);
          for (const x of n.itens) {
            const dup = await t.one('SELECT 1 AS x FROM orcamento WHERE obra_id=? AND etapa=? AND item=? AND unidade=? AND qtd=? AND total=? LIMIT 1', [obraId, x.etapa, x.item, x.unidade, x.qtd, x.total]);
            if (dup) { ignorados++; continue; }
            await t.q('INSERT INTO orcamento (obra_id,etapa,item,unidade,qtd,valor_unit,total) VALUES (?,?,?,?,?,?,?)', [obraId, x.etapa, x.item, x.unidade, x.qtd, r2(x.valor_unit), x.total]); gravados++;
          }
        } else if (tipo === 'gastos') {
          for (const x of n.itens) {
            const dup = await t.one('SELECT 1 AS x FROM gastos WHERE obra_id=? AND COALESCE(data,\'\')=? AND valor=? AND lower(COALESCE(fornecedor,\'\'))=lower(?) AND lower(COALESCE(descricao,\'\'))=lower(?) LIMIT 1', [obraId, x.data, x.valor, x.fornecedor, x.descricao]);
            if (dup) { ignorados++; continue; }
            await t.q('INSERT INTO gastos (obra_id,etapa,descricao,fornecedor,data,valor) VALUES (?,?,?,?,?,?)', [obraId, x.etapa, x.descricao, x.fornecedor, x.data, x.valor]); gravados++;
          }
        } else {
          let criados = 0, atualizados = 0;
          for (const x of n.itens) { const u = await upsertFornecedor(t, x); if (u.criado) criados++; else if (u.atualizado) atualizados++; else ignorados++; }
          gravados = criados + atualizados; extra = { criados, atualizados };
        }
        await guardaDoc(t, obraId, f);
        return { gravados, ignorados, ...extra };
      });
      return res.json({ ok: true, ...r });
    }

    if (tipo === 'nota_fiscal') {
      const v = validaNota(config.nota || {}); if (v.erro) return res.status(400).json({ erro: v.erro });
      const nota = v.n, ja = await notaExistente(nota);
      if (simular) return res.json({ ok: true, duplicada: !!ja });
      if (ja && !config.forcar) return res.status(409).json({ erro: 'Esta nota já foi lançada.', duplicada: true });
      const r = await tx(async t => {
        const forn = await upsertFornecedor(t, { nome: nota.fornecedor, cnpj: nota.cnpj, cidade: nota.cidade, telefone: nota.telefone });
        const np = nota.parcelas.length;
        for (let i = 0; i < np; i++) {
          const p = nota.parcelas[i];
          await t.q('INSERT INTO contas (obra_id,fornecedor_id,etapa,descricao,vencimento,valor,nf_chave,nf_numero) VALUES (?,?,?,?,?,?,?,?)',
            [obraId, forn.id, nota.etapa, `NF ${nota.numero || 's/n'}${np > 1 ? ` (${i + 1}/${np})` : ''}`, p.vencimento, r2(p.valor), nota.chave || null, nota.numero || null]);
        }
        await guardaDoc(t, obraId, f);
        return { contas: np, fornecedorNovo: forn.criado };
      });
      return res.json({ ok: true, ...r });
    }

    // cotação, documento ou qualquer outro: só guarda o arquivo
    if (simular) return res.json({ ok: true });
    await tx(t => guardaDoc(t, obraId, f));
    res.json({ ok: true, gravados: 0, documento: true });
  }));
};
