/* 사양서 검색 — 규칙 전부.
 *
 * 화면도 저장소도 모른다. Node 에서 그대로 테스트한다(test/logic.test.js).
 * 엑셀을 읽는 규칙은 여기 없다 — scripts/build_index.py 에 있고
 * test/test_build_index.py 가 따로 고정한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 품번은 6자리-5자리. 12번 프로젝트(6-6)와 다르다 — 옮겨 쓰지 말 것. */
  var PART_NO = /^\d{6}-\d{5}$/;
  var PART_NO_IN = /\d{6}-\d{5}/;

  /* 기획자가 준 문구. 한 글자도 바꾸지 않는다. */
  var NOT_FOUND =
    '저장 되어있는 파일이 없습니다. 내용을 재확인 하거나 생산기술팀에 사양서 등록을 요청 하세요';

  var KIND = { SPEC: 'spec', DESC: 'desc', PURCHASE: 'purchase', UNKNOWN: 'unknown', ERROR: 'error' };

  /* 검색 결과로 내줄 수 있는 문서. 구매목록은 사양서가 아니다(규칙 4). */
  function isSearchable(rec) {
    return !!rec && (rec.kind === KIND.SPEC || rec.kind === KIND.DESC);
  }

  var FIELD_TITLE = {
    partNo: '품번', name: '품명', model: '모델 및 규격', maker: '제조 Maker',
    use: '용도', material: '재질', unit: '구매단위', qtyPerUnit: '단위당 수량',
    origin: '원산지', detail: '상세규격', remark: '비고', bg: 'B G',
    contact: '주문자 연락처'
  };
  /* 화면에 이 순서로 편다. 사양서 종이를 눈으로 훑는 순서와 같게 두었다. */
  var FIELD_ORDER = ['name', 'model', 'maker', 'use', 'material', 'detail',
                     'unit', 'qtyPerUnit', 'origin', 'bg', 'remark', 'contact'];

  /* ── 말끝 다듬기 ────────────────────────────────────────────────
   * 기획자는 "호스 검색해줘", "산소호스 알려줘" 처럼 쓴다고 적었다.
   * 이걸 처리하려고 LLM 을 붙이지 않는다 — API 키가 있어야 도는 시스템은
   * 사내 승인이 날 때까지 아무도 못 쓴다. 꼬리말을 떼는 것으로 충분하다.
   */
  var TAILS = [
    '검색해줘', '검색해 줘', '검색해주세요', '검색해', '검색',
    '알려줘', '알려 줘', '알려주세요', '알려',
    '찾아줘', '찾아 줘', '찾아주세요', '찾아',
    '보여줘', '보여 줘', '보여주세요', '보여',
    '조회해줘', '조회해주세요', '조회',
    '주세요', '해줘', '해주세요', '좀', '요'
  ];
  /* 조사는 낱말 끝에서만 뗀다. '호스를' → '호스' */
  var PARTICLES = ['은', '는', '이', '가', '을', '를', '의', '에', '도'];

  function stripTails(q) {
    var s = String(q == null ? '' : q).trim();
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < TAILS.length; i++) {
        var t = TAILS[i];
        if (s.length > t.length && s.slice(-t.length) === t) {
          s = s.slice(0, -t.length).trim();
          changed = true;
        }
      }
    }
    return s;
  }

  function stripParticle(word) {
    var w = String(word || '');
    /* 한 글자만 남는 경우는 조사를 떼지 않는다 — '이', '가' 자체가 낱말일 수 있다 */
    if (w.length < 3) return w;
    for (var i = 0; i < PARTICLES.length; i++) {
      if (w.slice(-1) === PARTICLES[i]) return w.slice(0, -1);
    }
    return w;
  }

  /** 사용자가 친 말에서 검색어만 남긴다. */
  function normalizeQuery(q) {
    var s = stripTails(q);
    return s.split(/\s+/).filter(Boolean).map(stripParticle).join(' ').trim();
  }

  function isPartNo(q) {
    return PART_NO.test(String(q == null ? '' : q).trim());
  }

  /* ── 검색 ──────────────────────────────────────────────────────── */

  function fieldValue(rec, key) {
    if (key === 'partNo') return rec.partNo || '';
    var f = rec.fields && rec.fields[key];
    return (f && f.value) || '';
  }

  /** 한 건이 검색어를 얼마나 잘 맞추는가. 0 이면 안 맞은 것. */
  function score(rec, terms) {
    if (!isSearchable(rec)) return 0;
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i].toLowerCase();
      if (!t) continue;
      var best = 0;
      if ((rec.partNo || '').toLowerCase().indexOf(t) >= 0) best = 100;
      if (!best && fieldValue(rec, 'name').toLowerCase().indexOf(t) >= 0) best = 40;
      if (!best && fieldValue(rec, 'model').toLowerCase().indexOf(t) >= 0) best = 30;
      if (!best && fieldValue(rec, 'use').toLowerCase().indexOf(t) >= 0) best = 20;
      if (!best) {
        var rest = ['detail', 'maker', 'material', 'remark', 'bg'];
        for (var j = 0; j < rest.length; j++) {
          if (fieldValue(rec, rest[j]).toLowerCase().indexOf(t) >= 0) { best = 10; break; }
        }
      }
      /* 모든 낱말이 맞아야 한다. 하나라도 없으면 이 건은 탈락.
       * '산소 호스' 로 좁히려 한 사람에게 아무 호스나 내주지 않기 위해서다. */
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  function search(index, query) {
    var q = normalizeQuery(query);
    if (!q) return [];
    if (isPartNo(q)) {
      return (index || []).filter(function (r) {
        return isSearchable(r) && r.partNo === q;
      });
    }
    var terms = q.split(/\s+/).filter(Boolean);
    var hits = [];
    (index || []).forEach(function (r) {
      var s = score(r, terms);
      if (s > 0) hits.push({ rec: r, score: s });
    });
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.rec.partNo).localeCompare(String(b.rec.partNo));
    });
    return hits.map(function (h) { return h.rec; });
  }

  /** 되물을 때 쓸 짧은 이름. 사람이 골라야 하므로 알아볼 수 있어야 한다. */
  function shortLabel(rec) {
    var model = fieldValue(rec, 'model').split('\n')[0].trim();
    var name = fieldValue(rec, 'name').split('\n')[0].trim();
    return model || name || rec.partNo || '(이름 없음)';
  }

  /** 후보들을 "A와 B" / "A, B와 C" 로 잇는다. */
  function joinKorean(list) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + '와 ' + list[list.length - 1];
  }

  /* 되묻을 때 이름을 몇 개까지 부를지. 넘으면 개수만 말하고 목록을 보여 준다. */
  var ASK_NAME_LIMIT = 4;

  /**
   * 검색어 하나에 대한 답. 화면은 이 결과를 그리기만 한다.
   *   { kind:'sheet',  rec }             한 건으로 좁혀졌다 → 사양서를 편다
   *   { kind:'ask',    hits, message }   여럿이다 → 고르라고 되묻는다
   *   { kind:'none',   message }         없다 → 기획자가 준 문구
   *   { kind:'empty' }                   빈 입력
   */
  var KIND_LABEL = { purchase: '구매 목록', unknown: '알 수 없는 양식', error: '읽지 못한 파일' };

  /** 검색어에 걸리기는 하는데 사양서가 아닌 문서들. */
  function nonSpecMatches(index, query) {
    var q = normalizeQuery(query);
    if (!q) return [];
    var byPartNo = isPartNo(q);
    var terms = q.split(/\s+/).filter(Boolean);
    return (index || []).filter(function (r) {
      if (isSearchable(r)) return false;
      if (byPartNo) return r.partNo === q;
      var hay = [r.partNo, r.file].join(' ').toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t.toLowerCase()) >= 0; });
    });
  }

  function respond(index, query) {
    var q = normalizeQuery(query);
    if (!q) return { kind: 'empty', query: q };
    var hits = search(index, query);
    if (hits.length === 0) {
      /* 파일은 있는데 사양서가 아닌 경우. 그냥 '없습니다' 라고만 하면
       * 폴더에 파일이 보이는 사람은 시스템이 고장 났다고 생각한다.
       * 무엇이 있는지 말해 주되 사양서로 내주지는 않는다(규칙 4). */
      var others = nonSpecMatches(index, query);
      if (others.length) {
        var what = KIND_LABEL[others[0].kind] || '사양서가 아닌 문서';
        return {
          kind: 'none', query: q, others: others,
          /* 여기서 NOT_FOUND 를 그대로 붙이면 '파일이 있으나 … 파일이 없습니다'
           * 가 되어 서로 모순된다. 뒤쪽 안내만 따로 쓴다. */
          message: '「' + others[0].file + '」 파일이 있으나 ' + what +
                   '이라 사양서로 보여 드릴 수 없습니다. ' +
                   '생산기술팀에 사양서 등록을 요청 하세요'
        };
      }
      return { kind: 'none', query: q, message: NOT_FOUND };
    }
    if (hits.length === 1) return { kind: 'sheet', query: q, rec: hits[0] };

    /* 여럿일 때 하나를 골라 주지 않는다(규칙 6). 고르는 것은 사람이다. */
    var names = hits.slice(0, ASK_NAME_LIMIT).map(shortLabel);
    var msg;
    if (hits.length <= ASK_NAME_LIMIT) {
      msg = '내부에 저장되어 있는 ' + joinKorean(names) + '가 조회 되었습니다. 어떤 걸 찾으시나요?';
    } else {
      msg = hits.length + '건이 조회 되었습니다. 어떤 걸 찾으시나요?';
    }
    return { kind: 'ask', query: q, hits: hits, message: msg };
  }

  /* ── 화면에 펼 때 ──────────────────────────────────────────────── */

  /**
   * 한 항목을 어떻게 보여 줄지. 못 읽은 것을 지어내지 않는다(규칙 5).
   *   filled  → 값
   *   blank   → '(비어 있음)'  사양서에 칸은 있는데 안 적혀 있다
   *   missing → 아예 줄을 그리지 않는다. 이 양식에 없는 항목이다
   */
  function fieldState(rec, key) {
    var f = (rec && rec.fields && rec.fields[key]) || null;
    if (!f || f.state === 'missing') return { show: false, state: 'missing', text: '' };
    if (f.state === 'blank' || !f.value) {
      return { show: true, state: 'blank', text: '(비어 있음)' };
    }
    return { show: true, state: 'filled', text: String(f.value) };
  }

  /** 사양서 한 장을 화면에 펼 순서대로. */
  function sheetRows(rec) {
    var rows = [];
    FIELD_ORDER.forEach(function (key) {
      var st = fieldState(rec, key);
      if (!st.show) return;
      rows.push({ key: key, title: FIELD_TITLE[key], text: st.text, state: st.state });
    });
    return rows;
  }

  /** 이 사양서에 대해 사람에게 알려야 할 경고. */
  function warnings(rec) {
    var out = [];
    if (!rec) return out;
    if (rec.partNoSource === 'conflict') {
      out.push('파일 이름의 품번과 사양서 안의 품번이 서로 다릅니다. ' +
               '어느 쪽이 맞는지 생산기술팀에 확인이 필요합니다.');
    }
    if (rec.partNoSource === 'filename') {
      out.push('사양서 안에 품번이 적혀 있지 않아 파일 이름에서 읽었습니다.');
    }
    if (rec.kind === KIND.DESC) {
      out.push('표준 사양서 양식이 아니라 구형 「부품 설명」 양식입니다. 일부 항목이 없습니다.');
    }
    return out;
  }

  /* ── 개인정보 ──────────────────────────────────────────────────── */

  /**
   * 검색 기록에 남길 때 연락처를 가린다(규칙 9).
   * 기록은 "무엇을 찾았나"를 보려고 남기는 것이지 누구 번호를 모으려는 것이 아니다.
   */
  function maskContact(text) {
    return String(text == null ? '' : text)
      .replace(/(01[016-9])[-. ]?(\d{3,4})[-. ]?(\d{4})/g, '$1-****-$3')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, function (m) {
        var at = m.indexOf('@');
        return m.slice(0, 1) + '***' + m.slice(at);
      });
  }

  /* ── 오늘 검색 기록 ────────────────────────────────────────────── */

  function dayOf(iso) {
    return String(iso || '').slice(0, 10);
  }

  /** 오늘 것만 남긴다(규칙 10). 최근 것이 위로. */
  function todayLog(log, todayIso) {
    var today = dayOf(todayIso);
    return (log || [])
      .filter(function (e) { return dayOf(e.at) === today; })
      .slice()
      .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }

  /** 못 찾은 검색어를 모은다 — 등록해야 할 사양서 목록이다.
   *
   * **많이 찾은 것이 위로** 온다. 최근 순으로 두면 방금 한 번 친 오타가
   * 맨 위에 오고, 여러 사람이 하루 종일 찾은 부품이 아래로 밀린다.
   * 이 목록은 생산기술팀이 무엇부터 등록할지 정하는 데 쓰인다.
   */
  function missingQueries(log, todayIso) {
    var seen = {};
    var out = [];
    todayLog(log, todayIso).forEach(function (e) {
      if (e.result !== 'none') return;
      var q = e.query;
      if (seen[q]) {
        seen[q].count += 1;
        /* at 은 가장 최근 시각으로 둔다 — todayLog 가 내림차순이므로 첫 번째가 최근 */
        return;
      }
      seen[q] = { query: q, count: 1, at: e.at };
      out.push(seen[q]);
    });
    out.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.at).localeCompare(String(a.at));
    });
    return out;
  }

  function summarize(log, todayIso) {
    var t = todayLog(log, todayIso);
    var found = 0, none = 0, ask = 0;
    t.forEach(function (e) {
      if (e.result === 'sheet') found += 1;
      else if (e.result === 'none') none += 1;
      else if (e.result === 'ask') ask += 1;
    });
    return { total: t.length, found: found, none: none, ask: ask };
  }

  return {
    PART_NO: PART_NO, PART_NO_IN: PART_NO_IN, NOT_FOUND: NOT_FOUND,
    KIND: KIND, FIELD_TITLE: FIELD_TITLE, FIELD_ORDER: FIELD_ORDER,
    ASK_NAME_LIMIT: ASK_NAME_LIMIT,
    isPartNo: isPartNo, isSearchable: isSearchable,
    normalizeQuery: normalizeQuery, stripTails: stripTails, stripParticle: stripParticle,
    score: score, search: search, respond: respond, nonSpecMatches: nonSpecMatches,
    shortLabel: shortLabel, joinKorean: joinKorean,
    fieldValue: fieldValue, fieldState: fieldState, sheetRows: sheetRows, warnings: warnings,
    maskContact: maskContact,
    todayLog: todayLog, missingQueries: missingQueries, summarize: summarize
  };
}));
