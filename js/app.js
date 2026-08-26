/* 화면. 판정은 하지 않는다 — Logic 이 낸 결과를 그리기만 한다. */
(function () {
  'use strict';

  var L = window.Logic;
  var store = new window.Store(window.SEED_INDEX || []);

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), form = $('searchForm'), input = $('q'), answer = $('answer');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  /* ── 사양서 한 장 그리기 ─────────────────────────── */
  function renderSheet(rec) {
    var rows = L.sheetRows(rec);
    var warns = L.warnings(rec);
    var html = '<div class="sheet">';
    if (warns.length) {
      html += '<ul class="warns">' + warns.map(function (w) {
        return '<li>' + esc(w) + '</li>';
      }).join('') + '</ul>';
    }
    html += '<div class="sheet-head">' +
            '<div class="t">부품 사양서 (Spec. Sheet)</div>' +
            '<div class="pn">' + esc(rec.partNo) + '</div>' +
            '<div class="nm">' + esc(L.fieldValue(rec, 'name')) + '</div>' +
            '</div><table>';
    rows.forEach(function (r) {
      html += '<tr><th>' + esc(r.title) + '</th>' +
              '<td class="' + (r.state === 'blank' ? 'blank' : '') + '">' +
              esc(r.text) + '</td></tr>';
    });
    html += '</table><div class="sheet-foot">' +
            '<span>원본 파일: ' + esc(rec.file) + '</span>' +
            '<span>시트: ' + esc(rec.sheet) + '</span>' +
            '</div></div>';
    return html;
  }

  /* ── 되묻기 ──────────────────────────────────────── */
  function renderAsk(res) {
    var html = '<div class="msg ask">' + esc(res.message) + '</div>';
    html += '<ul class="choices">';
    res.hits.forEach(function (r) {
      var name = L.fieldValue(r, 'name').split('\n')[0];
      html += '<li><button type="button" data-pn="' + esc(r.partNo) + '">' +
              '<span class="pn">' + esc(r.partNo) + '</span>' +
              '<span class="nm">' + esc(L.shortLabel(r)) + '</span>' +
              '<span class="en">' + esc(name) + '</span>' +
              '</button></li>';
    });
    html += '</ul>';
    return html;
  }

  /* ── 한 번의 검색 ────────────────────────────────── */
  function run(query, opts) {
    var res = L.respond(store.index(), query);
    if (res.kind === 'empty') { answer.innerHTML = ''; stage.classList.add('center'); return; }

    stage.classList.remove('center');
    if (!(opts && opts.silent)) store.record(query, res);

    if (res.kind === 'sheet') answer.innerHTML = renderSheet(res.rec);
    else if (res.kind === 'ask') answer.innerHTML = renderAsk(res);
    else answer.innerHTML = '<div class="msg none">' + esc(res.message) + '</div>';

    renderLog();
  }

  /** 되묻기에서 하나를 고르면 그 품번으로 다시 조회한다.
   *  이것도 기록에 남긴다 — 사람이 실제로 무엇을 골랐는지가 자료다. */
  function pick(partNo) {
    input.value = partNo;
    run(partNo);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── 오늘 검색 기록 ──────────────────────────────── */
  function renderLog() {
    var today = store.today();
    var sum = store.summary();
    var missing = store.missing();

    $('logCount').textContent = String(sum.total);

    $('logSum').innerHTML =
      '오늘 <b>' + sum.total + '</b>번 검색해 <b>' + sum.found + '</b>건을 찾았고, ' +
      '<b>' + sum.none + '</b>건은 사양서가 없었습니다.';

    var mu = $('logMissing');
    if (!missing.length) {
      mu.innerHTML = '<li class="empty">없습니다.</li>';
    } else {
      mu.innerHTML = missing.map(function (m) {
        return '<li><span class="tag r-none">없음</span>' +
               '<span class="q"><button type="button" data-q="' + esc(m.query) + '">' +
               esc(m.query) + '</button></span>' +
               (m.count > 1 ? '<span class="n">' + m.count + '회</span>' : '') + '</li>';
      }).join('');
    }

    var lu = $('logList');
    if (!today.length) {
      lu.innerHTML = '<li class="empty">아직 검색하지 않았습니다.</li>';
    } else {
      lu.innerHTML = today.slice(0, 40).map(function (e) {
        var label = e.result === 'sheet' ? '찾음' : e.result === 'ask' ? '여럿' : '없음';
        /* 'sheet' 를 그대로 클래스로 쓰면 사양서 상자(.sheet)와 이름이 겹친다.
                 * 실제로 그 때문에 '되물을 때 사양서를 펴지 않는다' 검사가 숨어 있던
                 * 기록 태그를 세면서 틀렸다. 상태 이름에는 접두사를 붙인다. */
        return '<li><span class="tag r-' + e.result + '">' + label + '</span>' +
               '<span class="q"><button type="button" data-q="' + esc(e.query) + '">' +
               esc(e.query) + '</button></span>' +
               '<span class="n">' + String(e.at).slice(11, 16) + '</span></li>';
      }).join('');
    }
  }

  /* ── 붙이기 ──────────────────────────────────────── */
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    run(input.value);
  });

  $('examples').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-ex]');
    if (!b) return;
    input.value = b.getAttribute('data-ex');
    run(input.value);
  });

  answer.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-pn]');
    if (b) pick(b.getAttribute('data-pn'));
  });

  $('logBody').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-q]');
    if (!b) return;
    input.value = b.getAttribute('data-q');
    /* 기록에서 다시 눌러 본 것은 새 검색으로 세지 않는다 —
     * 그러면 "오늘 몇 번 찾았나"가 눌러 본 횟수만큼 부풀어 오른다. */
    run(input.value, { silent: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('logTab').addEventListener('click', function () {
    var body = $('logBody'), open = !body.hidden;
    body.hidden = open;
    $('logTab').setAttribute('aria-expanded', String(!open));
  });

  $('btnCopyMissing').addEventListener('click', function () {
    var missing = store.missing();
    if (!missing.length) { toast('등록이 필요한 검색어가 없습니다'); return; }
    var text = '사양서 등록 요청 (' + new Date().toISOString().slice(0, 10) + ')\n' +
      missing.map(function (m) {
        return '- ' + m.query + (m.count > 1 ? ' (' + m.count + '회 검색됨)' : '');
      }).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('복사했습니다 — 생산기술팀에 붙여 넣으세요'); },
        function () { toast('복사하지 못했습니다'); });
    } else {
      toast('이 브라우저에서는 복사를 지원하지 않습니다');
    }
  });

  $('btnClearLog').addEventListener('click', function () {
    if (!window.confirm('오늘 검색 기록을 비웁니다. 계속할까요?')) return;
    store.clearLog();
    renderLog();
    toast('기록을 비웠습니다');
  });

  /* ── 시작 ────────────────────────────────────────── */
  (function boot() {
    var c = store.count();
    $('idxInfo').textContent =
      '색인 ' + c.total + '건 (사양서 ' + c.spec + ' · 그 외 ' + c.other + ')';
    stage.classList.add('center');
    renderLog();
    input.focus();
  }());
}());
