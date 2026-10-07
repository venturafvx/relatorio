'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const DIRS = {
  meta: path.join(DATA_DIR, 'reports'),
  rows: path.join(DATA_DIR, 'rows'),
  csv: path.join(DATA_DIR, 'csv'),
};
for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });

const ID_RE = /^[a-z0-9-]{8,120}$/;
const validId = (id) => ID_RE.test(String(id || ''));

function writeAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function get(id) {
  return validId(id) ? readJSON(path.join(DIRS.meta, id + '.json')) : null;
}

function getRows(id) {
  return validId(id) ? readJSON(path.join(DIRS.rows, id + '.json')) || [] : [];
}

function csvPath(id) {
  return validId(id) ? path.join(DIRS.csv, id + '.csv') : null;
}

function list() {
  return fs.readdirSync(DIRS.meta)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJSON(path.join(DIRS.meta, f)))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function save(report, rows, csvText) {
  if (!validId(report.id)) throw new Error('id inválido');
  if (rows) writeAtomic(path.join(DIRS.rows, report.id + '.json'), JSON.stringify(rows));
  if (csvText != null) writeAtomic(path.join(DIRS.csv, report.id + '.csv'), csvText);
  writeAtomic(path.join(DIRS.meta, report.id + '.json'), JSON.stringify(report, null, 2));
}

function remove(id) {
  if (!validId(id)) return;
  for (const [k, dir] of Object.entries(DIRS)) {
    try { fs.unlinkSync(path.join(dir, id + (k === 'csv' ? '.csv' : '.json'))); } catch {}
  }
}

module.exports = { get, getRows, csvPath, list, save, remove, validId, DATA_DIR };
