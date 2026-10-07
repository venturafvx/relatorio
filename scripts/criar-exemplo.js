'use strict';
// Gera a base fictícia do "Candidato Exemplo" (mesmos números do PDF demonstrativo)
// e publica o relatório-modelo em /exemplo.  Uso: node scripts/criar-exemplo.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const mt = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (mt && process.env[mt[1]] === undefined) process.env[mt[1]] = mt[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

const store = require('../lib/store');
const { parseCSV } = require('../lib/csv');
const { rowsFromTable } = require('../lib/analyze');

// ---------- aleatório determinístico ----------
let seed = 99123;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// Divide `total` em `n` inteiros >= 1 e <= cap, com distribuição desigual (maiores primeiro).
function split(total, n, cap) {
  n = Math.max(1, Math.min(n, total));
  if (n * cap < total) n = Math.ceil(total / cap);
  const w = Array.from({ length: n }, () => 0.15 + rnd() ** 2);
  const sw = w.reduce((s, x) => s + x, 0);
  const out = w.map((x) => Math.max(1, Math.min(cap, Math.floor(((total - n) * x) / sw) + 1)));
  let diff = total - out.reduce((s, x) => s + x, 0);
  let guard = 0;
  while (diff !== 0 && guard++ < 1e6) {
    const i = Math.floor(rnd() * n);
    if (diff > 0 && out[i] < cap) { out[i]++; diff--; }
    else if (diff < 0 && out[i] > 1) { out[i]--; diff++; }
  }
  return out.sort((a, b) => b - a);
}

// ---------- dados do PDF ----------
// [município, votos, % válidos, colocação, zonas, locais, seções]
const MUNS = [
  ['Campos dos Goytacazes', 24860, 9.49, 1, 4, 300, 956], ['São João da Barra', 2140, 8.73, 2, 1, 56, 82],
  ['São Francisco de Itabapoana', 1985, 6.99, 3, 1, 52, 76], ['Macaé', 1630, 1.25, 14, 2, 42, 62],
  ['Itaperuna', 1410, 2.44, 6, 1, 37, 54], ['Rio de Janeiro', 1290, 0.04, 212, 49, 49, 49],
  ['Quissamã', 980, 6.95, 3, 1, 25, 37], ['Cardoso Moreira', 760, 7.92, 2, 1, 20, 29],
  ['São Fidélis', 705, 3.08, 5, 1, 18, 27], ['Niterói', 640, 0.22, 58, 4, 16, 24],
  ['Bom Jesus do Itabapoana', 590, 2.68, 6, 1, 15, 22], ['Italva', 455, 5.23, 4, 1, 11, 17],
  ['Conceição de Macabu', 420, 3.33, 7, 1, 11, 16], ['São Gonçalo', 395, 0.09, 96, 7, 10, 15],
  ['Rio das Ostras', 360, 0.48, 33, 1, 9, 13], ['Cambuci', 330, 3.51, 5, 1, 8, 12],
  ['Miracema', 300, 1.91, 9, 1, 7, 11], ['Cabo Frio', 265, 0.2, 71, 2, 6, 10],
  ['Duque de Caxias', 240, 0.05, 150, 7, 7, 9], ['Nova Iguaçu', 210, 0.04, 181, 6, 6, 8],
  ['Petrópolis', 180, 0.1, 78, 1, 4, 6], ['Araruama', 151, 1.26, 206, 1, 3, 5],
  ['Itaboraí', 126, 0.21, 58, 1, 3, 4], ['Belford Roxo', 105, 1.17, 64, 1, 2, 4],
  ['Carapebus', 88, 0.05, 189, 1, 2, 3], ['Santo Antônio de Pádua', 73, 0.12, 169, 1, 1, 2],
  ['Laje do Muriaé', 61, 0.24, 49, 1, 1, 2], ['Natividade', 51, 0.08, 151, 1, 1, 1],
  ['Porciúncula', 42, 0.35, 57, 1, 1, 1], ['Varre-Sai', 35, 0.14, 63, 1, 1, 1],
  ['São João de Meriti', 29, 0.32, 148, 1, 1, 1], ['Maricá', 24, 0.04, 251, 1, 1, 1],
  ['Teresópolis', 20, 0.22, 71, 1, 1, 1], ['Nova Friburgo', 16, 0.06, 201, 1, 1, 1],
  ['São Pedro da Aldeia', 13, 0.14, 55, 1, 1, 1], ['Casimiro de Abreu', 10, 0.11, 189, 1, 1, 1],
  ['Saquarema', 8, 0.07, 52, 1, 1, 1], ['Aperibé', 6, 0.02, 51, 1, 1, 1], ['Itaocara', 5, 0.06, 259, 1, 1, 1],
  ['São José de Ubá', 4, 0.02, 114, 1, 1, 1], ['Resende', 3, 0.03, 76, 1, 1, 1], ['Volta Redonda', 3, 0.03, 70, 1, 1, 1],
  ['Magé', 3, 0.03, 118, 1, 1, 1], ['Mesquita', 3, 0.03, 248, 1, 1, 1], ['Nilópolis', 3, 0.01, 66, 1, 1, 1],
  ['Angra dos Reis', 3, 0.03, 186, 1, 1, 1], ['Barra Mansa', 3, 0.01, 135, 1, 1, 1], ['Três Rios', 3, 0.01, 180, 1, 1, 1],
];

const ZONAS = {
  'Campos dos Goytacazes': [['076', 6862, 10.58, 1], ['075', 6334, 9.57, 1], ['129', 6024, 8.82, 1], ['098', 5640, 7.78, 1]],
  'Macaé': [['254', 943, 1.44, 12], ['109', 687, 1.04, 14]],
  'Niterói': [['144', 209, 0.32, 55], ['071', 174, 0.27, 43], ['072', 137, 0.19, 68], ['199', 120, 0.18, 52]],
  'São Gonçalo': [['132', 81, 0.11, 109], ['135', 75, 0.11, 100], ['068', 62, 0.1, 92], ['036', 57, 0.1, 118], ['087', 48, 0.07, 121], ['133', 37, 0.06, 102], ['069', 35, 0.06, 79]],
  'Cabo Frio': [['256', 161, 0.24, 88], ['096', 104, 0.16, 56]],
  'Duque de Caxias': [['200', 51, 0.08, 139], ['126', 41, 0.06, 112], ['078', 36, 0.05, 164], ['128', 34, 0.04, 179], ['103', 31, 0.04, 130], ['127', 26, 0.03, 153], ['079', 21, 0.03, 133]],
  'Nova Iguaçu': [['158', 44, 0.06, 230], ['156', 42, 0.05, 187], ['157', 38, 0.04, 169], ['084', 35, 0.04, 170], ['027', 29, 0.03, 233], ['159', 22, 0.03, 138]],
};

const BAIRROS = {
  'Campos dos Goytacazes': [['Goitacazes', 3941, 18.58, 1], ['Parque Guarus', 2539, 16.14, 1], ['Centro', 2423, 8.94, 2], ['Jardim Carioca', 2331, 14.34, 1], ['Parque Califórnia', 863, 5.7, 4], ['Parque Leopoldina', 843, 12.39, 1], ['Ururaí', 758, 18.49, 1], ['Parque Aurora', 755, 9.84, 2], ['Travessão', 681, 7.76, 5], ['Parque Eldorado', 658, 16.47, 1], ['Pelinca', 646, 9.43, 2], ['Parque São Caetano', 644, 7.76, 3], ['Morro do Coco', 612, 16.89, 1], ['Goytacazes', 587, 17.08, 1], ['Santo Eduardo', 571, 15.86, 1], ['Tocos', 551, 7.82, 5], ['Dores de Macabu', 546, 11.99, 1], ['Parque Tamandaré', 545, 15.72, 1], ['Parque Jockey Club', 542, 19.77, 1], ['Parque Santo Amaro', 487, 16.64, 1], ['Lapa', 480, 11.67, 1], ['Parque Rosário', 458, 7.3, 5], ['Vila da Rainha', 420, 19.25, 1], ['Murundu', 419, 11.27, 1], ['Ibitioca', 400, 18.94, 1], ['Mussurepe', 392, 19.74, 1], ['Parque Prazeres', 388, 19.22, 1], ['São Sebastião', 380, 9.98, 2]],
  'São João da Barra': [['CENTRO', 436, 10.69, 2], ['ATAFONA', 435, 12.58, 2], ['GRUSSAÍ', 423, 10.94, 2], ['BARCELOS', 418, 5.98, 2]],
  'São Francisco de Itabapoana': [['CENTRO', 457, 5.44, 3], ['GARGAÚ', 413, 6.52, 3], ['BARRA DE ITABAPOANA', 403, 10.98, 2], ['PRAÇA JOÃO PESSOA', 315, 7.0, 4]],
  'Macaé': [['CENTRO', 505, 1.88, 18], ['PARQUE AEROPORTO', 275, 0.93, 18], ['BARRA DE MACAÉ', 267, 1.98, 16], ['AROEIRAS', 257, 1.19, 15]],
  'Itaperuna': [['CENTRO', 440, 2.75, 8], ['CEHAB', 344, 2.52, 8], ['NITERÓI', 190, 3.48, 4], ['CIDADE NOVA', 154, 2.08, 5]],
  'Quissamã': [['CENTRO', 329, 7.08, 2], ['ALTO ALEGRE', 230, 10.5, 2], ['CAXIAS', 225, 7.35, 3]],
};

// [local, votos, % válidos, colocação, bairro]
const LOCAIS = {
  'Campos dos Goytacazes': [
    ['E.E. PROFESSORA ANA MARIA DE SOUZA', 1032, 15.59, 1, 'Centro'], ['CIEP 101 – BRIZOLÃO EXEMPLO', 1021, 18.41, 1, 'Goitacazes'],
    ['COLÉGIO ESTADUAL MODELO', 934, 20.58, 1, 'Goitacazes'], ['E.M. JOSÉ ALVES PEREIRA', 922, 13.9, 1, 'Parque Guarus'],
    ['ESCOLA TÉCNICA MUNICIPAL CENTRAL', 912, 16.31, 1, 'Parque Guarus'], ['C.E. DOUTOR PAULO RIBEIRO', 873, 14.79, 1, 'Goitacazes'],
    ['E.M. MARIA DA PENHA LIMA', 737, 14.88, 1, 'Parque Califórnia'], ['INSTITUTO DE EDUCAÇÃO NORTE', 734, 17.45, 1, 'Parque Leopoldina'],
    ['EMEI CRIANÇA FELIZ', 733, 14.03, 1, 'Parque Aurora'], ['C.M. PREFEITO ANTÔNIO CARLOS', 713, 15.18, 1, 'Jardim Carioca'],
    ['E.E. VEREADOR JOÃO BATISTA', 706, 14.4, 1, 'Centro'], ['CIEP 245 – PARQUE GUARUS', 702, 20.99, 1, 'Parque Guarus'],
    ['COLÉGIO MUNICIPAL ESPERANÇA', 693, 17.55, 1, 'Jardim Carioca'], ['E.M. SÃO JOSÉ OPERÁRIO', 688, 20.07, 1, 'Goitacazes'],
    ['ESCOLA ESTADUAL SANTA RITA', 665, 21.0, 1, 'Jardim Carioca'], ['C.E. PROFESSOR LUIZ COSTA', 638, 11.29, 2, 'Parque Eldorado'],
    ['E.M. NOSSA SENHORA DA PAZ', 622, 15.56, 1, 'Pelinca'], ['UNIDADE ESCOLAR DO CENTRO', 543, 21.02, 1, 'Centro'],
    ['E.M. PROFESSORA HELENA DIAS', 503, 19.55, 1, 'Parque São Caetano'], ['COLÉGIO ESTADUAL DO LITORAL', 480, 9.54, 2, 'Morro do Coco'],
    ['E.M. RURAL DE TRAVESSÃO', 426, 9.32, 2, 'Travessão'], ['C.M. GOITACÁ', 417, 13.89, 1, 'Goitacazes'],
    ['EMEI VOVÓ LUZIA', 362, 8.62, 3, 'Goytacazes'], ['E.E. MARECHAL RONDON', 290, 11.02, 2, 'Santo Eduardo'],
    ['CIEP 302 – URURAÍ', 278, 8.63, 3, 'Ururaí'],
  ],
  'São João da Barra': [['C.E. PRAIA DE ATAFONA', 405, 11.78, 2, 'ATAFONA'], ['E.M. CENTRO HISTÓRICO', 311, 12.39, 2, 'CENTRO']],
  'Macaé': [['E.M. LITORAL NORTE', 338, 1.87, 17, 'CENTRO']],
  'São Francisco de Itabapoana': [['E.M. BARRA DO RIO', 293, 9.1, 3, 'BARRA DE ITABAPOANA']],
  'Itaperuna': [['C.E. VALE DO MURIAÉ', 224, 3.58, 5, 'CENTRO']],
  'São Fidélis': [['E.M. PONTE VELHA', 176, 2.5, 5, 'CENTRO']],
  'Quissamã': [['E.M. CANAL CAMPOS–MACAÉ', 146, 7.66, 3, 'CENTRO']],
  'Cardoso Moreira': [['C.E. RIBEIRÃO', 137, 7.42, 1, 'CENTRO']],
};

// [zona, seção, local, votos, % válidos, colocação] — as 30 maiores, todas em Campos
const SECOES = [
  ['098', '009', 'CIEP 101 – BRIZOLÃO EXEMPLO', 116, 47.13, 1], ['076', '114', 'ESCOLA TÉCNICA MUNICIPAL CENTRAL', 114, 48.51, 1],
  ['076', '233', 'ESCOLA TÉCNICA MUNICIPAL CENTRAL', 113, 40.1, 1], ['076', '214', 'C.E. DOUTOR PAULO RIBEIRO', 113, 39.01, 1],
  ['129', '270', 'C.M. PREFEITO ANTÔNIO CARLOS', 111, 46.69, 1], ['075', '135', 'CIEP 101 – BRIZOLÃO EXEMPLO', 104, 36.09, 1],
  ['076', '160', 'COLÉGIO ESTADUAL MODELO', 102, 42.13, 1], ['129', '149', 'EMEI CRIANÇA FELIZ', 99, 35.93, 1],
  ['098', '139', 'EMEI CRIANÇA FELIZ', 97, 35.88, 1], ['129', '019', 'E.E. PROFESSORA ANA MARIA DE SOUZA', 90, 31.07, 1],
  ['076', '283', 'E.E. PROFESSORA ANA MARIA DE SOUZA', 89, 32.48, 1], ['075', '229', 'EMEI CRIANÇA FELIZ', 85, 32.88, 1],
  ['076', '222', 'E.E. VEREADOR JOÃO BATISTA', 83, 29.73, 1], ['098', '202', 'EMEI CRIANÇA FELIZ', 82, 29.28, 1],
  ['129', '118', 'CIEP 245 – PARQUE GUARUS', 82, 33.76, 1], ['129', '362', 'E.M. JOSÉ ALVES PEREIRA', 81, 28.94, 1],
  ['075', '028', 'E.M. MARIA DA PENHA LIMA', 81, 27.99, 1], ['075', '380', 'E.E. PROFESSORA ANA MARIA DE SOUZA', 77, 32.87, 1],
  ['129', '044', 'E.M. MARIA DA PENHA LIMA', 71, 29.61, 1], ['098', '145', 'EMEI CRIANÇA FELIZ', 71, 26.27, 1],
  ['075', '236', 'CIEP 245 – PARQUE GUARUS', 67, 27.06, 1], ['075', '002', 'COLÉGIO ESTADUAL MODELO', 64, 26.0, 1],
  ['129', '281', 'C.E. DOUTOR PAULO RIBEIRO', 62, 21.55, 1], ['129', '159', 'E.M. JOSÉ ALVES PEREIRA', 61, 26.29, 1],
  ['075', '172', 'C.E. DOUTOR PAULO RIBEIRO', 59, 24.48, 1], ['098', '258', 'CIEP 101 – BRIZOLÃO EXEMPLO', 58, 22.44, 1],
  ['075', '003', 'E.M. JOSÉ ALVES PEREIRA', 56, 21.51, 1], ['076', '074', 'ESCOLA TÉCNICA MUNICIPAL CENTRAL', 55, 19.71, 1],
  ['098', '012', 'C.M. PREFEITO ANTÔNIO CARLOS', 53, 22.8, 1], ['129', '414', 'ESCOLA TÉCNICA MUNICIPAL CENTRAL', 50, 18.67, 1],
];

const RIO_BAIRROS = ['CAMPO GRANDE', 'BANGU', 'TIJUCA', 'COPACABANA', 'MADUREIRA', 'IRAJÁ', 'SANTA CRUZ', 'REALENGO', 'BOTAFOGO', 'MÉIER', 'JACAREPAGUÁ', 'PAVUNA', 'PENHA', 'BARRA DA TIJUCA', 'RECREIO', 'CENTRO', 'GRAJAÚ', 'VILA ISABEL', 'LEBLON', 'IPANEMA', 'FLAMENGO', 'LARANJEIRAS', 'MARACANÃ', 'ENGENHO NOVO', 'CASCADURA', 'BENFICA', 'BONSUCESSO', 'RAMOS', 'OLARIA', 'ILHA DO GOVERNADOR', 'TAQUARA', 'FREGUESIA', 'ANCHIETA', 'GUADALUPE', 'ROCHA MIRANDA', 'VAZ LOBO', 'PIEDADE', 'ABOLIÇÃO', 'PADRE MIGUEL', 'SENADOR CAMARÁ'];
const PRE = ['VILA', 'JARDIM', 'PARQUE', 'ALTO', 'NOVA'];
const SUF = ['SÃO JOSÉ', 'SANTA ROSA', 'AMÉRICA', 'BOA VISTA', 'ESPERANÇA', 'SANTO ANTÔNIO', 'SÃO JORGE', 'DAS FLORES', 'BELA VISTA', 'SÃO BENEDITO', 'DAS ÁGUAS', 'PRIMAVERA', 'DO SOL', 'SANTA CLARA', 'DOS PINHEIROS'];
const TIPOS = ['E.M.', 'C.E.', 'E.E.', 'EMEI', 'COLÉGIO MUNICIPAL', 'ESCOLA ESTADUAL', 'C.M.'];
const PATRONOS = ['JOSÉ DA SILVA', 'MARIA DAS GRAÇAS', 'ANTÔNIO PEREIRA', 'PROFª LÚCIA MOTA', 'DR. CARLOS NUNES', 'SÃO FRANCISCO', 'PADRE ANCHIETA', 'PROF. JOÃO ROCHA', 'DONA ROSA', 'TIRADENTES', 'MONTEIRO LOBATO', 'CECÍLIA MEIRELES', 'RUI BARBOSA', 'PROFª ALICE SOUZA', 'NOSSA SENHORA DAS DORES', 'VEREADOR PAULO MELO', 'MACHADO DE ASSIS', 'SANTA TEREZINHA', 'PROF. RAUL CAMPOS', 'DR. HÉLIO FARIA'];

function colFor(munCol, munPct, p) {
  const c = Math.round(munCol * Math.pow(munPct / Math.max(p, 0.005), 0.7));
  return Math.max(1, Math.min(600, c + (munCol > 5 ? randInt(-2, 2) : 0)));
}

// ---------- geração ----------
const out = [];
const zonePool = [];
{
  const used = new Set(Object.values(ZONAS).flat().map((z) => z[0]));
  for (let i = 1; i <= 260; i++) { const z = String(i).padStart(3, '0'); if (!used.has(z)) zonePool.push(z); }
}
const rioZones = zonePool.splice(0, 49);
const singleZones = zonePool.filter((z) => Number(z) >= 160).concat(zonePool.filter((z) => Number(z) < 160));

for (const [mun, votos, mPct, mCol, nZonas, nLocais, nSecoes] of MUNS) {
  const isCampos = mun === 'Campos dos Goytacazes';
  const pinned = (LOCAIS[mun] || []).map(([nome, v, pct, col, bairro]) => ({ nome, v, pct, col, bairro }));
  const capLocal = isCampos ? 250 : Math.min(130, ...pinned.map((l) => l.v - 1));

  // Bairros
  const expl = (BAIRROS[mun] || []).map(([nome, v, pct, col]) => ({ nome, v, pct, col }));
  let bairros = expl.slice();
  const nb = isCampos ? expl.length : Math.max(expl.length + 1, Math.min(nLocais, Math.round(nLocais * 0.8)));
  const remB = votos - expl.reduce((s, b) => s + b.v, 0);
  if (remB > 0) {
    const cap = expl.length ? Math.min(...expl.map((b) => b.v)) - 1 : votos;
    const vals = split(remB, Math.max(1, nb - expl.length), cap);
    const names = new Set(expl.map((b) => b.nome.toUpperCase()));
    let k = 0;
    const nextName = () => {
      for (;;) {
        const n = mun === 'Rio de Janeiro' ? RIO_BAIRROS[k] || `${PRE[k % 5]} ${SUF[Math.floor(k / 5) % SUF.length]}`
          : k === 0 ? 'CENTRO' : `${PRE[k % 5]} ${SUF[Math.floor(k / 5) % SUF.length]}`;
        k++;
        if (!names.has(n)) { names.add(n); return n; }
      }
    };
    for (const v of vals) bairros.push({ nome: nextName(), v, pct: null, col: null });
  }
  // Garante espaço para os locais fixados
  for (const l of pinned) {
    let b = bairros.find((x) => x.nome === l.bairro);
    if (!b) { b = bairros[expl.length] || bairros[0]; l.bairro = b.nome; }
    b.used = (b.used || 0) + l.v;
    if (b.used >= b.v) {
      const need = b.used - b.v + 1;
      const donor = bairros.filter((x) => x !== b && x.pct == null && x.v - (x.used || 0) > need + 1).sort((a, c) => c.v - a.v)[0];
      donor.v -= need; b.v += need;
    }
  }

  // Locais por bairro
  const remLocais = nLocais - pinned.length;
  const remVotes = bairros.map((b) => b.v - (b.used || 0));
  const totalRem = remVotes.reduce((s, x) => s + x, 0);
  const slots = remVotes.map((r) => (r > 0 ? Math.max(1, Math.ceil(r / capLocal)) : 0));
  let extra = remLocais - slots.reduce((s, x) => s + x, 0);
  while (extra > 0) {
    let best = -1, bestScore = -1;
    slots.forEach((s, i) => { const sc = remVotes[i] / (s + 1); if (remVotes[i] > s && sc > bestScore) { bestScore = sc; best = i; } });
    if (best < 0) break;
    slots[best]++; extra--;
  }
  const locais = pinned.map((l) => ({ ...l }));
  const typeNames = new Set(locais.map((l) => l.nome));
  let li = 0;
  bairros.forEach((b, i) => {
    if (!slots[i]) return;
    for (const v of split(remVotes[i], slots[i], capLocal)) {
      let nome;
      do {
        const t = TIPOS[li % TIPOS.length];
        const p = PATRONOS[Math.floor(li / TIPOS.length + randInt(0, 3)) % PATRONOS.length];
        nome = t === 'EMEI' && li % 3 === 0 ? `CIEP ${100 + li} – ${b.nome.toUpperCase()}` : `${t} ${p}`;
        li++;
      } while (typeNames.has(nome));
      typeNames.add(nome);
      locais.push({ nome, v, pct: null, col: null, bairro: b.nome });
    }
  });
  if (totalRem !== locais.filter((l) => l.pct == null).reduce((s, l) => s + l.v, 0)) throw new Error('soma de locais ' + mun);

  // Seções por local
  const fixed = isCampos ? SECOES.map(([zona, secao, local, v, pct, col]) => ({ zona, secao, local, v, pct, col })) : [];
  const secoes = [];
  for (const l of locais) {
    const fx = fixed.filter((s) => s.local === l.nome);
    const rem = l.v - fx.reduce((s, x) => s + x.v, 0);
    l.secs = fx.map((s) => ({ ...s, bairro: l.bairro }));
    l.rem = rem;
  }
  let need = locais.reduce((s, l) => s + l.secs.length + (l.rem > 0 ? Math.ceil(l.rem / 49) : 0), 0);
  for (const l of locais) l.n = l.rem > 0 ? Math.ceil(l.rem / 49) : 0;
  const order = locais.slice().sort((a, b) => b.rem / (b.n + 1) - a.rem / (a.n + 1));
  let oi = 0;
  while (need < nSecoes && order.some((l) => l.rem > l.n)) {
    const l = order[oi++ % order.length];
    if (l.rem > l.n) { l.n++; need++; }
  }
  for (const l of locais) {
    if (l.rem > 0) for (const v of split(l.rem, l.n, 49)) l.secs.push({ zona: null, secao: null, local: l.nome, v, pct: null, col: null, bairro: l.bairro });
    secoes.push(...l.secs);
  }

  // Zonas: metas exatas, seções distribuídas por local
  let zonas = (ZONAS[mun] || []).map(([z, v, pct, col]) => ({ z, v, pct, col }));
  if (!zonas.length) {
    if (mun === 'Rio de Janeiro') zonas = split(votos, nZonas, votos).map((v, i) => ({ z: rioZones[i], v, pct: null, col: null }));
    else zonas = [{ z: singleZones.shift(), v: votos, pct: mPct, col: mCol }];
  }
  const cap = new Map(zonas.map((z) => [z.z, z.v]));
  for (const s of secoes) if (s.zona) cap.set(s.zona, cap.get(s.zona) - s.v);
  const groups = locais.map((l) => ({ l, ss: l.secs.filter((s) => !s.zona) })).filter((g) => g.ss.length)
    .sort((a, b) => b.ss.reduce((s, x) => s + x.v, 0) - a.ss.reduce((s, x) => s + x.v, 0));
  const leftovers = [];
  for (const g of groups) {
    const sum = g.ss.reduce((s, x) => s + x.v, 0);
    const pref = g.l.secs.find((s) => s.zona);
    let z = pref && cap.get(pref.zona) >= sum ? pref.zona : [...cap.entries()].filter(([, c]) => c >= sum).sort((a, b) => b[1] - a[1])[0];
    if (Array.isArray(z)) z = z[0];
    if (z) { for (const s of g.ss) s.zona = z; cap.set(z, cap.get(z) - sum); continue; }
    for (const s of g.ss.sort((a, b) => b.v - a.v)) {
      const fit = [...cap.entries()].filter(([, c]) => c >= s.v).sort((a, b) => b[1] - a[1])[0];
      if (fit) { s.zona = fit[0]; cap.set(fit[0], fit[1] - s.v); } else leftovers.push(s);
    }
  }
  for (const s of leftovers) {
    let v = s.v;
    let first = true;
    for (const [z, c] of [...cap.entries()].filter(([, c]) => c > 0)) {
      if (v <= 0) break;
      const take = Math.min(c, v);
      if (first) { s.zona = z; s.v = take; first = false; }
      else secoes.push({ ...s, zona: z, v: take });
      cap.set(z, c - take); v -= take;
    }
  }

  // Numeração das seções por zona
  const usedNum = new Map();
  for (const s of secoes) if (s.secao) { if (!usedNum.has(s.zona)) usedNum.set(s.zona, new Set()); usedNum.get(s.zona).add(s.secao); }
  const counters = new Map();
  for (const s of secoes) {
    if (s.secao) continue;
    if (!usedNum.has(s.zona)) usedNum.set(s.zona, new Set());
    let c = counters.get(s.zona) || randInt(1, 30);
    while (usedNum.get(s.zona).has(String(c).padStart(3, '0'))) c += 1;
    s.secao = String(c).padStart(3, '0');
    usedNum.get(s.zona).add(s.secao);
    counters.set(s.zona, c + randInt(1, 4));
  }

  // Percentuais e colocações
  for (const s of secoes) {
    if (s.pct != null) { s.validos = Math.round(s.v / (s.pct / 100)); continue; }
    const target = Math.max(mPct * (0.5 + rnd() * 1.6), 0.3);
    s.validos = Math.max(150, Math.min(420, Math.round(s.v / (target / 100))));
    if (s.validos < s.v * 2) s.validos = s.v * 2 + randInt(20, 80);
    s.pct = (s.v / s.validos) * 100;
    s.col = colFor(mCol, mPct, s.pct);
  }
  const agg = (pred) => { const ss = secoes.filter(pred); return { v: ss.reduce((a, s) => a + s.v, 0), val: ss.reduce((a, s) => a + s.validos, 0) }; };
  for (const l of locais) {
    if (l.pct == null) { const a = agg((s) => s.local === l.nome); l.pct = (a.v / a.val) * 100; l.col = colFor(mCol, mPct, l.pct); }
    const zs = new Map();
    for (const s of secoes.filter((s) => s.local === l.nome)) zs.set(s.zona, (zs.get(s.zona) || 0) + s.v);
    l.zona = [...zs.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  for (const b of bairros) {
    if (b.pct == null) { const a = agg((s) => s.bairro === b.nome); b.pct = a.val ? (a.v / a.val) * 100 * 0.6 : mPct; b.col = colFor(mCol, mPct, b.pct); }
  }
  for (const z of zonas) {
    if (z.pct == null) { z.pct = mPct * (0.5 + rnd()); z.col = colFor(mCol, mPct, z.pct); }
  }

  const f = (p) => p.toFixed(2).replace('.', ',') + '%';
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  out.push(['MUNICIPIO', mun, '', '', '', '', votos, f(mPct), mCol]);
  for (const z of zonas) out.push(['ZONA', mun, z.z, '', '', '', z.v, f(z.pct), z.col]);
  for (const b of bairros) out.push(['BAIRRO', mun, '', b.nome, '', '', b.v, f(b.pct), b.col]);
  for (const l of locais.sort((a, b) => b.v - a.v)) out.push(['LOCAL', mun, l.zona, l.bairro, q(l.nome), '', l.v, f(l.pct), l.col]);
  for (const s of secoes.sort((a, b) => b.v - a.v)) out.push(['SECAO', mun, s.zona, s.bairro, q(s.local), s.secao, s.v, f(s.pct), s.col]);
}

const csv = ['nivel;municipio;zona;bairro;local;secao;votos;pct_validos;colocacao', ...out.map((r) => r.join(';'))].join('\n') + '\n';
const csvFile = path.join(ROOT, 'exemplo', 'exemplo_candidato_99123.csv');
fs.writeFileSync(csvFile, '﻿' + csv);

// ---------- publica o modelo ----------
const { rows } = rowsFromTable(parseCSV(csv));
const ID = 'modelo-candidato-exemplo-99123';
const prev = store.get(ID);
const now = new Date().toISOString();
const report = {
  id: ID,
  createdAt: prev ? prev.createdAt : now,
  updatedAt: now,
  stats: prev ? prev.stats : { views: 0, lastView: null },
  meta: {
    nome: 'Candidato Exemplo', partido: 'PDX', numero: '99123', cargo: 'Deputado Estadual', uf: 'RJ', genero: 'M',
    ano: '2026', turno: '1º turno', dataDados: '', colocacaoEstado: '58', situacao: 'Eleito por média',
    aptos: '12842517', comparecimento: '9845867', validosEstado: '8820111', abstencao: '2982715',
    cliente: 'Modelo de prospecção (dados fictícios)', assinatura: 'Fabio Ventura – agenciafvx.com',
  },
  texts: {
    frase: 'Liderança absoluta na base — 1º lugar em Campos, com 24.860 votos — e um eixo regional consolidado no Norte e Noroeste Fluminense, que juntos somam 90,0% da votação.',
    resumo: 'Candidato Exemplo (PDX, 99123) teve **41.036 votos** para deputado estadual no RJ (1º turno de 2026), **0,47% dos válidos**, **58º lugar** no estado, e foi **eleito por média**. A votação é concentrada na base: **Campos dos Goytacazes deu 60,6%** dos votos, onde ele foi o **mais votado** (9,49% dos válidos).',
    leituraHeadline: 'Perfil de **liderança regional consolidada**: 1º lugar e 9,49% na base, com o Norte e Noroeste Fluminense somando 90,0% da votação.',
    leitura: [
      'Campos é o ativo principal\n1º lugar nas 4 zonas e em 19 bairros. A base garante cerca de 60,6% da votação e precisa ser mantida com presença e entrega.',
      'Entorno responde bem\nTop 3 em São João da Barra, São Francisco de Itabapoana, Quissamã e Cardoso Moreira. É o eixo natural de expansão, com baixo custo de campanha.',
      'Noroeste é a segunda frente\n4.067 votos (9,9%) em Itaperuna, São Fidélis, Bom Jesus e vizinhos, com colocações entre 4º e 9º: espaço claro para crescer.',
      'Macaé é a maior oportunidade fora de casa\nColégio eleitoral grande, vizinho da base, onde o candidato ainda está em 14º. Pequenos ganhos percentuais rendem muitos votos.',
      'Região Metropolitana é voto disperso\n3.068 votos espalhados por mais de 10 municípios, nenhum acima de 0,1% dos válidos. Funciona como rede pessoal, não como base territorial.',
      'Risco de concentração\n60,6% dos votos vêm de uma cidade. Para subir de colocação, a estratégia é ampliar a presença no Noroeste e em Macaé.',
    ].join('\n\n'),
  },
  settings: { ativo: true, permitirCsv: true, demo: true },
};
for (const other of store.list()) {
  if (other.id !== ID && other.settings && other.settings.demo) { other.settings.demo = false; store.save(other); }
}
store.save(report, rows, csv);

const count = (lvl) => out.filter((r) => r[0] === lvl).length;
const sum = (lvl) => out.filter((r) => r[0] === lvl).reduce((s, r) => s + Number(r[6]), 0);
console.log(`Base gerada: ${csvFile}`);
console.log(['MUNICIPIO', 'ZONA', 'BAIRRO', 'LOCAL', 'SECAO'].map((l) => `${l}: ${count(l)} linhas, ${sum(l)} votos`).join('\n'));
console.log(`Modelo publicado em /exemplo (id ${ID}).`);
