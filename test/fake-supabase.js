/* PostgREST 흉내 — 테스트용.
 *
 * 흉내만 내지 않고 **schema.sql 의 제약·트리거와 같은 규칙**을 건다.
 * 그래야 "브라우저는 통과시켰는데 서버가 막는" 자리를 테스트가 잡는다.
 */
'use strict';

function Fake() {
  this.tables = { spec: [], search_log: [], app_user: [] };
  this.denied = {};
}

Fake.prototype._deny = function (what, msg) { this.denied[what] = msg || '거절됨'; };

/* schema.sql 의 mask_contact() 와 같은 규칙 */
function maskContact(t) {
  return String(t == null ? '' : t)
    .replace(/(01[016-9])[-. ]?(\d{3,4})[-. ]?(\d{4})/g, '$1-****-$3')
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@/g, '$1***@');
}

var PART_NO = /^\d{6}-\d{5}$/;
var KINDS = ['spec', 'desc', 'purchase', 'unknown', 'error'];
var SOURCES = ['body', 'filename', 'conflict', 'none'];
var RESULTS = ['sheet', 'ask', 'none'];
var STATES = ['filled', 'blank', 'missing'];

/* schema.sql 의 check 제약과 같은 규칙 */
function checkSpec(row, existing) {
  if (!PART_NO.test(String(row.part_no || ''))) return '품번 형식이 6-5 가 아닙니다';
  if (KINDS.indexOf(row.kind) < 0) return '정해지지 않은 종류입니다';
  if (SOURCES.indexOf(row.part_no_source || 'body') < 0) return '정해지지 않은 출처입니다';
  if (!row.file) return '파일 이름이 없습니다';
  var f = row.fields || {};
  for (var k in f) {
    if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
    if (STATES.indexOf(f[k].state) < 0) return '정해지지 않은 항목 상태입니다: ' + f[k].state;
    if (f[k].state === 'missing' && (f[k].value || '') !== '') {
      return '값이 있는데 missing 이라고 적혀 있습니다: ' + k;
    }
  }
  if ((existing || []).some(function (r) { return r.file === row.file; })) {
    return '같은 파일이 이미 있습니다';
  }
  return null;
}

function checkLog(row) {
  if (!String(row.query || '').trim()) return '검색어가 비어 있습니다';
  if (RESULTS.indexOf(row.result) < 0) return '정해지지 않은 결과값입니다';
  if ((row.hits || 0) < 0) return 'hits 가 음수입니다';
  return null;
}

Fake.prototype.select = function (table, cb) {
  var d = this.denied[table + ':select'];
  if (d) return cb(d);
  cb(null, (this.tables[table] || []).slice());
};

Fake.prototype.insert = function (table, row, cb) {
  var d = this.denied[table + ':insert'];
  if (d) return cb(d);
  var err = table === 'spec' ? checkSpec(row, this.tables.spec)
          : table === 'search_log' ? checkLog(row) : null;
  if (err) return cb(err);
  if (table === 'search_log') row = Object.assign({}, row, { query: maskContact(row.query) });
  this.tables[table].push(row);
  cb(null, row);
};

Fake.prototype.upsert = function (table, rows, cb) {
  var d = this.denied[table + ':insert'];
  if (d) return cb(d);
  var self = this;
  var next = (this.tables[table] || []).slice();
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var at = next.findIndex(function (r) { return r.file === row.file; });
    var err = checkSpec(row, at >= 0 ? next.filter(function (_, j) { return j !== at; }) : next);
    if (err) return cb(err);
    if (at >= 0) next[at] = row; else next.push(row);
  }
  self.tables[table] = next;
  cb(null, next);
};

Fake.maskContact = maskContact;
module.exports = Fake;
