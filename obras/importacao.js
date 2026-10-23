// Identifica e normaliza arquivos enviados (planilhas, notas fiscais). Não grava nada: só lê e propõe.
const XLSX = require('xlsx');
const { XMLParser } = require('fast-xml-parser');

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/r\$|\(|\)|:/g, ' ').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, ''); // 1.234.567
  return parseFloat(s) || 0;
};
const vazio = v => v === '' || v == null || (typeof v === 'string' && !v.trim());
const so = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const digitos = v => String(v ?? '').replace(/\D/g, '');

// Nomes de coluna aceitos (comparação exata depois de normalizar: sem acento, minúsculo, sem "R$")
const ALIAS = {
  etapa: ['etapa', 'fase', 'grupo', 'categoria', 'capitulo', 'macro etapa', 'macroetapa', 'centro de custo'],
  item: ['item', 'descricao', 'descricao do item', 'descricao do servico', 'servico', 'servicos', 'insumo', 'produto', 'material', 'discriminacao', 'especificacao'],
  unidade: ['unidade', 'un', 'und', 'unid', 'medida'],
  qtd: ['qtd', 'quantidade', 'qtde', 'quant', 'qte'],
  valor_unit: ['valor unitario', 'preco unitario', 'unitario', 'vl unit', 'vl unitario', 'valor unit', 'preco unit', 'p unit', 'pu', 'custo unitario', 'unit'],
  total: ['total', 'valor total', 'preco total', 'vl total', 'custo total', 'total geral', 'valor orcado', 'orcado'],
  descricao: ['descricao', 'historico', 'descricao do gasto', 'observacao', 'obs', 'nf', 'nota fiscal', 'documento', 'referencia', 'item'],
  fornecedor: ['fornecedor', 'favorecido', 'empresa', 'credor', 'beneficiario', 'prestador'],
  data: ['data', 'data pagamento', 'data de pagamento', 'dt pagamento', 'pagamento', 'emissao', 'data emissao', 'data da emissao', 'vencimento', 'data vencimento'],
  valor: ['valor', 'valor pago', 'vl pago', 'valor liquido', 'valor bruto', 'pago', 'valor total', 'total', 'valor da nota', 'valor nf'],
  nome: ['nome', 'razao social', 'nome fantasia', 'fornecedor', 'empresa', 'fantasia'],
  cnpj: ['cnpj', 'cpf cnpj', 'cnpj cpf', 'cpf/cnpj', 'cnpj/cpf', 'documento', 'cpf'],
  especialidade: ['especialidade', 'ramo', 'segmento', 'area de atuacao', 'area', 'tipo', 'categoria', 'servico prestado', 'atividade'],
  cidade: ['cidade', 'municipio', 'localidade'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp', 'tel', 'contato telefone'],
  email: ['email', 'e mail', 'e-mail'],
  contato: ['contato', 'responsavel', 'vendedor', 'representante', 'pessoa de contato'],
};
// Campos de cada tipo, do mais específico para o mais genérico (o mais específico escolhe a coluna primeiro)
const TIPOS = {
  orcamento: { campos: ['valor_unit', 'total', 'qtd', 'unidade', 'etapa', 'item'], exige: m => m.item != null && (m.valor_unit != null || m.total != null) },
  materiais: { campos: ['qtd', 'unidade', 'etapa', 'item'], exige: m => m.item != null && m.qtd != null },
  gastos: { campos: ['valor', 'data', 'fornecedor', 'etapa', 'descricao'], exige: m => m.valor != null && (m.data != null || m.fornecedor != null || m.descricao != null) },
  fornecedores: { campos: ['cnpj', 'email', 'telefone', 'cidade', 'especialidade', 'contato', 'nome'], exige: m => m.nome != null && ['cnpj', 'email', 'telefone', 'cidade', 'especialidade', 'contato'].some(c => m[c] != null) },
};
const ROTULO = { orcamento: 'Orçamento', materiais: 'Lista de materiais', gastos: 'Gastos pagos', fornecedores: 'Fornecedores', cotacao: 'Cotação (comparativo)', nota_fiscal: 'Nota fiscal', documento: 'Só guardar' };

function mapear(tipo, cab) {
  const usado = new Set(), m = {};
  for (const campo of TIPOS[tipo].campos) {
    const i = cab.findIndex((h, j) => !usado.has(j) && ALIAS[campo].includes(h));
    if (i >= 0) { m[campo] = i; usado.add(i); }
  }
  return m;
}
const pontos = (tipo, m) => (TIPOS[tipo].exige(m) ? Object.keys(m).length : 0);

function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return wb.SheetNames.map(nome => ({ nome, linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: true, blankrows: false }).slice(0, 6000) }))
    .filter(f => f.linhas.length);
}
const textoLinha = l => l.map(norm);

function melhorCabecalho(linhas, tipos = Object.keys(TIPOS)) {
  let melhor = { linha: 0, tipo: null, pts: 0, mapa: {} };
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const cab = textoLinha(linhas[i]);
    for (const t of tipos) {
      const m = mapear(t, cab), p = pontos(t, m);
      if (p > melhor.pts) melhor = { linha: i, tipo: t, pts: p, mapa: m };
    }
  }
  return melhor;
}
const ehNumerica = (linhas, col) => { const v = linhas.map(l => l[col]).filter(x => !vazio(x)); return v.length >= 2 && v.filter(x => typeof x === 'number' || /^[\s\d.,R$-]+$/.test(String(x))).length / v.length >= 0.7; };

// Sugere tipo e colunas para uma planilha
function analisarPlanilha(buffer) {
  const folhas = lerPlanilha(buffer);
  if (!folhas.length) return { tipo: 'documento', aviso: ['A planilha está vazia.'] };
  let esc = null;
  folhas.forEach((f, idx) => { const b = melhorCabecalho(f.linhas); if (!esc || b.pts > esc.b.pts) esc = { f, idx, b }; });
  const { f, b } = esc;
  const cab = f.linhas[b.linha].map(so);
  const dados = f.linhas.slice(b.linha + 1);
  const aviso = [];
  let tipo = b.tipo, mapa = b.mapa, confianca = b.pts >= 4 ? 'alta' : b.pts >= 3 ? 'media' : 'baixa';
  const cabNorm = cab.map(norm);

  // cotação: itens com 2 ou mais colunas de preço de fornecedores diferentes
  const itemCol = cabNorm.findIndex(h => ALIAS.item.includes(h));
  const extras = cabNorm.map((h, j) => j).filter(j => !Object.values(mapa).includes(j) && j !== itemCol && ehNumerica(dados, j));
  const palavraCotacao = /cotac|proposta|comparativ|mapa de cot/.test(norm(f.nome) + ' ' + cabNorm.join(' '));
  if (itemCol >= 0 && ((!(mapa.valor_unit != null || mapa.total != null) && extras.length >= 2) || palavraCotacao)) {
    tipo = 'cotacao'; confianca = palavraCotacao ? 'alta' : 'media';
    aviso.push('Parece um comparativo de preços entre fornecedores. O mapa comparativo ainda não está disponível: o arquivo será guardado em Documentos.');
  }
  if (!tipo) { tipo = 'documento'; confianca = 'baixa'; aviso.push('Não reconheci as colunas. Escolha o tipo e indique as colunas, ou guarde só como documento.'); }
  if (folhas.length > 1) aviso.push(`A planilha tem ${folhas.length} abas; usei "${f.nome}".`);
  const mapas = Object.fromEntries(Object.keys(TIPOS).map(t => [t, mapear(t, cabNorm)]));
  return { tipo, confianca, config: { folha: f.nome, linhaCab: b.linha, mapa }, mapas, cabecalho: cab, amostra: dados.slice(0, 5).map(l => l.slice(0, cab.length)), totalLinhas: dados.length, aviso };
}

function fmtData(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10); // data serial do Excel
  const s = so(v), br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) { const a = br[3].length === 2 ? '20' + br[3] : br[3]; return `${a}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`; }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
const ehTotalGeral = t => /^(sub\s?)?total( geral)?\b/i.test(norm(t));
const limpaEtapa = t => so(t).replace(/^[\d.\s-]+(?=[A-Za-zÀ-ÿ])/, '') || so(t);

// Aplica a configuração (aba, linha do cabeçalho, mapa de colunas) e devolve registros normalizados
function normalizarPlanilha(buffer, tipo, config) {
  const folhas = lerPlanilha(buffer);
  const f = folhas.find(x => x.nome === config.folha) || folhas[0];
  const m = config.mapa || {}, linhas = f.linhas.slice((config.linhaCab ?? 0) + 1);
  const cel = (l, campo) => (m[campo] == null || m[campo] === '' ? '' : l[Number(m[campo])]);
  const avisos = [], itens = [];
  let etapaAtual = '';

  if (tipo === 'orcamento' || tipo === 'materiais') {
    const comPreco = tipo === 'orcamento';
    let declarado = 0;
    linhas.forEach((l, i) => {
      const item = so(cel(l, 'item'));
      if ([item, so(cel(l, 'etapa')), so(l[0])].some(t => t && ehTotalGeral(t))) { declarado = Math.max(declarado, num(cel(l, 'total'))); return; }
      if (!item) return;
      const qtd = num(cel(l, 'qtd')), vu = comPreco ? num(cel(l, 'valor_unit')) : 0;
      let total = comPreco ? num(cel(l, 'total')) : 0;
      if (m.etapa == null || m.etapa === '') {
        // sem coluna de etapa: linha de título (sem quantidade e sem preço unitário) seguida de itens vira a etapa
        const proxima = linhas.slice(i + 1).find(x => !vazio(x[Number(m.item)]));
        const filhos = proxima && (num(cel(proxima, 'qtd')) > 0 || (comPreco && num(cel(proxima, 'valor_unit')) > 0));
        if (!qtd && !vu && filhos) { etapaAtual = limpaEtapa(item); return; }
      }
      if (comPreco && !total) total = qtd * vu;
      if (!total && !qtd && comPreco) return;
      itens.push({ etapa: so(cel(l, 'etapa')) || etapaAtual || 'Sem etapa', item, unidade: so(cel(l, 'unidade')), qtd, valor_unit: vu || (qtd ? total / qtd : 0), total: Math.round(total * 100) / 100 });
    });
    if (comPreco && !itens.some(x => x.qtd)) avisos.push('Nenhuma linha tem quantidade. Confira se as colunas estão certas.');
    const soma = itens.reduce((a, x) => a + x.total, 0);
    if (comPreco && declarado && Math.abs(soma - declarado) > 1) avisos.push(`A soma dos itens (R$ ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) difere do total da planilha (R$ ${declarado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Confira as colunas e as linhas de título.`);
    else if (comPreco && declarado) avisos.push('Conferido: a soma dos itens bate com o total da planilha.');
  } else if (tipo === 'gastos') {
    linhas.forEach(l => {
      const valor = num(cel(l, 'valor')), desc = so(cel(l, 'descricao'));
      if (!valor || ehTotalGeral(desc) || ehTotalGeral(so(cel(l, 'fornecedor')))) return;
      itens.push({ etapa: so(cel(l, 'etapa')) || config.etapaPadrao || 'Sem etapa', descricao: desc, fornecedor: so(cel(l, 'fornecedor')), data: fmtData(cel(l, 'data')), valor: Math.round(valor * 100) / 100 });
    });
    const semData = itens.filter(x => !x.data).length;
    if (semData) avisos.push(`${semData} linha(s) sem data reconhecida.`);
  } else if (tipo === 'fornecedores') {
    linhas.forEach(l => {
      const nome = so(cel(l, 'nome'));
      if (!nome) return;
      const doc = digitos(cel(l, 'cnpj'));
      itens.push({ nome, cnpj: [11, 14].includes(doc.length) ? doc : '', especialidade: so(cel(l, 'especialidade')), cidade: so(cel(l, 'cidade')), telefone: so(cel(l, 'telefone')), email: so(cel(l, 'email')).toLowerCase(), contato: so(cel(l, 'contato')) });
    });
    const semCnpj = itens.filter(x => !x.cnpj).length;
    if (semCnpj) avisos.push(`${semCnpj} fornecedor(es) sem CNPJ válido; serão cadastrados pelo nome.`);
  }
  return { itens, avisos };
}

/* ---------- notas fiscais ---------- */
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, trimValues: true });
const lista = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

function analisarNotaXml(buffer) {
  let doc; try { doc = xml.parse(buffer.toString('utf8')); } catch { return null; }
  const inf = doc?.nfeProc?.NFe?.infNFe || doc?.NFe?.infNFe || doc?.enviNFe?.NFe?.infNFe;
  if (!inf) return null;
  const e = inf.emit || {}, t = inf.total?.ICMSTot || {}, ide = inf.ide || {};
  const chave = String(inf['@_Id'] || '').replace(/\D/g, '');
  const dups = lista(inf.cobr?.dup).map(d => ({ numero: so(d.nDup), vencimento: so(d.dVenc), valor: num(d.vDup) }));
  const emissao = so(ide.dhEmi || ide.dEmi).slice(0, 10);
  const itens = lista(inf.det).map(d => ({ item: so(d.prod?.xProd), unidade: so(d.prod?.uCom), qtd: num(d.prod?.qCom), valor_unit: num(d.prod?.vUnCom), total: num(d.prod?.vProd) }));
  return { origem: 'xml', chave, numero: so(ide.nNF), serie: so(ide.serie), emissao, fornecedor: so(e.xNome || e.xFant), cnpj: digitos(e.CNPJ || e.CPF), cidade: so(e.enderEmit?.xMun), telefone: so(e.enderEmit?.fone),
    valor: num(t.vNF), parcelas: dups.length ? dups : [], itens, natureza: so(ide.natOp) };
}

// dígito verificador da chave de acesso (módulo 11)
function chaveValida(c) {
  if (!/^\d{44}$/.test(c)) return false;
  let soma = 0, p = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * p; p = p === 9 ? 2 : p + 1; }
  const r = soma % 11, dv = r < 2 ? 0 : 11 - r;
  return dv === Number(c[43]);
}

async function analisarNotaPdf(buffer) {
  let texto = '';
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    texto = (await extractText(pdf, { mergePages: true })).text || '';
  } catch { return { origem: 'pdf', semTexto: true }; }
  const plano = texto.replace(/\s+/g, ' ');
  if (plano.replace(/\W/g, '').length < 40) return { origem: 'pdf', semTexto: true };
  const cand = [...plano.matchAll(/(?:\d[\s.]?){44}/g)].map(x => x[0].replace(/\D/g, '')).filter(chaveValida);
  const chave = cand[0] || '';
  const r = { origem: 'pdf', chave, numero: '', serie: '', emissao: '', fornecedor: '', cnpj: '', valor: 0, parcelas: [], itens: [], natureza: '' };
  if (chave) { r.cnpj = chave.slice(6, 20); r.serie = String(Number(chave.slice(22, 25))); r.numero = String(Number(chave.slice(25, 34))); }
  const v = plano.match(/VALOR\s+TOTAL\s+DA\s+NOTA\s*[:\-]?\s*(?:R\$)?\s*([\d.]+,\d{2})/i); if (v) r.valor = num(v[1]);
  const em = plano.match(/(?:DATA\s+(?:DA\s+)?EMISS[ÃA]O|EMISS[ÃA]O)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i); if (em) r.emissao = fmtData(em[1]);
  const ven = [...plano.matchAll(/(\d{2}\/\d{2}\/\d{4})\s*(?:R\$)?\s*([\d.]+,\d{2})/g)].filter(x => fmtData(x[1]) > (r.emissao || '0')).slice(0, 12);
  if (ven.length && r.valor) { const par = ven.map(x => ({ numero: '', vencimento: fmtData(x[1]), valor: num(x[2]) })); if (Math.abs(par.reduce((a, p) => a + p.valor, 0) - r.valor) < 0.02) r.parcelas = par; }
  return r;
}

// Ponto de entrada: decide o que o arquivo é
async function analisarArquivo(buffer, nome) {
  const ext = (String(nome).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  if (ext === 'xml') {
    const nota = analisarNotaXml(buffer);
    if (nota) return { tipo: 'nota_fiscal', confianca: 'alta', nota, aviso: [] };
    return { tipo: 'documento', confianca: 'baixa', aviso: ['XML não reconhecido como nota fiscal eletrônica (NF-e). Notas de serviço (NFS-e) de prefeituras variam por município e ainda não são lidas.'] };
  }
  if (ext === 'pdf') {
    const nota = await analisarNotaPdf(buffer);
    if (nota.semTexto) return { tipo: 'documento', confianca: 'baixa', aviso: ['Não consegui ler texto neste PDF (pode ser imagem ou escaneado). Ele será guardado em Documentos. Se tiver o XML da nota, ele é lido com exatidão.'] };
    if (nota.chave) return { tipo: 'nota_fiscal', confianca: nota.valor ? 'media' : 'baixa', nota, aviso: ['Dados lidos do PDF. Confira valor, vencimento e fornecedor; com o XML da nota a leitura é exata.'] };
    return { tipo: 'documento', confianca: 'baixa', aviso: ['PDF sem chave de acesso de nota fiscal. Será guardado em Documentos.'] };
  }
  if (['xlsx', 'xls', 'csv', 'ods'].includes(ext)) {
    try { return analisarPlanilha(buffer); } catch { return { tipo: 'documento', confianca: 'baixa', aviso: ['Não consegui abrir esta planilha.'] }; }
  }
  return { tipo: 'documento', confianca: 'baixa', aviso: ['Tipo de arquivo guardado só em Documentos.'] };
}

module.exports = { analisarArquivo, normalizarPlanilha, analisarNotaXml, analisarNotaPdf, chaveValida, ROTULO, TIPOS, ALIAS, num, norm, fmtData };
