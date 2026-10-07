(function () {
  'use strict';
  var root = document.querySelector('.explorer');
  if (!root) return;

  var PAGE = 50;
  var data = null;
  var state = { lvl: null, q: '', sort: null, dir: -1, page: 0 };

  function fmtInt(n) { return n == null ? '–' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function fmtPct(n) { return n == null ? '–' : n.toFixed(2).replace('.', ',') + '%'; }
  function fmt(v, type) {
    if (type === 'int') return fmtInt(v);
    if (type === 'pct') return fmtPct(v);
    if (type === 'ord') return v == null ? '–' : v + 'º';
    return v == null ? '' : String(v);
  }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  var tabs, input, table, pager;

  function build() {
    root.textContent = '';
    var bar = el('div', { class: 'ex-bar' });
    tabs = el('div', { class: 'ex-tabs', role: 'tablist' });
    Object.keys(data).forEach(function (lvl) {
      var b = el('button', { type: 'button', role: 'tab', 'data-lvl': lvl }, data[lvl].label + ' (' + fmtInt(data[lvl].rows.length) + ')');
      b.addEventListener('click', function () { select(lvl); });
      tabs.appendChild(b);
    });
    input = el('input', { type: 'search', placeholder: 'Filtrar por município, bairro, local, zona…', 'aria-label': 'Filtrar' });
    input.addEventListener('input', function () { state.q = norm(input.value.trim()); state.page = 0; draw(); });
    bar.appendChild(tabs);
    bar.appendChild(input);
    var tw = el('div', { class: 'tw' });
    table = el('table', { class: 't' });
    tw.appendChild(table);
    pager = el('div', { class: 'ex-pager' });
    root.appendChild(bar);
    root.appendChild(tw);
    root.appendChild(pager);
    select(Object.keys(data)[0]);
  }

  function select(lvl) {
    state.lvl = lvl; state.sort = null; state.dir = -1; state.page = 0;
    [].forEach.call(tabs.children, function (b) { b.setAttribute('aria-selected', b.getAttribute('data-lvl') === lvl ? 'true' : 'false'); });
    draw();
  }

  function draw() {
    var d = data[state.lvl];
    var rows = d.rows;
    if (state.q) {
      var textCols = d.cols.map(function (c, i) { return c.type ? -1 : i; }).filter(function (i) { return i >= 0; });
      rows = rows.filter(function (r) {
        for (var j = 0; j < textCols.length; j++) if (norm(r[textCols[j]]).indexOf(state.q) !== -1) return true;
        return false;
      });
    }
    if (state.sort != null) {
      var i = state.sort, dir = state.dir;
      rows = rows.slice().sort(function (a, b) {
        var x = a[i], y = b[i];
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * dir;
      });
    }
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);

    table.textContent = '';
    var thead = el('thead'), tr = el('tr');
    d.cols.forEach(function (c, idx) {
      var cls = 'sortable' + (c.type ? ' num' : '') + (state.sort === idx ? (state.dir > 0 ? ' asc' : ' desc') : '');
      var th = el('th', { class: cls }, c.label);
      th.addEventListener('click', function () {
        if (state.sort === idx) state.dir = -state.dir;
        else { state.sort = idx; state.dir = c.type === 'int' || c.type === 'pct' ? -1 : 1; }
        state.page = 0; draw();
      });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = el('tbody');
    slice.forEach(function (r) {
      var row = el('tr');
      d.cols.forEach(function (c, idx) {
        var td = el('td', { class: (c.type ? 'num' : '') + (c.type === 'ord' && r[idx] === 1 ? ' first' : '') }, fmt(r[idx], c.type));
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    pager.textContent = '';
    var info = el('span', null, rows.length ? (fmtInt(state.page * PAGE + 1) + '–' + fmtInt(state.page * PAGE + slice.length) + ' de ' + fmtInt(rows.length)) : 'Nada encontrado');
    var nav = el('span');
    var prev = el('button', { type: 'button' }, '← Anterior');
    var next = el('button', { type: 'button' }, 'Próxima →');
    prev.disabled = state.page === 0;
    next.disabled = state.page >= pages - 1;
    prev.addEventListener('click', function () { state.page--; draw(); });
    next.addEventListener('click', function () { state.page++; draw(); });
    nav.appendChild(prev); nav.appendChild(document.createTextNode(' ')); nav.appendChild(next);
    pager.appendChild(info);
    pager.appendChild(nav);
  }

  fetch(root.getAttribute('data-src'), { credentials: 'same-origin' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { data = d; if (Object.keys(d).length) build(); else root.textContent = 'Sem dados.'; })
    .catch(function () { root.textContent = 'Não foi possível carregar a base. Recarregue a página.'; });
})();
