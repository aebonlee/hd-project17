/* 서버 어댑터 — store.js 와 **같은 모양**이라 갈아 끼울 수 있다.
 *
 * 쓰기는 낙관적이다. 규칙 판정을 먼저 돌려 통과한 것만 메모리에 반영하고
 * 서버로 보낸다. 서버가 거절하면(RLS·제약) **조용히 넘기지 않고 알린 뒤
 * 서버 상태로 다시 읽어 온다.** 화면이 서버보다 앞서 나간 채로 남는 것이
 * 가장 나쁘다 — 사용자는 저장됐다고 믿고 창을 닫는다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./logic.js'));
  else root.SupabaseStore = factory(root.Logic);
}(typeof self !== 'undefined' ? self : this, function (Logic) {
  'use strict';

  function SupabaseStore(client, opts) {
    this.client = client;
    this.opts = opts || {};
    this.state = { index: [], log: [] };
    this.onError = this.opts.onError || function (msg) {
      if (typeof console !== 'undefined') console.warn('[서버]', msg);
    };
  }

  function toRec(row) {
    return {
      partNo: row.part_no, partNoSource: row.part_no_source, kind: row.kind,
      file: row.file, sheet: row.sheet || '', fields: row.fields || {}
    };
  }

  function toEntry(row) {
    return { at: row.at, query: row.query, result: row.result,
             partNo: row.part_no || '', hits: row.hits || 0 };
  }

  /** 색인과 기록을 서버에서 읽어 온다. */
  SupabaseStore.prototype.load = function (done) {
    var self = this;
    this.client.select('spec', function (err, rows) {
      if (err) { self.onError('색인을 읽지 못했습니다: ' + err); return done && done(err); }
      self.state.index = (rows || []).map(toRec);
      self.client.select('search_log', function (err2, logRows) {
        if (err2) { self.onError('검색 기록을 읽지 못했습니다: ' + err2); }
        self.state.log = (logRows || []).map(toEntry);
        done && done(null);
      });
    });
  };

  SupabaseStore.prototype.index = function () { return this.state.index.slice(); };
  SupabaseStore.prototype.log = function () { return this.state.log.slice(); };

  SupabaseStore.prototype.count = function () {
    var out = { total: this.state.index.length, spec: 0, other: 0 };
    this.state.index.forEach(function (r) {
      if (Logic.isSearchable(r)) out.spec += 1; else out.other += 1;
    });
    return out;
  };

  SupabaseStore.prototype.record = function (query, result, at) {
    var self = this;
    /* 화면에서 먼저 가린다. 서버 트리거도 같은 일을 하지만, 둘 중 하나만
     * 있으면 안 된다 — REST 를 직접 부르면 화면을 안 거치고,
     * 데모 모드에는 서버가 없다. */
    var q = Logic.maskContact(String(query == null ? '' : query).trim());
    if (!q) return null;
    var entry = {
      at: at || new Date().toISOString(), query: q,
      result: result && result.kind === 'sheet' ? 'sheet'
            : result && result.kind === 'ask' ? 'ask' : 'none',
      partNo: (result && result.rec && result.rec.partNo) || '',
      hits: (result && result.hits && result.hits.length) || (result && result.rec ? 1 : 0)
    };
    this.state.log.push(entry);
    this.client.insert('search_log', {
      at: entry.at, query: entry.query, result: entry.result,
      part_no: entry.partNo, hits: entry.hits
    }, function (err) {
      if (!err) return;
      self.onError('검색 기록을 저장하지 못했습니다: ' + err);
      /* 서버가 거절했으면 메모리에서도 뺀다 — 화면만 앞서 나가지 않게 */
      var i = self.state.log.indexOf(entry);
      if (i >= 0) self.state.log.splice(i, 1);
    });
    return entry;
  };

  SupabaseStore.prototype.replaceIndex = function (records, done) {
    var self = this;
    if (!Array.isArray(records)) return done && done('색인이 배열이 아닙니다');
    var rows = records.map(function (r) {
      return { part_no: r.partNo, part_no_source: r.partNoSource || 'body',
               kind: r.kind, file: r.file, sheet: r.sheet || '', fields: r.fields || {} };
    });
    this.client.upsert('spec', rows, function (err) {
      if (err) { self.onError('색인을 저장하지 못했습니다: ' + err); return done && done(err); }
      self.load(done);
    });
  };

  SupabaseStore.prototype.today = function (nowIso) {
    return Logic.todayLog(this.state.log, nowIso || new Date().toISOString());
  };
  SupabaseStore.prototype.missing = function (nowIso) {
    return Logic.missingQueries(this.state.log, nowIso || new Date().toISOString());
  };
  SupabaseStore.prototype.summary = function (nowIso) {
    return Logic.summarize(this.state.log, nowIso || new Date().toISOString());
  };

  return SupabaseStore;
}));
