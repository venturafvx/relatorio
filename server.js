'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Carrega o .env (sem dependências).
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const mt = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (mt && process.env[mt[1]] === undefined) process.env[mt[1]] = mt[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

const store = require('./lib/store');
const { parseCSV } = require('./lib/csv');
const { rowsFromTable, analyze, UserError } = require('./lib/analyze');
const { fillDefaults } = require('./lib/texts');
const { render, buildData } = require('./lib/render-report');
const adminView = require('./lib/render-admin');
const { slugify } = require('./lib/format');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
// Link do botão "Quero o meu relatório" no modelo (ex.: https://wa.me/5522999999999?text=...)
const CONTACT_URL = process.env.CONTACT_URL || 'https://agenciafvx.com';
let SECRET = process.env.SESSION_SECRET;
if (!ADMIN_PASSWORD) {
  console.error('Defina ADMIN_PASSWORD no arquivo .env');
  process.exit(1);
}
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET não definido: os logins expiram a cada reinício.');
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8' };
const SESSION_DAYS = 30;

// ---------- utilidades HTTP ----------
function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra,
  });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
const redirect = (res, to, extra = {}) => send(res, 303, '', 'text/plain', { Location: to, ...extra });

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new UserError('Arquivo grande demais (limite 40 MB).')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function baseUrl(req) {
  if (BASE_URL) return BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

function clientIp(req) {
  return req.headers['x-real-ip'] || req.socket.remoteAddress || '';
}

// ---------- sessão (cookie assinado, sem estado no servidor) ----------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');

function makeSession() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return exp + '.' + sign(exp);
}

function isAdmin(req) {
  const mt = (req.headers.cookie || '').match(/(?:^|;\s*)sess=([^;]+)/);
  if (!mt) return false;
  const [exp, sig] = mt[1].split('.');
  if (!exp || !sig) return false;
  const good = sign(exp);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}

function cookie(req, value, maxAge) {
  const secure = BASE_URL.startsWith('https') || req.headers['x-forwarded-proto'] === 'https';
  return `sess=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function passwordOk(input) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

const attempts = new Map();
function tooManyAttempts(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.first > 15 * 60e3) { attempts.delete(ip); return false; }
  return a.count >= 8;
}
function failAttempt(ip) {
  const a = attempts.get(ip) || { count: 0, first: Date.now() };
  a.count++;
  attempts.set(ip, a);
}

// ---------- relatórios ----------
const findDemo = () => store.list().find((r) => r.settings && r.settings.demo) || null;

const modelCache = new Map();
function getModel(report) {
  const key = report.id + '@' + report.updatedAt;
  let m = modelCache.get(key);
  if (!m) {
    for (const k of modelCache.keys()) if (k.startsWith(report.id + '@')) modelCache.delete(k);
    m = analyze(store.getRows(report.id), report.meta);
    modelCache.set(key, m);
  }
  return m;
}

const META_KEYS = ['nome', 'partido', 'numero', 'cargo', 'uf', 'genero', 'ano', 'turno', 'dataDados', 'colocacaoEstado', 'situacao', 'aptos', 'comparecimento', 'validosEstado', 'abstencao', 'cliente', 'assinatura'];
const NUM_KEYS = new Set(['colocacaoEstado', 'aptos', 'comparecimento', 'validosEstado', 'abstencao']);
const TEXT_KEYS = ['frase', 'resumo', 'leituraHeadline', 'leitura'];

function cleanMeta(input) {
  const meta = {};
  for (const k of META_KEYS) {
    let v = String((input && input[k]) || '').trim().slice(0, 300);
    if (NUM_KEYS.has(k)) v = v.replace(/[^\d]/g, '');
    meta[k] = v;
  }
  meta.uf = meta.uf.toUpperCase();
  if (!meta.nome) throw new UserError('Informe o nome do candidato.');
  if (!meta.cargo) throw new UserError('Informe o cargo.');
  return meta;
}

function cleanTexts(input) {
  const t = {};
  for (const k of TEXT_KEYS) t[k] = String((input && input[k]) || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
  return t;
}

function newId(meta) {
  const base = slugify([meta.nome, meta.numero].filter(Boolean).join(' ')) || 'relatorio';
  return `${base}-${crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8).padEnd(8, '0')}`;
}

function parseUpload(csvText) {
  const { rows, skipped } = rowsFromTable(parseCSV(csvText));
  return { rows, skipped };
}

async function saveReport(req, res, existing) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError('Requisição inválida.');
  }
  const meta = cleanMeta(body.meta);
  let rows = null;
  let skipped = 0;
  const csvText = typeof body.csv === 'string' && body.csv.trim() ? body.csv : null;
  if (csvText) ({ rows, skipped } = parseUpload(csvText));
  else if (!existing) throw new UserError('Envie o arquivo CSV com a votação.');

  const now = new Date().toISOString();
  const report = existing ? { ...existing } : { id: newId(meta), createdAt: now, stats: { views: 0, lastView: null } };
  report.meta = meta;
  const st = body.settings || {};
  report.settings = { ativo: !!st.ativo, permitirCsv: !!st.permitirCsv, demo: !!st.demo };
  // Só um relatório pode ser o modelo público em /exemplo.
  if (report.settings.demo) {
    for (const other of store.list()) {
      if (other.id !== report.id && other.settings && other.settings.demo) { other.settings.demo = false; store.save(other); }
    }
  }
  report.updatedAt = now;

  const model = analyze(rows || store.getRows(report.id), meta);
  if (!model.total) throw new UserError('O CSV não tem votos por município.');
  report.texts = fillDefaults(cleanTexts(body.texts), model, meta);
  store.save(report, rows, csvText);
  json(res, 200, { id: report.id, skipped });
}

// ---------- rotas ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  // HEAD é respondido como GET (o Node omite o corpo); usado por prévias de link.
  const method = req.method === 'HEAD' ? 'GET' : req.method;

  if (method === 'GET' && p.startsWith('/static/')) {
    const file = path.normalize(path.join(PUBLIC_DIR, p.slice(8)));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Não encontrado', 'text/plain');
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'public, max-age=3600' });
  }
  if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n', 'text/plain');
  if (p === '/favicon.ico') return send(res, 204, '', 'text/plain');
  if (p === '/') {
    const demo = findDemo();
    return send(res, 200, adminView.homePage(demo && demo.settings.ativo ? '/exemplo' : null, CONTACT_URL));
  }

  // Relatório público (/r/<id>) ou o modelo de prospecção (/exemplo)
  const ex = p.match(/^\/exemplo(\/dados\.json|\/csv)?\/?$/);
  let mt = ex ? [p, (findDemo() || {}).id || '-', ex[1]] : p.match(/^\/r\/([a-z0-9-]+)(\/dados\.json|\/csv)?\/?$/);
  if (mt && method === 'GET') {
    const report = store.get(mt[1]);
    const admin = isAdmin(req);
    if (!report || (!report.settings.ativo && !admin)) {
      return send(res, 404, adminView.simplePage('Relatório indisponível', 'Este link não existe ou foi desativado. Fale com a agência para obter um novo acesso.'));
    }
    const base = ex ? '/exemplo' : `/r/${report.id}`;
    if (mt[2] === '/dados.json') {
      return send(res, 200, JSON.stringify(buildData(getModel(report))), 'application/json; charset=utf-8', { 'Cache-Control': 'private, max-age=300' });
    }
    if (mt[2] === '/csv') {
      const file = store.csvPath(report.id);
      if (!report.settings.permitirCsv && !admin) return send(res, 403, 'Download não liberado', 'text/plain');
      if (!file || !fs.existsSync(file)) return send(res, 404, 'Não encontrado', 'text/plain');
      const name = `${slugify(report.meta.nome)}_${report.meta.numero || ''}_votacao_${report.meta.uf}_${report.meta.ano}.csv`.replace(/_+/g, '_');
      return send(res, 200, fs.readFileSync(file), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${name}"` });
    }
    if (!admin && req.method === 'GET') {
      report.stats = report.stats || { views: 0 };
      report.stats.views = (report.stats.views || 0) + 1;
      report.stats.lastView = new Date().toISOString();
      store.save(report);
    }
    const html = render(report, getModel(report), {
      dataUrl: base + '/dados.json',
      csvUrl: report.settings.permitirCsv || admin ? base + '/csv' : null,
      contactUrl: CONTACT_URL,
    });
    return send(res, 200, html, undefined, { 'Cache-Control': 'private, no-cache' });
  }

  // Admin: login
  if (p === '/admin/login' && method === 'POST') {
    const ip = clientIp(req);
    if (tooManyAttempts(ip)) return send(res, 429, adminView.loginPage('Muitas tentativas. Aguarde 15 minutos.'));
    const pw = new URLSearchParams(await readBody(req, 10000)).get('password') || '';
    if (!passwordOk(pw)) { failAttempt(ip); return send(res, 401, adminView.loginPage('Senha incorreta.')); }
    attempts.delete(ip);
    return redirect(res, '/admin', { 'Set-Cookie': cookie(req, makeSession(), SESSION_DAYS * 86400) });
  }
  if (p === '/admin/logout' && method === 'POST') {
    return redirect(res, '/admin', { 'Set-Cookie': cookie(req, '', 0) });
  }

  if (p.startsWith('/admin') || p.startsWith('/api/')) {
    if (!isAdmin(req)) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'Sessão expirada. Entre novamente.' });
      return send(res, 200, adminView.loginPage());
    }
    const noStore = { 'Cache-Control': 'no-store' };
    if (method === 'GET' && (p === '/admin' || p === '/admin/')) {
      return send(res, 200, adminView.listPage(store.list(), baseUrl(req)), undefined, noStore);
    }
    if (method === 'GET' && p === '/admin/novo') return send(res, 200, adminView.formPage(null, null, baseUrl(req)), undefined, noStore);
    if (method === 'GET' && p === '/admin/modelo.csv') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'exemplo', 'modelo.csv')), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="modelo.csv"' });
    }
    mt = p.match(/^\/admin\/r\/([a-z0-9-]+)$/);
    if (method === 'GET' && mt) {
      const report = store.get(mt[1]);
      if (!report) return send(res, 404, adminView.simplePage('Não encontrado', 'Relatório não existe.'));
      const flash = url.searchParams.get('ok') === '1' ? 'Relatório salvo.' : '';
      return send(res, 200, adminView.formPage(report, getModel(report), baseUrl(req), flash), undefined, noStore);
    }

    // API (JSON). Exigir Content-Type JSON + mesma origem bloqueia CSRF.
    if (p.startsWith('/api/')) {
      const origin = req.headers.origin;
      let originHost = null;
      try { originHost = origin ? new URL(origin).host : req.headers.host; } catch {}
      if (originHost !== req.headers.host) return json(res, 403, { error: 'Origem inválida.' });
      if (method !== 'DELETE' && !String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'Use JSON.' });
      if (method === 'POST' && p === '/api/reports') return saveReport(req, res, null);
      mt = p.match(/^\/api\/reports\/([a-z0-9-]+)(\/toggle)?$/);
      const report = mt && store.get(mt[1]);
      if (!report) return json(res, 404, { error: 'Relatório não encontrado.' });
      if (method === 'PUT' && !mt[2]) return saveReport(req, res, report);
      if (method === 'POST' && mt[2]) {
        report.settings.ativo = !report.settings.ativo;
        store.save(report);
        return json(res, 200, { ativo: report.settings.ativo });
      }
      if (method === 'DELETE' && !mt[2]) {
        store.remove(report.id);
        return json(res, 200, { ok: true });
      }
    }
  }

  send(res, 404, adminView.simplePage('Página não encontrada', 'Verifique o endereço.'));
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    if (e instanceof UserError) {
      if (!res.headersSent) json(res, 400, { error: e.message });
      return;
    }
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Erro interno', 'text/plain');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Relatórios rodando em http://${HOST}:${PORT} (dados em ${store.DATA_DIR})`);
});
