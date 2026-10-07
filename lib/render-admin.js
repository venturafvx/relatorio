'use strict';
const { esc, fmtInt } = require('./format');
const { UFS } = require('./regions');

const CARGOS = ['Deputado Estadual', 'Deputado Federal', 'Deputado Distrital', 'Senador', 'Governador', 'Presidente', 'Prefeito', 'Vereador'];
const SITUACOES = ['Eleito', 'Eleito por QP', 'Eleito por média', 'Suplente', 'Não eleito', '2º turno'];

function layout(title, body, { admin = false } = {}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/admin.css">
</head>
<body>
<header class="bar"><div class="in">
  <a class="brand" href="/admin">Relatórios <span>· agenciafvx</span></a>
  ${admin ? '<form method="post" action="/admin/logout"><button class="link">Sair</button></form>' : ''}
</div></header>
<main class="in">${body}</main>
${admin ? '<script src="/static/admin.js" defer></script>' : ''}
</body>
</html>`;
}

function loginPage(error) {
  return layout('Entrar', `
<form class="card login" method="post" action="/admin/login">
  <h1>Entrar</h1>
  ${error ? `<p class="err">${esc(error)}</p>` : ''}
  <label>Senha<input type="password" name="password" autofocus required autocomplete="current-password"></label>
  <button class="btn">Entrar</button>
</form>`);
}

function fmtDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function listPage(reports, baseUrl) {
  const rows = reports.map((r) => {
    const demo = r.settings && r.settings.demo;
    const url = demo ? `${baseUrl}/exemplo` : `${baseUrl}/r/${r.id}`;
    const m = r.meta;
    const on = r.settings && r.settings.ativo;
    return `<tr data-id="${esc(r.id)}">
  <td><strong>${esc(m.nome)}</strong>${demo ? ' <span class="tag">Modelo /exemplo</span>' : ''}<div class="muted">${esc([m.partido, m.numero, m.cargo, m.uf, m.ano].filter(Boolean).join(' · '))}</div></td>
  <td>${esc(m.cliente || '–')}</td>
  <td class="num">${fmtInt((r.stats && r.stats.views) || 0)}<div class="muted">${fmtDate(r.stats && r.stats.lastView)}</div></td>
  <td><button class="pill ${on ? 'on' : 'off'}" data-act="toggle">${on ? 'Ativo' : 'Desativado'}</button></td>
  <td class="acts">
    <button class="btn sm" data-act="copy" data-url="${esc(url)}">Copiar link</button>
    <a class="btn sm ghost" href="${demo ? '/exemplo' : '/r/' + esc(r.id)}" target="_blank" rel="noopener">Abrir</a>
    <a class="btn sm ghost" href="/admin/r/${esc(r.id)}">Editar</a>
    <button class="btn sm danger" data-act="delete" data-name="${esc(m.nome)}">Excluir</button>
  </td>
</tr>`;
  });
  return layout('Relatórios', `
<div class="head"><h1>Relatórios</h1><a class="btn" href="/admin/novo">+ Novo relatório</a></div>
${reports.length ? `<div class="tw"><table class="list"><thead><tr><th>Candidato</th><th>Cliente</th><th class="num">Acessos</th><th>Link</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : '<div class="card empty"><p>Nenhum relatório ainda.</p><a class="btn" href="/admin/novo">Criar o primeiro</a></div>'}
<p class="muted small">"Acessos" conta as aberturas do link pelo cliente (suas visitas logado não contam). Link desativado mostra "relatório indisponível".</p>`, { admin: true });
}

const field = (label, name, value, attrs = '') =>
  `<label>${label}<input name="${name}" value="${esc(value == null ? '' : value)}" ${attrs}></label>`;

function select(label, name, value, options, attrs = '') {
  const opts = options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value || '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `<label>${label}<select name="${name}" ${attrs}>${opts}</select></label>`;
}

function formPage(report, model, baseUrl, flash) {
  const isNew = !report;
  const m = (report && report.meta) || { ano: '2026', turno: '1º turno', uf: 'RJ', cargo: 'Deputado Estadual', genero: 'M', assinatura: 'Fabio Ventura – agenciafvx.com' };
  const t = (report && report.texts) || {};
  const s = (report && report.settings) || { ativo: true, permitirCsv: true };
  const url = report ? (s.demo ? `${baseUrl}/exemplo` : `${baseUrl}/r/${report.id}`) : '';

  let top = '';
  if (report) {
    top += `<div class="card linkbox${flash ? ' flash' : ''}">
  ${flash ? `<p class="ok">${esc(flash)}</p>` : ''}
  <p class="muted small">Link para enviar ao cliente</p>
  <div class="linkrow"><input readonly value="${esc(url)}" onclick="this.select()"><button type="button" class="btn" data-act="copy" data-url="${esc(url)}">Copiar</button><a class="btn ghost" href="/r/${esc(report.id)}" target="_blank" rel="noopener">Abrir</a></div>
</div>`;
  }
  if (model) {
    const items = model.validation.map((v) => `<li class="${v.ok ? 'ok' : 'warn'}">${esc(v.label)}: ${fmtInt(v.rows)} linhas, soma ${fmtInt(v.sum)} ${v.ok ? '✓' : `≠ ${fmtInt(model.total)}`}${v.derived ? ' (agregado das seções)' : ''}</li>`).join('');
    top += `<div class="card"><h3>Conferência dos dados</h3><p>${fmtInt(model.total)} votos em ${fmtInt(model.muns.length)} municípios${model.top ? ` · maior: ${esc(model.top.mun)}` : ''}.${model.hasCol ? '' : ' <span class="warnt">Sem coluna de colocação — rankings não serão exibidos.</span>'}</p>${items ? `<ul class="val">${items}</ul>` : ''}</div>`;
  }

  const ufOpts = Object.entries(UFS).map(([k, v]) => [k, `${k} – ${v[0]}`]);
  const body = `
<div class="head"><h1>${isNew ? 'Novo relatório' : 'Editar relatório'}</h1><a class="link" href="/admin">← Voltar</a></div>
${top}
<form id="rform" class="card" data-id="${esc(report ? report.id : '')}">
  <fieldset><legend>Candidato</legend>
    <div class="grid g3">
      ${field('Nome de urna *', 'nome', m.nome, 'required')}
      ${field('Partido', 'partido', m.partido, 'placeholder="PSB"')}
      ${field('Número', 'numero', m.numero, 'placeholder="40222"')}
      <label>Cargo *<input name="cargo" list="cargos" value="${esc(m.cargo)}" required><datalist id="cargos">${CARGOS.map((c) => `<option value="${c}">`).join('')}</datalist></label>
      ${select('Estado *', 'uf', m.uf, ufOpts, 'required')}
      ${select('Tratamento', 'genero', m.genero, [['M', 'o candidato'], ['F', 'a candidata']])}
    </div>
  </fieldset>

  <fieldset><legend>Resultado</legend>
    <div class="grid g3">
      ${field('Ano', 'ano', m.ano)}
      ${field('Turno', 'turno', m.turno)}
      ${field('Data dos dados', 'dataDados', m.dataDados, 'placeholder="6 de outubro de 2026"')}
      ${field('Colocação no estado', 'colocacaoEstado', m.colocacaoEstado, 'inputmode="numeric" placeholder="81"')}
      <label>Situação<input name="situacao" list="situacoes" value="${esc(m.situacao || '')}" placeholder="Suplente"><datalist id="situacoes">${SITUACOES.map((c) => `<option value="${c}">`).join('')}</datalist></label>
    </div>
  </fieldset>

  <fieldset><legend>Cenário estadual <span class="muted">(opcional — habilita o % dos válidos no estado)</span></legend>
    <div class="grid g4">
      ${field('Eleitores aptos', 'aptos', m.aptos, 'inputmode="numeric" placeholder="12842517"')}
      ${field('Comparecimento', 'comparecimento', m.comparecimento, 'inputmode="numeric"')}
      ${field('Votos válidos (cargo)', 'validosEstado', m.validosEstado, 'inputmode="numeric"')}
      ${field('Abstenção', 'abstencao', m.abstencao, 'inputmode="numeric" placeholder="calcula sozinho"')}
    </div>
  </fieldset>

  <fieldset><legend>Base de votação (CSV) ${isNew ? '*' : '<span class="muted">— envie só se quiser substituir</span>'}</legend>
    <input type="file" name="csv" accept=".csv,.txt,text/csv" ${isNew ? 'required' : ''}>
    <p class="muted small">Colunas: <code>nivel; municipio; zona; bairro; local; secao; votos; pct_validos; colocacao</code> (nível = MUNICIPIO, ZONA, BAIRRO, LOCAL ou SECAO). Também aceita base só por seção, com <code>validos</code> no lugar do percentual. <a href="/admin/modelo.csv">Baixar modelo</a></p>
  </fieldset>

  <fieldset><legend>Textos <span class="muted">— deixe em branco para gerar automaticamente a partir dos dados. Use **texto** para negrito.</span></legend>
    <label>Em uma frase (capa)<textarea name="frase" rows="2">${esc(t.frase || '')}</textarea></label>
    <label>Resumo (abertura da seção 01)<textarea name="resumo" rows="3">${esc(t.resumo || '')}</textarea></label>
    <label>Leitura estratégica — destaque<textarea name="leituraHeadline" rows="2">${esc(t.leituraHeadline || '')}</textarea></label>
    <label>Leitura estratégica — pontos <span class="muted">(1ª linha = título, linhas seguintes = texto; separe os pontos com uma linha em branco)</span><textarea name="leitura" rows="14">${esc(t.leitura || '')}</textarea></label>
  </fieldset>

  <fieldset><legend>Entrega</legend>
    <div class="grid g3">
      ${field('Cliente (uso interno)', 'cliente', m.cliente)}
      ${field('Assinatura', 'assinatura', m.assinatura)}
    </div>
    <label class="chk"><input type="checkbox" name="ativo" ${s.ativo ? 'checked' : ''}> Link ativo</label>
    <label class="chk"><input type="checkbox" name="permitirCsv" ${s.permitirCsv ? 'checked' : ''}> Cliente pode baixar o CSV</label>
    <label class="chk"><input type="checkbox" name="demo" ${s.demo ? 'checked' : ''}> Modelo de prospecção — publica em <code>/exemplo</code> com a faixa "dados fictícios" e o botão de contato</label>
  </fieldset>

  <p id="msg" class="err" hidden></p>
  <div class="actions"><button class="btn" id="save">${isNew ? 'Gerar relatório' : 'Salvar alterações'}</button></div>
</form>`;
  return layout(isNew ? 'Novo relatório' : `Editar · ${m.nome}`, body, { admin: true });
}

function simplePage(title, msg) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="/static/admin.css"></head>
<body class="center"><div class="card msg"><p class="eyebrow">Relatórios de votação</p><h1>${esc(title)}</h1><p>${esc(msg)}</p><p class="muted small">agenciafvx.com</p></div></body></html>`;
}

function homePage(demoUrl, contactUrl) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relatório de votação · agenciafvx</title>
<meta property="og:title" content="Relatório de votação por município, zona, bairro e seção">
<meta property="og:description" content="Entenda de onde vieram os votos do seu candidato. agenciafvx.com">
<link rel="stylesheet" href="/static/admin.css"></head>
<body class="center"><div class="card msg">
  <p class="eyebrow">Relatórios de votação · Eleições 2026</p>
  <h1>De onde vieram os votos do seu candidato</h1>
  <p>Panorama completo por município, zona, bairro, local de votação e seção, com leitura estratégica e a base de dados em planilha.</p>
  <p class="home-acts">${demoUrl ? `<a class="btn" href="${esc(demoUrl)}">Ver relatório de exemplo</a>` : ''}${contactUrl ? ` <a class="btn ghost" href="${esc(contactUrl)}" target="_blank" rel="noopener">Quero o meu</a>` : ''}</p>
  <p class="muted small">Já é cliente? Use o link enviado pela agência. · agenciafvx.com</p>
</div></body></html>`;
}

module.exports = { loginPage, listPage, formPage, simplePage, homePage };
