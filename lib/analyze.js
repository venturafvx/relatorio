'use strict';
const { regionFor } = require('./regions');

class UserError extends Error {}

const ALIASES = {
  nivel: ['nivel', 'level', 'tipo', 'agregacao', 'abrangencia'],
  municipio: ['municipio', 'nm_municipio', 'cidade', 'nome_municipio'],
  zona: ['zona', 'nr_zona', 'zona_eleitoral'],
  bairro: ['bairro', 'nm_bairro'],
  local: ['local', 'local_votacao', 'local_de_votacao', 'nm_local_votacao', 'nm_local'],
  secao: ['secao', 'nr_secao', 'secao_eleitoral'],
  votos: ['votos', 'qt_votos', 'votos_candidato', 'qt_votos_nominais', 'votos_nominais'],
  validos: ['validos', 'votos_validos', 'qt_validos', 'total_validos', 'qt_votos_validos'],
  pct: ['pct_validos', 'perc_validos', 'percentual', 'percentual_validos', 'pct', '%_validos', '%_dos_validos', 'pct_votos_validos'],
  colocacao: ['colocacao', 'posicao', 'ranking', 'rank', 'classificacao'],
  regiao: ['regiao', 'regiao_governo', 'mesorregiao'],
};

const LEVELS = ['MUN', 'ZONA', 'BAIRRO', 'LOCAL', 'SECAO'];
const LEVEL_LABEL = { MUN: 'Municípios', ZONA: 'Zonas', BAIRRO: 'Bairros', LOCAL: 'Locais de votação', SECAO: 'Seções' };

function normHeader(h) {
  return String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[\s\-./]+/g, '_');
}

function mapLevel(v) {
  const s = normHeader(v);
  if (s.startsWith('mun') || s === 'cidade') return 'MUN';
  if (s.startsWith('zon')) return 'ZONA';
  if (s.startsWith('bai')) return 'BAIRRO';
  if (s.startsWith('loc')) return 'LOCAL';
  if (s.startsWith('sec') || s.startsWith('sess')) return 'SECAO';
  return null;
}

const toInt = (v) => {
  const d = String(v == null ? '' : v).replace(/[^\d]/g, '');
  return d === '' ? null : parseInt(d, 10);
};
const toDec = (v) => {
  let s = String(v == null ? '' : v).trim().replace(/[%\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const pad3 = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(3, '0') : s;
};
const clean = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');

// Converte a tabela do CSV em linhas normalizadas.
function rowsFromTable(table) {
  if (table.length < 2) throw new UserError('O arquivo CSV está vazio ou só tem o cabeçalho.');
  const header = table[0].map(normHeader);
  const idx = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) idx[key] = i;
  }
  const lido = 'Cabeçalho lido: ' + table[0].join(' | ');
  if (idx.votos == null) throw new UserError('Coluna "votos" não encontrada. ' + lido);
  if (idx.municipio == null) throw new UserError('Coluna "municipio" não encontrada. ' + lido);
  if (idx.nivel == null && idx.secao == null) {
    throw new UserError('Informe a coluna "nivel" (MUNICIPIO, ZONA, BAIRRO, LOCAL, SECAO) ou envie uma base por seção (com a coluna "secao"). ' + lido);
  }

  const pctHasSymbol = idx.pct != null && table.slice(1, 200).some((r) => String(r[idx.pct] || '').includes('%'));
  const rows = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const g = (k) => (idx[k] == null ? '' : r[idx[k]]);
    const lvl = idx.nivel != null ? mapLevel(g('nivel')) : 'SECAO';
    const votos = toInt(g('votos'));
    const mun = clean(g('municipio'));
    if (!lvl || votos == null || !mun) { skipped++; continue; }
    rows.push({
      lvl, mun,
      zona: pad3(g('zona')),
      bairro: clean(g('bairro')),
      local: clean(g('local')),
      secao: pad3(g('secao')),
      votos,
      validos: toInt(g('validos')),
      pct: toDec(g('pct')),
      col: toInt(g('colocacao')),
      regiao: clean(g('regiao')),
    });
  }
  if (!rows.length) throw new UserError('Nenhuma linha válida encontrada no CSV.');

  // Percentual em fração (0,1643) vira 16,43.
  if (!pctHasSymbol) {
    let max = 0;
    for (const r of rows) if (r.pct != null && r.pct > max) max = r.pct;
    if (max > 0 && max <= 1) for (const r of rows) if (r.pct != null) r.pct *= 100;
  }
  for (const r of rows) {
    if (r.pct == null && r.validos > 0) r.pct = (r.votos / r.validos) * 100;
  }
  return { rows, skipped };
}

// Níveis ausentes são agregados a partir do nível mais fino disponível (sem colocação).
function fillLevels(rows) {
  const by = { MUN: [], ZONA: [], BAIRRO: [], LOCAL: [], SECAO: [] };
  for (const r of rows) by[r.lvl].push(r);
  const derived = new Set();
  const source = by.SECAO.length ? by.SECAO : by.LOCAL.length ? by.LOCAL : by.BAIRRO.length ? by.BAIRRO : by.ZONA;

  const agg = (keyFn, pick) => {
    const m = new Map();
    for (const r of source) {
      const k = keyFn(r);
      if (k == null) continue;
      let a = m.get(k);
      if (!a) {
        a = { ...pick(r), votos: 0, validos: 0, okValidos: true, pct: null, col: null };
        m.set(k, a);
      }
      a.votos += r.votos;
      if (r.validos != null) a.validos += r.validos;
      else a.okValidos = false;
    }
    return [...m.values()].map(({ okValidos, ...a }) => {
      if (okValidos && a.validos > 0) a.pct = (a.votos / a.validos) * 100;
      else a.validos = null;
      return a;
    });
  };
  const base = (r) => ({ mun: r.mun, zona: '', bairro: '', local: '', secao: '', regiao: r.regiao });

  if (!by.MUN.length && source !== by.MUN) {
    by.MUN = agg((r) => r.mun, (r) => ({ ...base(r), lvl: 'MUN' }));
    derived.add('MUN');
  }
  const fine = source === by.SECAO || source === by.LOCAL;
  if (!by.ZONA.length && fine && source.some((r) => r.zona)) {
    by.ZONA = agg((r) => (r.zona ? r.mun + '|' + r.zona : null), (r) => ({ ...base(r), lvl: 'ZONA', zona: r.zona }));
    derived.add('ZONA');
  }
  if (!by.BAIRRO.length && fine && source.some((r) => r.bairro)) {
    by.BAIRRO = agg((r) => (r.bairro ? r.mun + '|' + r.bairro : null), (r) => ({ ...base(r), lvl: 'BAIRRO', bairro: r.bairro }));
    derived.add('BAIRRO');
  }
  if (!by.LOCAL.length && source === by.SECAO && source.some((r) => r.local)) {
    by.LOCAL = agg((r) => (r.local ? r.mun + '|' + r.zona + '|' + r.local : null),
      (r) => ({ ...base(r), lvl: 'LOCAL', zona: r.zona, bairro: r.bairro, local: r.local }));
    derived.add('LOCAL');
  }
  return { by, derived };
}

function countBy(arr, fn) {
  const m = new Map();
  for (const r of arr) { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

function analyze(rows, meta) {
  const { by, derived } = fillLevels(rows);
  const sortV = (a, b) => b.votos - a.votos || a.mun.localeCompare(b.mun, 'pt-BR');
  for (const l of LEVELS) by[l].sort(sortV);

  const total = by.MUN.reduce((s, r) => s + r.votos, 0);
  const zc = countBy(by.ZONA, (r) => r.mun);
  const lc = countBy(by.LOCAL, (r) => r.mun);
  const sc = countBy(by.SECAO, (r) => r.mun);
  const bc = countBy(by.BAIRRO, (r) => r.mun);

  const muns = by.MUN.map((m) => ({
    ...m,
    share: total ? (m.votos / total) * 100 : 0,
    zonas: zc.get(m.mun) || 0,
    locais: lc.get(m.mun) || 0,
    secoes: sc.get(m.mun) || 0,
    bairros: bc.get(m.mun) || 0,
    regiao: m.regiao || regionFor(meta.uf, m.mun),
  }));
  const top = muns[0] || null;

  // Regiões só são usadas se cobrirem pelo menos 90% dos votos.
  const regMap = new Map();
  let covered = 0;
  for (const m of muns) {
    if (!m.regiao) continue;
    covered += m.votos;
    const r = regMap.get(m.regiao) || { name: m.regiao, votos: 0, n: 0 };
    r.votos += m.votos; r.n++;
    regMap.set(m.regiao, r);
  }
  let regions = [];
  if (total && covered / total >= 0.9) {
    regions = [...regMap.values()].map((r) => ({ ...r, share: (r.votos / total) * 100 })).sort((a, b) => b.votos - a.votos);
  }
  const topRegion = top && top.regiao ? regions.find((r) => r.name === top.regiao) || null : null;

  const validation = LEVELS.filter((l) => l !== 'MUN' && by[l].length).map((l) => {
    const sum = by[l].reduce((s, r) => s + r.votos, 0);
    return { level: l, label: LEVEL_LABEL[l], rows: by[l].length, sum, ok: sum === total, derived: derived.has(l) };
  });

  const validosEstado = Number(meta.validosEstado) || null;
  const sumTop = (n) => muns.slice(0, n).reduce((s, m) => s + m.votos, 0);

  return {
    by, derived, total, muns, top, regions, topRegion, validation,
    pctEstado: validosEstado ? (total / validosEstado) * 100 : null,
    hasCol: rows.some((r) => r.col != null),
    hasPct: rows.some((r) => r.pct != null),
    sumTop,
    totalRows: LEVELS.reduce((s, l) => s + by[l].length, 0),
  };
}

module.exports = { rowsFromTable, analyze, UserError, LEVELS, LEVEL_LABEL };
