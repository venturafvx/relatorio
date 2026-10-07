'use strict';
const { fmtInt, fmtPct, fmtOrd, esc, rich, listPt } = require('./format');
const { parseLeitura, g } = require('./texts');
const { UFS } = require('./regions');

const ESCOPO_MUNICIPAL = /prefeit|vereador/i;

const kpi = (value, label, acc) => `<div class="kpi${acc ? ' acc' : ''}"><b>${value}</b><span>${label}</span></div>`;
const colTd = (c) => `<td class="num${c === 1 ? ' first' : ''}">${fmtOrd(c)}</td>`;
const pctTd = (p) => `<td class="num">${fmtPct(p)}</td>`;
const intTd = (n) => `<td class="num">${fmtInt(n)}</td>`;

function table(head, body, cls = '') {
  const th = head.map(([label, c]) => `<th${c ? ` class="${c}"` : ''}>${label}</th>`).join('');
  return `<div class="tw"><table class="t ${cls}"><thead><tr>${th}</tr></thead><tbody>${body.join('')}</tbody></table></div>`;
}

function render(report, m, opts = {}) {
  const meta = report.meta;
  const texts = report.texts || {};
  const p = g(meta);
  const aoCand = p.o === 'a' ? 'à candidata' : 'ao candidato';
  const OCand = (p.o === 'a' ? 'A' : 'O') + ' ' + p.cand;
  const ufInfo = UFS[String(meta.uf || '').toUpperCase()];
  const estado = ufInfo ? ufInfo[0] : meta.uf || '';
  const totalMunUF = ufInfo ? ufInfo[1] : null;
  const top = m.top;
  const id = (s) => esc(s);
  const ident = [meta.partido, meta.numero].filter(Boolean).join(' ');
  const demo = !!(report.settings && report.settings.demo);
  const contact = opts.contactUrl || '';
  const runhead = `<div class="runhead"><b>${esc(meta.nome)}${ident ? ' · ' + esc(ident) : ''}</b><span>|</span>${esc(estado)} · ${esc(meta.cargo)} ${esc(meta.ano)}${demo ? '<span>|</span><em class="demo-tag">Dados fictícios · modelo demonstrativo</em>' : ''}</div>`;
  const cta = () => (demo && contact ? `<div class="cta no-print"><div><strong>Quer este relatório com os dados reais do seu candidato?</strong><span>Município, zona, bairro, local de votação e seção, com leitura estratégica e a base completa em planilha.</span></div><a href="${esc(contact)}" target="_blank" rel="noopener">Quero o meu relatório</a></div>` : '');
  const sections = [];
  let num = 0;
  const section = (sid, title, body) => {
    num++;
    sections.push({ sid, title, num });
    return `<section class="sec page" id="${sid}">${runhead}<h2><span>${String(num).padStart(2, '0')}</span>${title}</h2>${body}</section>`;
  };
  const has = { ZONA: m.by.ZONA.length > 0, BAIRRO: m.by.BAIRRO.length > 0, LOCAL: m.by.LOCAL.length > 0, SECAO: m.by.SECAO.length > 0 };
  const showCol = m.hasCol;
  const showPct = m.hasPct;

  // ---------- CAPA ----------
  const niveis = ['município', has.ZONA && 'zona', has.BAIRRO && 'bairro', has.LOCAL && 'local de votação', has.SECAO && 'seção'].filter(Boolean);
  const escopo = ESCOPO_MUNICIPAL.test(meta.cargo || '') ? 'no município' : 'no estado';
  const capaKpis = [kpi(fmtInt(m.total), `votos ${escopo}`)];
  if (m.pctEstado != null) capaKpis.push(kpi(fmtPct(m.pctEstado), `dos votos válidos ${meta.uf ? 'do ' + esc(meta.uf) : ''}`));
  if (meta.colocacaoEstado) capaKpis.push(kpi(fmtOrd(meta.colocacaoEstado), `colocação ${escopo}${meta.situacao ? ' · ' + esc(String(meta.situacao).toLowerCase()) : ''}`));
  capaKpis.push(kpi(fmtInt(m.muns.length), 'municípios com voto'));
  if (top && m.muns.length > 1) capaKpis.push(kpi(fmtPct(top.share, 1), `dos votos vieram de ${esc(top.mun)}`));
  const firsts = m.muns.filter((x) => x.col === 1);
  if (firsts.length === 1) capaKpis.push(kpi('1º', `lugar em ${esc(firsts[0].mun)}`));
  else if (firsts.length > 1) capaKpis.push(kpi(fmtInt(firsts.length), 'municípios em 1º lugar'));
  else if (showCol) {
    const best = m.muns.filter((x) => x.col).sort((a, b) => a.col - b.col || b.votos - a.votos)[0];
    if (best) capaKpis.push(kpi(fmtOrd(best.col), `lugar em ${esc(best.mun)}`));
  }
  const half = Math.ceil(capaKpis.length / 2);
  const capa = `
<section class="cover page" id="capa">
  <div class="hero">
    <p class="eyebrow">Relatório de votação · Eleições ${esc(meta.ano)}</p>
    <h1>${esc(meta.nome)}</h1>
    <p class="sub">${[meta.partido, meta.numero, meta.cargo].filter(Boolean).map(esc).join(' · ')}</p>
    <p class="uf">${esc(estado)}</p>
    <p class="desc">Panorama ${ESCOPO_MUNICIPAL.test(meta.cargo || '') ? 'municipal' : 'estadual'} por ${listPt(niveis)}${meta.turno ? ' · ' + esc(meta.turno) : ''}</p>
    ${demo ? '<p class="demo-badge">Modelo demonstrativo · dados fictícios</p>' : ''}
  </div>
  <div class="kpis cover-kpis">${capaKpis.map((k, i) => (i >= half ? k.replace('class="kpi', 'class="kpi acc') : k)).join('')}</div>
  ${texts.frase ? `<div class="callout"><small>Em uma frase</small><p>${rich(texts.frase)}</p></div>` : ''}
  <div class="cover-foot">
    ${demo ? '<p class="demo-note">Este é um modelo demonstrativo. Candidato, partido, números e locais são fictícios e servem apenas para ilustrar o formato do relatório.</p>' : ''}
    <p class="fonte">${demo ? 'Fonte do modelo: estrutura de dados do Tribunal Superior Eleitoral (TSE)' : 'Fonte: Tribunal Superior Eleitoral (TSE)' + (meta.dataDados ? ' · dados de ' + esc(meta.dataDados) : '')}</p>
    <p class="assin">${esc(meta.assinatura)}</p>
  </div>
</section>`;

  const body = [];

  // ---------- 01 RESUMO ----------
  {
    let h = texts.resumo ? `<p class="lead">${rich(texts.resumo)}</p>` : '';
    const aptos = Number(meta.aptos) || null;
    const comp = Number(meta.comparecimento) || null;
    const val = Number(meta.validosEstado) || null;
    const abst = Number(meta.abstencao) || (aptos && comp ? aptos - comp : null);
    if (aptos || comp || val) {
      const pctOf = (n) => (aptos && n ? ` (${fmtPct((n / aptos) * 100, 1)})` : '');
      const cards = [];
      if (aptos) cards.push(kpi(fmtInt(aptos), 'eleitores aptos'));
      if (comp) cards.push(kpi(fmtInt(comp), 'comparecimento' + pctOf(comp)));
      if (val) cards.push(kpi(fmtInt(val), 'votos válidos'));
      if (abst) cards.push(kpi(fmtInt(abst), 'abstenção' + pctOf(abst)));
      h += `<h3>Cenário ${ESCOPO_MUNICIPAL.test(meta.cargo || '') ? 'municipal' : 'estadual'}</h3><div class="kpis k4">${cards.join('')}</div>`;
    }

    if (top && m.muns.length > 1) {
      const segs = [{ label: top.mun, v: top.votos }];
      let note = '';
      if (m.regions.length) {
        const tr = m.topRegion;
        if (tr && tr.votos > top.votos) segs.push({ label: `Demais ${tr.name}`, v: tr.votos - top.votos });
        // Até duas outras regiões com 5%+ ganham faixa própria.
        const others = m.regions.filter((r) => r !== tr).filter((r, i) => i === 0 || r.share >= 5).slice(0, 2);
        for (const o of others) segs.push({ label: o.name, v: o.votos });
        if (tr) note = `${esc(tr.name)} (${tr.n} municípios com voto, incluindo ${esc(top.mun)}) = ${fmtPct(tr.share, 1)} dos votos.`;
        for (const o of others) note += ` ${esc(o.name)} ≈ ${fmtPct(o.share, 1)}.`;
      } else {
        const v = m.sumTop(5) - top.votos;
        if (v > 0) segs.push({ label: `Cidades 2 a ${Math.min(5, m.muns.length)}`, v });
      }
      const rest = m.total - segs.reduce((s, x) => s + x.v, 0);
      if (rest > 0) segs.push({ label: m.regions.length ? 'Outras regiões' : 'Demais municípios', v: rest, rest: true });
      const cls = (s, i) => (s.rest ? 'sr' : 's' + i);
      const bar = segs.map((s, i) => {
        const w = (s.v / m.total) * 100;
        return `<div class="seg ${cls(s, i)}" style="width:${w.toFixed(3)}%">${w >= 7 ? fmtPct(w, 1) : ''}</div>`;
      }).join('');
      const legend = segs.map((s, i) => `<span><i class="${cls(s, i)}"></i>${esc(s.label)} (${fmtInt(s.v)})</span>`).join('');
      h += `<h3>De onde vieram os votos</h3><div class="stack">${bar}</div><div class="legend">${legend}</div>${note ? `<p class="note">${note}</p>` : ''}`;
    }

    const ind = [];
    const row = (k, v) => ind.push(`<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`);
    row('Votos totais', fmtInt(m.total));
    if (m.pctEstado != null) row(`% dos válidos (${esc(meta.uf)})`, fmtPct(m.pctEstado));
    if (meta.colocacaoEstado) row(`Colocação ${escopo}`, fmtOrd(meta.colocacaoEstado));
    if (meta.situacao) row('Situação', esc(meta.situacao));
    row('Municípios com voto', fmtInt(m.muns.length) + (totalMunUF && !ESCOPO_MUNICIPAL.test(meta.cargo || '') ? ` de ${totalMunUF}` : ''));
    const lv = [['ZONA', 'Zonas'], ['BAIRRO', 'bairros'], ['LOCAL', 'locais'], ['SECAO', 'seções']].filter(([l]) => has[l]);
    if (lv.length) row(`${lv.map((x) => x[1]).join(' / ')} com voto`.replace(/^./, (c) => c.toUpperCase()), lv.map(([l]) => fmtInt(m.by[l].length)).join(' / '));
    if (top) row(esc(top.mun), `${fmtInt(top.votos)} votos (${fmtPct(top.share, 1)})${top.col ? ` — ${top.col}º lugar` : ''}`);
    if (m.muns.length >= 4) {
      const n3 = m.sumTop(3);
      row(`Top 3 cidades (${m.muns.slice(0, 3).map((x) => esc(x.mun)).join(', ')})`, `${fmtInt(n3)} votos (${fmtPct((n3 / m.total) * 100, 1)})`);
    }
    if (m.muns.length >= 6) {
      const n5 = m.sumTop(5);
      row(`Top 5 cidades (+ ${m.muns.slice(3, 5).map((x) => esc(x.mun)).join(', ')})`, `${fmtInt(n5)} votos (${fmtPct((n5 / m.total) * 100, 1)})`);
    }
    for (const r of m.regions.slice(0, 3)) row(`${esc(r.name)} (${r.n} municípios)`, `${fmtInt(r.votos)} votos (${fmtPct(r.share, 1)})`);
    h += `<h3>Indicadores</h3>${table([['Indicador'], ['Valor']], ind, 'kv')}`;
    body.push(section('resumo', 'Resumo', h));
  }

  // ---------- 02 MUNICÍPIOS ----------
  {
    const n10 = m.sumTop(10);
    let intro = `${fmtInt(m.muns.length)} municípios deram voto ${aoCand}`;
    if (m.muns.length > 10) intro += `; os 10 primeiros somam ${fmtInt(n10)} votos (${fmtPct((n10 / m.total) * 100, 1)})`;
    intro += '.';
    if (showCol) {
      if (firsts.length === 1) intro += ` ${p.Ele} foi ${p.o} mais votad${p.o} em ${esc(firsts[0].mun)} (1º)`;
      else if (firsts.length > 1) intro += ` ${p.Ele} foi ${p.o} mais votad${p.o} em ${firsts.length} municípios (${listPt(firsts.slice(0, 6).map((x) => esc(x.mun)))}${firsts.length > 6 ? ' e outros' : ''})`;
      const top4 = m.muns.filter((x) => x.col >= 2 && x.col <= 4).slice(0, 6);
      if (top4.length) intro += `${firsts.length ? ' e' : ` ${p.Ele}`} ficou entre os 4 primeiros em ${listPt(top4.map((x) => esc(x.mun)))}`;
      if (firsts.length || top4.length) intro += '.';
      intro += ` Colocação = posição entre os candidatos a ${esc(String(meta.cargo || '').toLowerCase())} no município.`;
    }
    let h = `<p class="lead">${intro}</p>`;

    const t15 = m.muns.slice(0, 15);
    const max = t15[0] ? t15[0].votos : 1;
    const bars = t15.map((x) => {
      const c = !showCol ? 'c2' : x.col === 1 ? 'c1' : x.col && x.col <= 10 ? 'c2' : 'c3';
      const info = [fmtInt(x.votos), x.col ? `${x.col}º lugar` : null, x.pct != null ? `${fmtPct(x.pct)} dos válidos` : null].filter(Boolean).join(' · ');
      return `<div class="hb"><span class="hb-l">${esc(x.mun)}</span><span class="hb-t"><span class="hb-b ${c}" style="width:${((x.votos / max) * 58).toFixed(2)}%"></span><span class="hb-v">${info}</span></span></div>`;
    }).join('');
    h += `<h3>Os ${t15.length} municípios com mais votos</h3><div class="hbars">${bars}</div>`;
    if (showCol) h += `<div class="legend"><span><i class="c1"></i>1º lugar no município</span><span><i class="c2"></i>2º a 10º</span><span><i class="c3"></i>abaixo do 10º</span></div><p class="note">Cor da barra = colocação d${p.o} ${p.cand} no município.</p>`;

    const showZ = has.ZONA, showL = has.LOCAL, showS = has.SECAO;
    const head = [['#', 'num'], ['Município'], ['Votos', 'num'], ['% do total', 'num']];
    if (showPct) head.push(['% válidos', 'num']);
    if (showCol) head.push(['Colocação', 'num']);
    if (showZ) head.push(['Zonas', 'num']);
    if (showL) head.push(['Locais', 'num']);
    if (showS) head.push(['Seções', 'num']);
    const rows = m.muns.map((x, i) => `<tr><td class="num muted">${i + 1}</td><td><strong>${esc(x.mun)}</strong></td>${intTd(x.votos)}${pctTd(x.share)}${showPct ? pctTd(x.pct) : ''}${showCol ? colTd(x.col) : ''}${showZ ? intTd(x.zonas) : ''}${showL ? intTd(x.locais) : ''}${showS ? intTd(x.secoes) : ''}</tr>`);
    h += `<h3 class="brk">Todos os ${fmtInt(m.muns.length)} municípios</h3>${table(head, rows)}`;
    body.push(section('municipios', 'Municípios', h));
  }

  // ---------- 03 ZONAS ----------
  if (has.ZONA) {
    const zs = m.by.ZONA;
    const zinfo = (z) => [z.pct != null ? fmtPct(z.pct) + ' dos válidos' : null, z.col ? z.col + 'º' : null].filter(Boolean).join(', ');
    let intro = `A votação veio de ${fmtInt(zs.length)} zonas`;
    if (zs.length >= 2) {
      const [a, b] = zs;
      intro += `; as maiores são a **${a.zona}ª de ${a.mun} (${fmtInt(a.votos)} votos${zinfo(a) ? ', ' + zinfo(a) : ''})** e a **${b.zona}ª de ${b.mun} (${fmtInt(b.votos)}${zinfo(b) ? ', ' + zinfo(b) : ''})**`;
    }
    intro += '. Abaixo, as zonas dos municípios com mais de uma zona; nos demais a zona única repete o total municipal.';
    let h = `<p class="lead">${rich(intro)}</p>`;
    h += `<div class="kpis k3">${zs.slice(0, 3).map((z, i) => kpi(fmtInt(z.votos), `Zona ${esc(z.zona)} · ${esc(z.mun)}${z.pct != null ? ' · ' + fmtPct(z.pct) + ' dos válidos' : ''}${z.col ? ' · ' + z.col + 'º' : ''}`, z.col === 1 || i === 2)).join('')}</div>`;

    const multi = m.muns.filter((x) => x.zonas >= 2);
    const listed = multi.filter((x) => x.zonas <= 12).slice(0, 15);
    const big = multi.filter((x) => x.zonas > 12);
    const head = [['Município'], ['Zona', 'num'], ['Votos', 'num']];
    if (showPct) head.push(['% válidos na zona', 'num']);
    if (showCol) head.push(['Colocação', 'num']);
    const rows = [];
    for (const mu of listed) {
      for (const z of zs.filter((z) => z.mun === mu.mun)) {
        rows.push(`<tr><td>${esc(z.mun)}</td><td class="num">${esc(z.zona)}</td>${intTd(z.votos)}${showPct ? pctTd(z.pct) : ''}${showCol ? colTd(z.col) : ''}</tr>`);
      }
    }
    if (rows.length) h += table(head, rows);
    const notes = big.map((mu) => {
      const mz = zs.filter((z) => z.mun === mu.mun);
      const maxPct = Math.max(...mz.map((z) => z.pct || 0));
      return `<p><strong>${esc(mu.mun)}:</strong> ${fmtInt(mu.votos)} votos espalhados por ${mz.length} zonas; as maiores são ${mz.slice(0, 10).map((z) => `${esc(z.zona)}ª (${fmtInt(z.votos)})`).join(', ')}.${showPct && maxPct ? ` Nenhuma passa de ${fmtPct(Math.ceil(maxPct * 100) / 100)} dos válidos.` : ''}</p>`;
    });
    const unicas = m.muns.slice(0, 12).filter((x) => x.zonas === 1).map((x) => {
      const z = zs.find((z) => z.mun === x.mun);
      return z ? `${esc(x.mun)} ${esc(z.zona)}ª (${fmtInt(z.votos)}${z.col === 1 ? ', 1º lugar' : ''})` : null;
    }).filter(Boolean);
    if (unicas.length) notes.push(`<p>Zonas únicas com destaque: ${listPt(unicas)}.</p>`);
    if (notes.length) h += `<div class="box">${notes.join('')}</div>`;
    body.push(section('zonas', 'Zonas eleitorais', h));
  }

  // ---------- 04 BAIRROS ----------
  if (has.BAIRRO && top) {
    const tb = m.by.BAIRRO.filter((b) => b.mun === top.mun);
    let h = '';
    if (tb.length) {
      const f1 = tb.filter((b) => b.col === 1);
      const f2 = tb.filter((b) => b.col === 2);
      let intro = `Em ${top.mun} ${p.o} ${p.cand} teve voto em ${fmtInt(tb.length)} bairros`;
      if (showCol && (f1.length || f2.length)) {
        intro += ' e foi';
        if (f1.length) intro += ` **1º em ${f1.length}** (${listPt(f1.slice(0, 6).map((b) => b.bairro))}${f1.length > 6 ? ' e outros' : ''})`;
        if (f2.length) intro += `${f1.length ? ' e' : ''} 2º em ${f2.length}`;
      }
      intro += '.';
      const min = Math.max(20, Math.round(top.votos * 0.005));
      const hi = tb.filter((b) => b.pct != null && b.votos >= min).sort((a, b) => b.pct - a.pct).slice(0, 4);
      if (hi.length >= 2) intro += ` Os maiores percentuais estão em ${listPt(hi.map((b) => `${b.bairro} (${fmtPct(b.pct, 1)})`))}.`;
      h += `<p class="lead">${rich(intro)}</p>`;
      const lim = 80;
      const head = [['Bairro'], ['Votos', 'num']];
      if (showPct) head.push(['% válidos', 'num']);
      if (showCol) head.push(['Colocação', 'num']);
      const rows = tb.slice(0, lim).map((b) => `<tr><td><strong>${esc(b.bairro)}</strong></td>${intTd(b.votos)}${showPct ? pctTd(b.pct) : ''}${showCol ? colTd(b.col) : ''}</tr>`);
      h += `<h3>${esc(top.mun)} — ${tb.length > lim ? `os ${lim} maiores bairros` : 'todos os bairros'}</h3>${table(head, rows)}`;
    }
    const others = m.muns.slice(1, 12).filter((x) => x.bairros > 0);
    if (others.length) {
      const head = [['Cidade'], ['Bairro'], ['Votos', 'num']];
      if (showPct) head.push(['% válidos', 'num']);
      if (showCol) head.push(['Colocação', 'num']);
      const rows = [];
      for (const mu of others) {
        for (const b of m.by.BAIRRO.filter((b) => b.mun === mu.mun).slice(0, 5)) {
          rows.push(`<tr><td>${esc(b.mun)}</td><td>${esc(b.bairro)}</td>${intTd(b.votos)}${showPct ? pctTd(b.pct) : ''}${showCol ? colTd(b.col) : ''}</tr>`);
        }
      }
      h += `<h3 class="brk">Demais cidades do top ${others.length + 1} — maiores bairros</h3>${table(head, rows)}`;
      h += `<p class="note">Os ${fmtInt(m.by.BAIRRO.length)} bairros de todas as cidades estão na base completa.</p>`;
    }
    body.push(section('bairros', 'Bairros por cidade', h));
  }

  // ---------- 05 LOCAIS ----------
  if (has.LOCAL && top) {
    const ls = m.by.LOCAL;
    const lead = ls[0];
    let k = 0;
    while (ls[k] && ls[k].mun === top.mun) k++;
    const linfo = (l) => [fmtInt(l.votos) + ' votos', l.pct != null ? fmtPct(l.pct, 1) : null, l.col ? l.col + 'º lugar' : null].filter(Boolean).join(', ');
    let intro = k >= 10 ? `Os ${k} maiores locais são todos de ${top.mun}, liderados por ` : 'O maior local de votação é ';
    intro += `**${lead.local} (${linfo(lead)})**${lead.mun !== top.mun ? `, em ${lead.mun}` : ''}.`;
    const tl = ls.filter((l) => l.mun === top.mun);
    if (showCol) intro += ` Dos ${fmtInt(tl.length)} locais de ${top.mun} com voto, ${p.o} ${p.cand} foi 1º em ${tl.filter((l) => l.col === 1).length}.`;
    let h = `<p class="lead">${rich(intro)}</p>`;
    const head = [['#', 'num'], ['Local'], ['Votos', 'num']];
    if (showPct) head.push(['% válidos', 'num']);
    if (showCol) head.push(['Colocação', 'num']);
    const rows = tl.slice(0, 25).map((l, i) => `<tr><td class="num muted">${i + 1}</td><td>${esc(l.local)}</td>${intTd(l.votos)}${showPct ? pctTd(l.pct) : ''}${showCol ? colTd(l.col) : ''}</tr>`);
    h += `<h3>Top ${rows.length} — ${esc(top.mun)}</h3>${table(head, rows)}`;
    const fora = ls.filter((l) => l.mun !== top.mun).slice(0, 15);
    if (fora.length) {
      const head2 = [['Município'], ['Local'], ['Votos', 'num']];
      if (showPct) head2.push(['% válidos', 'num']);
      if (showCol) head2.push(['Colocação', 'num']);
      const rows2 = fora.map((l) => `<tr><td>${esc(l.mun)}</td><td>${esc(l.local)}</td>${intTd(l.votos)}${showPct ? pctTd(l.pct) : ''}${showCol ? colTd(l.col) : ''}</tr>`);
      h += `<h3 class="brk">Maiores locais fora de ${esc(top.mun)}</h3>${table(head2, rows2)}`;
    }
    body.push(section('locais', 'Maiores locais de votação', h));
  }

  // ---------- 06 SEÇÕES ----------
  if (has.SECAO && top) {
    const ss = m.by.SECAO;
    const s1 = ss.filter((s) => s.votos === 1).length;
    const s50 = ss.filter((s) => s.votos >= 50).length;
    const first = ss.filter((s) => s.col === 1);
    const firstTop = first.filter((s) => s.mun === top.mun).length;
    let intro = `${OCand} teve voto em ${fmtInt(ss.length)} seções`;
    const parts = [];
    if (s50) parts.push(`**${fmtInt(s50)} seções com 50+ votos**`);
    if (showCol && first.length) parts.push(`**${fmtInt(first.length)} seções em 1º lugar**${m.muns.length > 1 ? ` (${fmtInt(firstTop)} delas em ${top.mun})` : ''}`);
    if (parts.length) intro += (s50 / ss.length < 0.1 ? ', mas a força está num núcleo pequeno: ' : ', com ') + parts.join(' e ');
    intro += '.';
    if (s1) intro += ` Em ${fmtInt(s1)} seções (${fmtPct((s1 / ss.length) * 100, 0)}) ${p.ele} teve um único voto.`;
    let h = `<p class="lead">${rich(intro)}</p>`;
    const cards = [kpi(fmtInt(ss.length), 'seções com voto')];
    if (showCol) cards.push(kpi(fmtInt(first.length), 'seções em 1º lugar', true));
    cards.push(kpi(fmtInt(s50), 'seções com 50+ votos'));
    cards.push(kpi(fmtInt(s1), 'seções com 1 voto'));
    h += `<div class="kpis k4">${cards.join('')}</div>`;
    const t30 = ss.slice(0, 30);
    const allTop = t30.every((s) => s.mun === top.mun);
    const head = [['#', 'num']];
    if (!allTop) head.push(['Município']);
    head.push(['Zona', 'num'], ['Seção', 'num'], ['Local'], ['Votos', 'num']);
    if (showPct) head.push(['% válidos', 'num']);
    if (showCol) head.push(['Colocação', 'num']);
    const rows = t30.map((s, i) => `<tr><td class="num muted">${i + 1}</td>${allTop ? '' : `<td>${esc(s.mun)}</td>`}<td class="num">${esc(s.zona)}</td><td class="num">${esc(s.secao)}</td><td>${esc(s.local)}</td>${intTd(s.votos)}${showPct ? pctTd(s.pct) : ''}${showCol ? colTd(s.col) : ''}</tr>`);
    h += `<h3>As ${t30.length} seções com mais votos${allTop && m.muns.length > 1 ? ` — todas em ${esc(top.mun)}` : ''}</h3>${table(head, rows)}`;
    h += `<p class="note">As ${fmtInt(ss.length)} seções completas estão na base completa.</p>`;
    body.push(section('secoes', 'Ranking das seções', h));
  }

  // ---------- 07 LEITURA ESTRATÉGICA ----------
  {
    const items = parseLeitura(texts.leitura);
    let h = texts.leituraHeadline ? `<div class="callout big"><p>${rich(texts.leituraHeadline)}</p></div>` : '';
    h += items.map((it, i) => `<div class="insight"><span class="n">${String(i + 1).padStart(2, '0')}</span><div><h4>${rich(it.title)}</h4><p>${rich(it.text)}</p></div></div>`).join('');
    const lvNames = ['município', has.ZONA && 'zona', has.BAIRRO && 'bairro', has.LOCAL && 'local de votação', has.SECAO && 'seção'].filter(Boolean);
    const bad = m.validation.filter((v) => !v.ok);
    let val;
    if (!m.validation.length) val = '';
    else if (!bad.length) val = ` Validação: as somas de ${listPt(m.validation.map((v) => v.label.toLowerCase()))} batem com o total de cada município e com o total de ${fmtInt(m.total)} votos.`;
    else val = ` Validação: ${bad.map((v) => `${v.label.toLowerCase()} somam ${fmtInt(v.sum)}`).join('; ')} (total por município: ${fmtInt(m.total)}).`;
    if (demo) h += `<div class="method"><h5>Sobre este modelo</h5><p>Relatório demonstrativo com dados fictícios. A versão real é produzida a partir dos resultados oficiais do Tribunal Superior Eleitoral (TSE), nos níveis município, zona, bairro, local de votação e seção, com validação das somas em todos os níveis e entrega da base completa em planilha.</p><p class="assin">${esc(meta.assinatura)}</p></div>`;
    else h += `<div class="method"><h5>Fonte e metodologia</h5><p>Dados: Tribunal Superior Eleitoral (TSE) — Eleição ${esc(meta.ano)}${meta.turno ? ', ' + esc(meta.turno) : ''}${meta.uf ? ', ' + esc(meta.uf) : ''}, ${esc(meta.cargo)}, nos níveis ${listPt(lvNames)}.${val} Base completa: ${fmtInt(m.totalRows)} linhas.</p><p class="assin">${esc(meta.assinatura)}</p></div>`;
    body.push(section('leitura', 'Leitura estratégica', h));
  }

  // ---------- BASE COMPLETA (só na web) ----------
  const dados = `<section class="sec no-print" id="dados"><h2><span>${String(num + 1).padStart(2, '0')}</span>Base completa</h2>
<p class="lead">Consulte, filtre e ordene todas as ${fmtInt(m.totalRows)} linhas da base. Clique no título de uma coluna para ordenar.</p>
<div class="explorer" data-src="${esc(opts.dataUrl)}"><p class="note">Carregando…</p></div></section>`;
  sections.push({ sid: 'dados', title: 'Base completa' });

  const toc = `<nav class="toc no-print">${sections.map((s) => `<a href="#${s.sid}">${esc(s.title)}</a>`).join('')}</nav>`;
  const title = `${meta.nome} · Relatório de votação ${meta.ano}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(demo ? `Modelo de relatório de votação · Eleições ${meta.ano}` : title)}</title>${demo ? `
<meta name="description" content="Veja como é o relatório de votação por município, zona, bairro, local e seção.">
<meta property="og:title" content="Relatório de votação · Eleições ${esc(meta.ano)} — veja o modelo">
<meta property="og:description" content="Panorama da votação do candidato por município, zona, bairro, local de votação e seção, com leitura estratégica. agenciafvx.com">
<meta property="og:type" content="website">` : ''}
<link rel="stylesheet" href="/static/report.css">
</head>
<body>
<header class="topbar no-print"><div class="tb-in">
  <span class="tb-title"><b>${esc(meta.nome)}</b> ${esc(ident)}</span>
  <span class="tb-actions">
    ${demo && contact ? `<a class="btn-cta" href="${esc(contact)}" target="_blank" rel="noopener">Quero o meu</a>` : ''}
    <button type="button" onclick="window.print()">Baixar PDF</button>
    ${opts.csvUrl ? `<a class="btn-sec" href="${esc(opts.csvUrl)}" download>Baixar CSV</a>` : ''}
  </span>
</div></header>
<main class="doc">
${capa}
${cta()}
${toc}
${body.join('\n')}
${dados}
${cta()}
</main>
<footer class="foot no-print">Fonte: TSE · ${esc(meta.assinatura)}</footer>
<script src="/static/report.js" defer></script>
</body>
</html>`;
}

// Dados da base completa para o explorador da página.
function buildData(m) {
  const C = (k, label, type) => ({ k, label, type });
  const pick = (rows, keys) => rows.map((r) => keys.map((k) => (r[k] == null || r[k] === '' ? null : typeof r[k] === 'number' ? Math.round(r[k] * 100) / 100 : r[k])));
  const out = {};
  const def = {
    MUN: ['Municípios', [C('mun', 'Município'), C('regiao', 'Região'), C('votos', 'Votos', 'int'), C('share', '% do total', 'pct'), C('pct', '% válidos', 'pct'), C('col', 'Colocação', 'ord')]],
    ZONA: ['Zonas', [C('mun', 'Município'), C('zona', 'Zona'), C('votos', 'Votos', 'int'), C('pct', '% válidos', 'pct'), C('col', 'Colocação', 'ord')]],
    BAIRRO: ['Bairros', [C('mun', 'Município'), C('bairro', 'Bairro'), C('votos', 'Votos', 'int'), C('pct', '% válidos', 'pct'), C('col', 'Colocação', 'ord')]],
    LOCAL: ['Locais', [C('mun', 'Município'), C('zona', 'Zona'), C('local', 'Local'), C('votos', 'Votos', 'int'), C('pct', '% válidos', 'pct'), C('col', 'Colocação', 'ord')]],
    SECAO: ['Seções', [C('mun', 'Município'), C('zona', 'Zona'), C('secao', 'Seção'), C('local', 'Local'), C('votos', 'Votos', 'int'), C('pct', '% válidos', 'pct'), C('col', 'Colocação', 'ord')]],
  };
  for (const [lvl, [label, cols]] of Object.entries(def)) {
    const rows = lvl === 'MUN' ? m.muns : m.by[lvl];
    if (!rows.length) continue;
    const used = cols.filter((c) => rows.some((r) => r[c.k] != null && r[c.k] !== ''));
    out[lvl] = { label, cols: used, rows: pick(rows, used.map((c) => c.k)) };
  }
  return out;
}

module.exports = { render, buildData };
