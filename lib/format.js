'use strict';

function fmtInt(n) {
  if (n == null || isNaN(n)) return '–';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function fmtPct(n, d = 2) {
  if (n == null || isNaN(n)) return '–';
  return n.toFixed(d).replace('.', ',') + '%';
}

function fmtOrd(n) {
  return n ? n + 'º' : '–';
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
}

// Texto livre do admin: escapa HTML e aceita **negrito**.
function rich(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function listPt(arr) {
  if (arr.length <= 1) return arr.join('');
  return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
}

function normName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(s) {
  return normName(s).replace(/ /g, '-').slice(0, 60);
}

module.exports = { fmtInt, fmtPct, fmtOrd, esc, rich, listPt, normName, slugify };
