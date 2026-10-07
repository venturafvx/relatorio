(function () {
  'use strict';

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Link copiado'); });
    } else {
      window.prompt('Copie o link:', text);
    }
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'Erro ' + r.status);
        return j;
      });
    });
  }

  // Ações da lista e da caixa de link
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var tr = b.closest('tr[data-id]');
    var id = tr && tr.getAttribute('data-id');
    if (act === 'copy') copy(b.getAttribute('data-url'));
    if (act === 'toggle' && id) {
      api('POST', '/api/reports/' + id + '/toggle', {}).then(function (j) {
        b.className = 'pill ' + (j.ativo ? 'on' : 'off');
        b.textContent = j.ativo ? 'Ativo' : 'Desativado';
      }).catch(function (err) { alert(err.message); });
    }
    if (act === 'delete' && id) {
      if (!confirm('Excluir o relatório de ' + b.getAttribute('data-name') + '? O link deixa de funcionar e não há como desfazer.')) return;
      api('DELETE', '/api/reports/' + id).then(function () { tr.remove(); toast('Relatório excluído'); })
        .catch(function (err) { alert(err.message); });
    }
  });

  // Lê o CSV no navegador; se não for UTF-8 válido, relê como Latin-1 (padrão do TSE).
  function readFile(file) {
    function read(enc) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
        fr.readAsText(file, enc);
      });
    }
    return read('utf-8').then(function (txt) {
      return txt.indexOf('�') === -1 ? txt : read('windows-1252');
    });
  }

  var form = document.getElementById('rform');
  if (!form) return;
  var msg = document.getElementById('msg');
  var btn = document.getElementById('save');
  var META = ['nome', 'partido', 'numero', 'cargo', 'uf', 'genero', 'ano', 'turno', 'dataDados', 'colocacaoEstado', 'situacao', 'aptos', 'comparecimento', 'validosEstado', 'abstencao', 'cliente', 'assinatura'];
  var TEXTS = ['frase', 'resumo', 'leituraHeadline', 'leitura'];

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.hidden = true;
    var id = form.getAttribute('data-id');
    var payload = { meta: {}, texts: {}, settings: { ativo: form.ativo.checked, permitirCsv: form.permitirCsv.checked, demo: form.demo.checked } };
    META.forEach(function (k) { payload.meta[k] = form.elements[k].value; });
    TEXTS.forEach(function (k) { payload.texts[k] = form.elements[k].value; });
    var file = form.csv.files[0];
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Processando…';
    (file ? readFile(file) : Promise.resolve(null))
      .then(function (csv) {
        payload.csv = csv;
        return api(id ? 'PUT' : 'POST', id ? '/api/reports/' + id : '/api/reports', payload);
      })
      .then(function (j) { location.href = '/admin/r/' + j.id + '?ok=1'; })
      .catch(function (err) {
        msg.textContent = err.message;
        msg.hidden = false;
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.disabled = false;
        btn.textContent = label;
      });
  });
})();
