/* 데모 저장소 — localStorage.
 *
 * 담는 것은 두 가지뿐이다.
 *   · 색인(index)  — build_index.py 가 만든 것, 또는 샘플
 *   · 검색 기록(log)
 *
 * ⚠ **엑셀 원본도 사진도 담지 않는다.** 기획자가 보낸 10건이 이미 4MB 다.
 * 수천 건이면 GB 가 되고 브라우저든 무료 DB 든 몇 달 안에 막힌다.
 * 색인에는 어느 파일의 몇 번째 시트인지(file, sheet)만 남기고
 * 실물은 지금 있는 서버 폴더에 그대로 둔다 (CLAUDE.md §4).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.Store = factory(root.Logic);
}(typeof self !== 'undefined' ? self : this, function (Logic) {
  'use strict';

  var KEY = 'pct17.state.v1';
  var LOG_LIMIT = 500;      /* 기록이 무한히 자라지 않게. 오늘 것만 보므로 넉넉하다 */

  function nowIso() { return new Date().toISOString(); }

  function blank() { return { index: [], log: [] }; }

  function load() {
    try {
      var raw = root_localStorage() && root_localStorage().getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.index)) return null;
      if (!Array.isArray(s.log)) s.log = [];
      return s;
    } catch (e) { return null; }
  }

  function root_localStorage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; }
    catch (e) { return null; }          /* 사생활 보호 모드에서 접근만 해도 던진다 */
  }

  function save(state) {
    var ls = root_localStorage();
    if (!ls) return;
    try { ls.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* 용량 초과 — 색인만 담으므로 흔치 않다. 데모라 조용히 넘긴다 */ }
  }

  function Store(seed) {
    this.state = load() || { index: (seed || []).slice(), log: [] };
    save(this.state);
  }

  Store.prototype.index = function () { return this.state.index.slice(); };

  Store.prototype.count = function () {
    var out = { total: this.state.index.length, spec: 0, other: 0 };
    this.state.index.forEach(function (r) {
      if (Logic.isSearchable(r)) out.spec += 1; else out.other += 1;
    });
    return out;
  };

  /** 색인을 통째로 갈아 끼운다 (build_index.py 결과 붙여넣기). */
  Store.prototype.replaceIndex = function (records) {
    if (!Array.isArray(records)) return { ok: false, error: '색인이 배열이 아닙니다' };
    var bad = records.filter(function (r) { return !r || typeof r.partNo !== 'string'; });
    if (bad.length) return { ok: false, error: '품번이 없는 항목이 ' + bad.length + '건 있습니다' };
    this.state.index = records;
    save(this.state);
    return { ok: true, count: records.length };
  };

  /**
   * 검색 한 번을 기록한다.
   * 검색어에 연락처가 섞여 들어와도 그대로 남기지 않는다(규칙 9) —
   * 기록은 "무엇을 찾았나"를 보려는 것이지 번호를 모으려는 것이 아니다.
   */
  Store.prototype.record = function (query, result, at) {
    var entry = {
      at: at || nowIso(),
      query: Logic.maskContact(String(query == null ? '' : query).trim()),
      result: result && result.kind === 'sheet' ? 'sheet'
            : result && result.kind === 'ask' ? 'ask' : 'none',
      partNo: (result && result.rec && result.rec.partNo) || '',
      hits: (result && result.hits && result.hits.length) || (result && result.rec ? 1 : 0)
    };
    if (!entry.query) return null;
    this.state.log.push(entry);
    if (this.state.log.length > LOG_LIMIT) {
      this.state.log = this.state.log.slice(-LOG_LIMIT);
    }
    save(this.state);
    return entry;
  };

  Store.prototype.log = function () { return this.state.log.slice(); };

  Store.prototype.today = function (nowIsoStr) {
    return Logic.todayLog(this.state.log, nowIsoStr || nowIso());
  };

  Store.prototype.missing = function (nowIsoStr) {
    return Logic.missingQueries(this.state.log, nowIsoStr || nowIso());
  };

  Store.prototype.summary = function (nowIsoStr) {
    return Logic.summarize(this.state.log, nowIsoStr || nowIso());
  };

  Store.prototype.clearLog = function () {
    this.state.log = [];
    save(this.state);
  };

  Store.prototype.reset = function (seed) {
    this.state = { index: (seed || []).slice(), log: [] };
    save(this.state);
  };

  Store.blank = blank;
  return Store;
}));
