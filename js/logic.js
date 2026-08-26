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

  /* ── 동의어 · 현장 용어 ────────────────────────────────────────
   *
   * 사양서의 품명은 영문이고(`HOSE,GAS;OXYGEN TWIN`) 찾는 사람은 한글로 친다.
   * 용도 칸에 한글이 있어 걸리는 경우가 많지만, 용도가 비어 있으면 못 찾는다.
   *
   * 오타도 실제로 들어 있다 — 실제 사양서에 `호일제단`(재단), `단품도장장`
   * 이 그대로 적혀 있었다. 원본을 고치지 않는다는 원칙을 지키면서 찾히게
   * 하려면, 고치는 대신 **같은 말로 취급**하는 수밖에 없다.
   *
   * 이 표는 손으로 채운다. 무엇을 채울지는 「못 찾은 검색어」 목록이 알려 준다.
   * AI 로 자동 생성하지 않는 이유는, 틀린 동의어가 들어가면 엉뚱한 사양서가
   * 검색되고 그것을 아무도 눈치채지 못하기 때문이다.
   */
  var SYNONYMS = [
    ['호스', 'hose'],
    ['앵글', 'angle', 'ㄱ형강', '기역형강'],
    ['평철', 'flat bar', 'flatbar', '플랫바'],
    ['철판', 'plate', '강판'],
    ['자석', 'magnet', '마그넷'],
    ['고무', 'rubber'],
    ['우레탄', 'urethane'],
    ['스티커', 'sticker', '라벨'],
    ['필터', 'filter'],
    ['브러시', 'brush', '브러쉬'],
    ['패드', 'pad'],
    ['창', 'window', '투시창'],
    ['작업대', 'table', '테이블'],
    ['송신기', 'remocon', 'transmitter', '리모컨'],
    ['연료', 'fuel'],
    ['산소', 'oxygen'],
    ['공기', 'air', '에어'],
    /* 실제 사양서에 있던 오타. 고치지 않고 같은 말로 본다. */
    ['재단', '제단'],
    ['도장', '도장장']
  ];

  /** 낱말 하나를 같은 뜻의 낱말들로 넓힌다. 자기 자신은 항상 포함한다. */
  function expandTerm(term) {
    var t = String(term == null ? '' : term).trim().toLowerCase();
    if (!t) return [];
    var out = [t];
    for (var i = 0; i < SYNONYMS.length; i++) {
      var group = SYNONYMS[i];
      var hit = group.some(function (w) {
        return t === w || (t.length > 1 && t.indexOf(w) >= 0) ||
               (w.length > 1 && w.indexOf(t) >= 0);
      });
      if (!hit) continue;
      group.forEach(function (w) { if (out.indexOf(w) < 0) out.push(w); });
    }
    return out;
  }

  /* ── 검색 ──────────────────────────────────────────────────────── */

  function fieldValue(rec, key) {
    if (key === 'partNo') return rec.partNo || '';
    var f = rec.fields && rec.fields[key];
    return (f && f.value) || '';
  }

  /* 어느 칸에서 맞았는지에 따라 점수가 다르다. 품번 > 품명 > 모델 > 용도 > 나머지 */
  var FIELD_WEIGHT = [
    { key: 'partNo', score: 100, title: '품번' },
    { key: 'name',   score: 40,  title: '품명' },
    { key: 'model',  score: 30,  title: '모델·규격' },
    { key: 'use',    score: 20,  title: '용도' },
    { key: 'detail', score: 10,  title: '상세규격' },
    { key: 'maker',  score: 10,  title: '제조사' },
    { key: 'material', score: 10, title: '재질' },
    { key: 'remark', score: 5,   title: '비고' },
    { key: 'bg',     score: 5,   title: 'B G' }
  ];

  /**
   * 한 낱말이 이 사양서의 어느 칸에서 맞았는지 찾는다.
   * 맞은 칸과 **실제로 맞은 글자**를 함께 돌려준다 — 그것이 「선택 이유」가 된다.
   * 이유를 지어내지 않고 판정에 쓴 근거를 그대로 적는 것이 핵심이다.
   */
  function matchTerm(rec, term, words) {
    words = words || [String(term == null ? '' : term).trim().toLowerCase()];
    for (var i = 0; i < FIELD_WEIGHT.length; i++) {
      var f = FIELD_WEIGHT[i];
      var hay = (f.key === 'partNo' ? (rec.partNo || '') : fieldValue(rec, f.key)).toLowerCase();
      if (!hay) continue;
      for (var j = 0; j < words.length; j++) {
        if (hay.indexOf(words[j]) >= 0) {
          return { field: f.key, title: f.title, score: f.score,
                   word: words[j], viaSynonym: words[j] !== String(term).toLowerCase() };
        }
      }
    }
    return null;
  }

  /** 한 건이 검색어를 얼마나 잘 맞추는가. 0 이면 안 맞은 것. */
  function score(rec, terms, wordSets) {
    if (!isSearchable(rec)) return 0;
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var m = matchTerm(rec, terms[i], wordSets && wordSets[i]);
      /* 모든 낱말이 맞아야 한다. 하나라도 없으면 이 건은 탈락.
       * '산소 호스' 로 좁히려 한 사람에게 아무 호스나 내주지 않기 위해서다. */
      if (!m) return 0;
      total += m.score;
    }
    return total;
  }

  /**
   * 왜 이 사양서가 나왔는지. 화면의 「선택 이유」 칸에 그대로 들어간다.
   * 판정에 쓴 근거이므로 설명과 실제 동작이 어긋날 수 없다.
   */
  /**
   * 낱말마다 동의어를 쓸지 정한다.
   *
   * **적은 대로 찾아서 나오는 게 있으면 넓히지 않는다.** 이게 없으면
   * `산소호스` 가 `호스` 로 넓혀져 온갖 호스가 다 나온다 — 좁히려고
   * 길게 친 사람에게 정반대로 답하는 셈이다. 실제로 그렇게 만들었다가
   * 기획서의 「산소호스 알려줘 → 한 건」 이 4건으로 늘어난 것을 보고 고쳤다.
   *
   * 동의어는 **못 찾았을 때의 마지막 수단**이다.
   */
  function wordSetsFor(index, terms) {
    return terms.map(function (t) {
      var literal = [String(t).trim().toLowerCase()];
      var found = (index || []).some(function (r) {
        return isSearchable(r) && matchTerm(r, t, literal);
      });
      return found ? literal : expandTerm(t);
    });
  }

  function matchReasons(rec, query, index) {
    var q = normalizeQuery(query);
    if (isPartNo(q)) return ['품번이 정확히 일치합니다'];
    var terms = q.split(/\s+/).filter(Boolean);
    var sets = wordSetsFor(index, terms);
    var out = [];
    terms.forEach(function (t, i) {
      var m = matchTerm(rec, t, sets[i]);
      if (!m) return;
      var via = m.viaSynonym ? ' (같은 말: ' + m.word + ')' : '';
      out.push(m.title + '에 「' + t + '」' + via);
    });
    return out;
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
    var sets = wordSetsFor(index, terms);
    var hits = [];
    (index || []).forEach(function (r) {
      var s = score(r, terms, sets);
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

  /* 한 번에 보여 줄 최대 건수. 기획서 요구(최대 5개). */
  var TABLE_LIMIT = 5;

  /** 표 한 줄. 기획서가 요구한 칸 그대로 — 품번·품명·규격·메이커·용도·선택 이유 */
  function resultRow(rec, query, index) {
    return {
      partNo: rec.partNo,
      name: fieldValue(rec, 'name').split('\n')[0],
      model: fieldValue(rec, 'model').split('\n')[0],
      maker: fieldValue(rec, 'maker'),
      use: fieldValue(rec, 'use').replace(/\s*\n+\s*/g, ' ').trim(),
      reasons: matchReasons(rec, query, index),
      rec: rec
    };
  }

  function resultRows(hits, query, index, limit) {
    var n = limit || TABLE_LIMIT;
    return hits.slice(0, n).map(function (r) { return resultRow(r, query, index); });
  }

  /**
   * 못 찾았을 때 대신 쳐 볼 말을 제안한다(기획서 Format 5).
   *
   * 지어내지 않는다. **색인에 실제로 있는 말만** 제안한다 —
   * 없는 말을 권하면 두 번 헛걸음시킨다.
   */
  function suggestions(index, query, limit) {
    var q = normalizeQuery(query);
    if (!q) return [];
    var terms = q.split(/\s+/).filter(Boolean);
    var out = [];

    /* 권할 말인지 판정할 때 **검색과 똑같은 규칙**을 쓴다.
     * 글자 그대로만 맞춰 보면 '평철' 을 권하지 못하고 'flat bar' 를 권한다 —
     * 실제로는 '평철' 로 검색하면 나오는데도. 두 규칙이 어긋나면
     * 시스템이 자기가 찾을 수 있는 말을 권하지 못한다. */
    function works(w) {
      if (!w || w.length < 2 || out.indexOf(w) >= 0) return false;
      if (search(index, w).length === 0) return false;
      out.push(w);
      return true;
    }

    terms.forEach(function (t) {
      /* ① 이 낱말 하나만 쳐도 나오는가.
       *    '건조기 필터' 가 안 나온 것은 '건조기' 때문이지 '필터' 때문이 아니다. */
      if (terms.length > 1 && works(t)) return;
      /* ② 붙여 친 말을 짧게 잘라 본다 — '호일재단' → '호일' */
      for (var len = t.length - 1; len >= 2; len--) {
        if (works(t.slice(0, len))) return;
      }
      for (var st = 1; st <= t.length - 2; st++) {
        if (works(t.slice(st))) return;
      }
    });
    return out.slice(0, limit || 4);
  }

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
      return { kind: 'none', query: q, message: NOT_FOUND,
               suggest: suggestions(index, query) };
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
    return {
      kind: 'ask', query: q, hits: hits, message: msg,
      rows: resultRows(hits, query, index),
      shown: Math.min(hits.length, TABLE_LIMIT),
      more: Math.max(0, hits.length - TABLE_LIMIT)
    };
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

  /* ── 최신화 — 새 사양서와 기존 색인을 견준다 ──────────────────
   *
   * 색인을 다시 만들 때마다 무엇이 달라졌는지 알아야 한다.
   * "뭔가 바뀐 것 같다"가 아니라 **어느 칸이 무엇에서 무엇으로** 바뀌었는지
   * 말할 수 있어야, 그 변경이 맞는지 사람이 판단할 수 있다.
   *
   * 파일을 기준으로 견준다. 품번은 어긋날 수 있지만(파일명 ↔ 내용)
   * 폴더 안에서 한 파일은 하나다.
   */
  var COMPARE_FIELDS = ['name', 'model', 'maker', 'use', 'material',
                        'unit', 'qtyPerUnit', 'origin', 'detail', 'remark', 'bg'];

  function byFile(index) {
    var m = {};
    (index || []).forEach(function (r) { if (r && r.file) m[r.file] = r; });
    return m;
  }

  /**
   * 한 건이 어떻게 달라졌는지. 빈 배열이면 같은 것이다.
   * 값이 길면 잘라 적는다 — 표에 넣어야 하기 때문이다.
   */
  function diffRecord(before, after) {
    var out = [];
    function cut(v) {
      v = String(v == null ? '' : v).replace(/\s*\n+\s*/g, ' ').trim();
      return v.length > 40 ? v.slice(0, 40) + '…' : v;
    }
    if (before.partNo !== after.partNo) {
      out.push({ field: 'partNo', title: '품번', from: before.partNo, to: after.partNo });
    }
    if (before.kind !== after.kind) {
      out.push({ field: 'kind', title: '문서 종류', from: before.kind, to: after.kind });
    }
    COMPARE_FIELDS.forEach(function (k) {
      var a = (before.fields && before.fields[k]) || { value: '', state: 'missing' };
      var b = (after.fields && after.fields[k]) || { value: '', state: 'missing' };
      if (a.value === b.value && a.state === b.state) return;
      out.push({ field: k, title: FIELD_TITLE[k] || k,
                 from: cut(a.value) || '(' + a.state + ')',
                 to: cut(b.value) || '(' + b.state + ')' });
    });
    return out;
  }

  /** 변경 사유를 사람이 읽는 문장으로. "규격 변경: A → B" */
  function changeReason(d) {
    return d.title + ' 변경: ' + (d.from || '(없음)') + ' → ' + (d.to || '(없음)');
  }

  /**
   * 기존 색인과 새 색인을 견준다.
   *   added   신규 — 새로 생긴 파일
   *   changed 변경 — 같은 파일인데 내용이 달라짐 (무엇이 달라졌는지 함께)
   *   same    동일
   *   removed 사라짐 — 폴더에서 없어진 파일. 지우지 말고 알린다
   */
  function compareIndex(before, after) {
    var a = byFile(before), b = byFile(after);
    var out = { added: [], changed: [], same: [], removed: [] };
    (after || []).forEach(function (rec) {
      var old = a[rec.file];
      if (!old) { out.added.push(rec); return; }
      var d = diffRecord(old, rec);
      if (d.length) out.changed.push({ rec: rec, before: old, diffs: d,
                                       reasons: d.map(changeReason) });
      else out.same.push(rec);
    });
    Object.keys(a).forEach(function (f) { if (!b[f]) out.removed.push(a[f]); });
    return out;
  }

  function compareSummary(cmp) {
    return { added: cmp.added.length, changed: cmp.changed.length,
             same: cmp.same.length, removed: cmp.removed.length };
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
    SYNONYMS: SYNONYMS, expandTerm: expandTerm, matchTerm: matchTerm,
    matchReasons: matchReasons, wordSetsFor: wordSetsFor,
    TABLE_LIMIT: TABLE_LIMIT, resultRow: resultRow, resultRows: resultRows,
    suggestions: suggestions,
    shortLabel: shortLabel, joinKorean: joinKorean,
    fieldValue: fieldValue, fieldState: fieldState, sheetRows: sheetRows, warnings: warnings,
    maskContact: maskContact,
    COMPARE_FIELDS: COMPARE_FIELDS, diffRecord: diffRecord, changeReason: changeReason,
    compareIndex: compareIndex, compareSummary: compareSummary,
    todayLog: todayLog, missingQueries: missingQueries, summarize: summarize
  };
}));
