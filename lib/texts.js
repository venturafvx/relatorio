'use strict';
const { fmtInt, fmtPct, listPt } = require('./format');

// Pronomes conforme o gênero informado no cadastro.
function g(meta) {
  const f = meta.genero === 'F';
  return { o: f ? 'a' : 'o', cand: f ? 'candidata' : 'candidato', ele: f ? 'ela' : 'ele', Ele: f ? 'Ela' : 'Ele' };
}

function descTop(t) {
  return [t.col ? `${t.col}º lugar` : null, t.pct != null ? `${fmtPct(t.pct, 1)} dos válidos` : null].filter(Boolean).join(' e ');
}

function escopoEstado(m) {
  return m.pctEstado != null ? `${fmtPct(m.pctEstado)} no estado` : `${fmtInt(m.total)} votos no total`;
}

function frase(m, meta) {
  const t = m.top;
  if (!t) return '';
  const d = descTop(t);
  if (t.share >= 40) {
    const reg = m.topRegion;
    const regPart = reg && reg.share > t.share + 1 ? ` e ${fmtPct(reg.share, 1)} dos votos concentrados na região ${reg.name}` : '';
    return `Candidatura de base municipal forte${d ? ` — ${d} em ${t.mun} —` : ` em ${t.mun},`} com expansão regional ainda inicial: ${escopoEstado(m)}${regPart}.`;
  }
  const top5 = m.total ? (m.sumTop(5) / m.total) * 100 : 0;
  return `Votação distribuída por ${m.muns.length} municípios — os 5 maiores somam ${fmtPct(top5, 1)} — com melhor resultado em ${t.mun}${d ? ` (${d})` : ''}.`;
}

function resumo(m, meta) {
  const p = g(meta);
  const t = m.top;
  if (!t) return '';
  let s = `${meta.nome} (${[meta.partido, meta.numero].filter(Boolean).join(', ')}) teve **${fmtInt(m.total)} votos** para ${String(meta.cargo || '').toLowerCase()} (${[meta.uf, [meta.turno, meta.ano].filter(Boolean).join(' de ')].filter(Boolean).join(', ')})`;
  if (m.pctEstado != null) s += `, **${fmtPct(m.pctEstado)} dos válidos**`;
  if (meta.colocacaoEstado) s += `, **${meta.colocacaoEstado}º lugar** no estado`;
  const sit = String(meta.situacao || '').trim();
  if (sit) {
    const low = sit.toLowerCase();
    if (low.startsWith('eleit')) s += `, e foi **${low}**`;
    else if (low === 'suplente') s += `, e ficou como **suplente**`;
    else s += ` — situação: **${sit}**`;
  }
  s += '.';
  if (t.share >= 40) {
    s += ` A votação é altamente concentrada: **${t.mun} sozinha deu ${fmtPct(t.share, 1)}** dos votos`;
    if (t.col) s += `, onde ${p.ele} foi ${p.o} **${t.col}º mais votad${p.o}**`;
    if (t.pct != null) s += ` (${fmtPct(t.pct)} dos válidos)`;
    s += '.';
  } else {
    const top5 = (m.sumTop(5) / m.total) * 100;
    s += ` Os votos vieram de **${m.muns.length} municípios**; os cinco maiores somam ${fmtPct(top5, 1)}.`;
  }
  return s;
}

function leituraHeadline(m, meta) {
  const t = m.top;
  if (!t) return '';
  const d = descTop(t);
  if (t.share >= 40) {
    return `O perfil é de **candidatura de base municipal forte (${t.mun})** com expansão regional ainda inicial: ${d ? d + ' em casa, mas ' : ''}${escopoEstado(m)}.`;
  }
  return `O perfil é de **votação distribuída**: ${m.muns.length} municípios com voto e melhor resultado em ${t.mun}${d ? ` (${d})` : ''}.`;
}

// Estima o eleitorado (votos válidos) de uma unidade quando só há o percentual.
const validosOf = (r) => r.validos || (r.pct ? r.votos / (r.pct / 100) : 0);

function leitura(m, meta) {
  const p = g(meta);
  const t = m.top;
  if (!t) return '';
  const items = [];

  // 1. Ativo principal
  {
    let txt = `${fmtInt(t.votos)} votos (${fmtPct(t.share, 1)} do total)`;
    const zonas = m.by.ZONA.filter((z) => z.mun === t.mun);
    if (zonas.length >= 2 && zonas.length <= 6) {
      txt += `, distribuídos entre as zonas ${listPt(zonas.map((z) => `${z.zona}ª (${fmtInt(z.votos)})`))}`;
    }
    const bairros = m.by.BAIRRO.filter((b) => b.mun === t.mun);
    if (bairros.length && m.hasCol) {
      const top2 = bairros.filter((b) => b.col && b.col <= 2).length;
      if (top2) txt += `; ${p.o} ${p.cand} ficou em 1º ou 2º em ${top2} dos ${bairros.length} bairros`;
      if (top2 / bairros.length >= 0.5) txt += ', o que indica capilaridade, não dependência de um reduto só';
    }
    items.push([`${t.mun} é o ativo principal`, txt + '.']);
  }

  // 2. Redutos de alto percentual
  const bairros = m.by.BAIRRO.filter((b) => b.mun === t.mun && b.pct != null);
  if (bairros.length >= 3) {
    const min = Math.max(20, Math.round(t.votos * 0.005));
    const redutos = bairros.filter((b) => b.votos >= min).sort((a, b) => b.pct - a.pct).slice(0, 5);
    if (redutos.length) {
      items.push([`Redutos de alto percentual em ${t.mun}`,
        `${listPt(redutos.map((b) => `${b.bairro} (${fmtPct(b.pct, 1)})`))}. São áreas a consolidar com presença e entrega.`]);
    }
    // 3. Espaço de crescimento: bairros grandes abaixo da média municipal
    if (t.pct != null) {
      const sorted = [...bairros].sort((a, b) => validosOf(b) - validosOf(a));
      const big = sorted.slice(0, Math.max(5, Math.ceil(sorted.length / 2)));
      const abaixo = big.filter((b) => b.pct < t.pct).slice(0, 7);
      if (abaixo.length) {
        items.push([`Espaço de crescimento em ${t.mun}`,
          `bairros grandes com percentual abaixo da média municipal (${fmtPct(t.pct, 1)}) — ${listPt(abaixo.map((b) => `${b.bairro} (${fmtPct(b.pct, 1)})`))}.`]);
      }
    }
  }

  // 4. Municípios onde já é competitivo
  const outros = m.muns.slice(1);
  const compet = outros.filter((x) => x.col && x.col <= 10).sort((a, b) => a.col - b.col || b.votos - a.votos).slice(0, 8);
  if (compet.length) {
    const soma = compet.reduce((s, x) => s + x.votos, 0);
    items.push(['Onde já é competitivo fora de casa',
      `${listPt(compet.map((x) => `${x.col}º em ${x.mun}${x.pct != null ? ` (${fmtPct(x.pct, 1)})` : ''}`))}. Juntos somam ${fmtInt(soma)} votos — o eixo natural de expansão.`]);
  }

  // 5. Maiores ganhos possíveis
  const set = new Set(compet.map((x) => x.mun));
  const ganhos = outros.filter((x) => !set.has(x.mun) && x.votos >= 100).sort((a, b) => validosOf(b) - validosOf(a)).slice(0, 2);
  if (ganhos.length) {
    items.push(['Maiores ganhos possíveis',
      `${listPt(ganhos.map((x) => `${x.mun}: ${fmtInt(x.votos)} votos${x.pct != null || x.col ? ` (${[x.pct != null ? fmtPct(x.pct) : null, x.col ? x.col + 'º' : null].filter(Boolean).join(', ')})` : ''}`))}. São colégios eleitorais grandes onde ${p.o} ${p.cand} já tem base mínima.`]);
  }

  // 6. Voto disperso
  const dispersos = outros.filter((x) => x.share < 1);
  if (dispersos.length >= 10) {
    const soma = dispersos.reduce((s, x) => s + x.votos, 0);
    items.push(['Voto disperso',
      `${dispersos.length} municípios com menos de 1% do total cada somam ${fmtInt(soma)} votos (${fmtPct((soma / m.total) * 100, 1)}). Funciona mais como rede pessoal do que como base territorial.`]);
  }

  // 7. Risco de concentração
  if (t.share >= 50) {
    items.push(['Risco de concentração',
      `${fmtPct(t.share, 1)} dos votos vêm de uma cidade. Para ampliar o resultado será preciso crescer fora de ${t.mun}, começando pelo entorno onde já existe base.`]);
  }

  return items.map(([title, text]) => `${title}\n${text}`).join('\n\n');
}

function parseLeitura(s) {
  return String(s || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const [title, ...rest] = b.split('\n');
    return { title: title.trim(), text: rest.join(' ').trim() };
  });
}

// Preenche apenas os textos vazios.
function fillDefaults(texts, m, meta) {
  const out = { ...texts };
  if (!String(out.frase || '').trim()) out.frase = frase(m, meta);
  if (!String(out.resumo || '').trim()) out.resumo = resumo(m, meta);
  if (!String(out.leituraHeadline || '').trim()) out.leituraHeadline = leituraHeadline(m, meta);
  if (!String(out.leitura || '').trim()) out.leitura = leitura(m, meta);
  return out;
}

module.exports = { fillDefaults, parseLeitura, g };
