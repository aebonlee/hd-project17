/* 서버 어댑터 — node test/server.test.js */
'use strict';
var Fake = require('./fake-supabase.js');
var SupabaseStore = require('../js/supabase-store.js');
var Store = require('../js/store.js');
var L = require('../js/logic.js');
var passed = 0, failed = 0;

function group(t) { console.log('\n' + t); }
function ok(c, label, detail) {
  if (c) passed++; else { failed++; console.log('  X ' + label); if (detail) console.log('      ' + detail); }
}
function eq(g, w, label) {
  ok(JSON.stringify(g) === JSON.stringify(w), label,
     '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g));
}

function specRow(partNo, file, extra) {
  return Object.assign({
    part_no: partNo, part_no_source: 'body', kind: 'spec', file: file, sheet: '부품사양서',
    fields: { name: { value: 'HOSE', state: 'filled' } }
  }, extra || {});
}

group('1. 어댑터가 Store 와 같은 모양인가');

var names = ['index', 'log', 'count', 'record', 'today', 'missing', 'summary'];
names.forEach(function (n) {
  ok(typeof Store.prototype[n] === 'function' && typeof SupabaseStore.prototype[n] === 'function',
     n + '() 이 양쪽에 있다');
});

group('2. 읽어 오기');

var fake = new Fake();
fake.tables.spec = [specRow('420108-02540', 'a.xlsx'),
                    Object.assign(specRow('300644-00023', 'b.xlsx'), { kind: 'purchase' })];
fake.tables.search_log = [{ at: '2026-08-26T09:00:00Z', query: '호스', result: 'ask', hits: 2 }];
var s = new SupabaseStore(fake);
var loaded = false;
s.load(function (err) { loaded = !err; });
ok(loaded, '색인과 기록을 읽는다');
eq(s.count(), { total: 2, spec: 1, other: 1 }, '사양서와 그 외를 나눠 센다');
eq(s.index()[0].partNo, '420108-02540', '표 이름(part_no)을 화면 이름(partNo)으로 바꾼다');

group('3. 서버 제약이 화면 규칙과 같은가');

var f2 = new Fake();
[['123456-100001', '6-6 품번'], ['42010-02540', '앞 5자리'], ['', '빈 품번']].forEach(function (t) {
  var err = null;
  f2.insert('spec', specRow(t[0], t[0] + '.xlsx'), function (e) { err = e; });
  ok(!!err, t[1] + '을 서버가 거절한다', String(err));
  /* 같은 값을 화면 규칙도 거절해야 한다 — 두 곳이 어긋나면 안 된다 */
  ok(!L.isPartNo(t[0]), t[1] + '을 화면도 거절한다');
});

var errKind = null;
f2.insert('spec', specRow('420108-02540', 'k.xlsx', { kind: '사양서' }), function (e) { errKind = e; });
ok(!!errKind, '정해지지 않은 종류를 거절한다');

var errState = null;
f2.insert('spec', specRow('420108-02540', 'm.xlsx',
  { fields: { name: { value: 'HOSE', state: 'missing' } } }), function (e) { errState = e; });
ok(!!errState, '값이 있는데 missing 이라고 적으면 거절한다', String(errState));

var errDup = null;
f2.insert('spec', specRow('420108-02540', 'dup.xlsx'), function () {});
f2.insert('spec', specRow('999999-99999', 'dup.xlsx'), function (e) { errDup = e; });
ok(!!errDup, '같은 파일을 두 번 넣을 수 없다');

group('4. 검색 기록 — 서버도 연락처를 지운다');

var f3 = new Fake();
var s3 = new SupabaseStore(f3);
s3.record('홍길동 010-1234-5678', { kind: 'none' });
eq(f3.tables.search_log[0].query, '홍길동 010-****-5678', '서버에 닿은 값이 가려져 있다');
/* 화면에서도 가리므로 두 번 가려도 같은 값이어야 한다 */
eq(Fake.maskContact(L.maskContact('010-1234-5678')), '010-****-5678', '두 번 가려도 같다');

var errEmpty = null;
f3.insert('search_log', { query: '   ', result: 'none' }, function (e) { errEmpty = e; });
ok(!!errEmpty, '빈 검색어는 거절한다');

group('5. 서버가 거절하면 화면이 앞서 나가지 않는다');

var f4 = new Fake();
var msgs = [];
var s4 = new SupabaseStore(f4, { onError: function (m) { msgs.push(m); } });
f4._deny('search_log:insert', 'RLS 거절');
s4.record('산소호스', { kind: 'sheet', rec: { partNo: '420108-02540' } });
eq(s4.log().length, 0, '거절된 기록은 메모리에서도 빠진다');
ok(msgs.length === 1, '조용히 넘기지 않고 알린다', JSON.stringify(msgs));

group('6. 색인 갈아 끼우기');

var f5 = new Fake();
var s5 = new SupabaseStore(f5);
var done = false;
s5.replaceIndex([{ partNo: '420108-02540', partNoSource: 'body', kind: 'spec',
                   file: 'x.xlsx', sheet: '부품사양서',
                   fields: { name: { value: 'HOSE', state: 'filled' } } }],
                function (err) { done = !err; });
ok(done, '색인을 넣는다');
eq(s5.count().total, 1, '넣은 만큼 센다');

var bad = null;
s5.replaceIndex([{ partNo: 'x', kind: 'spec', file: 'y.xlsx' }], function (e) { bad = e; });
ok(!!bad, '품번이 틀리면 통째로 거절한다', String(bad));
eq(s5.count().total, 1, '거절되면 이전 색인이 그대로다');

group('7. 읽기 실패');

var f6 = new Fake();
var msgs6 = [];
var s6 = new SupabaseStore(f6, { onError: function (m) { msgs6.push(m); } });
f6._deny('spec:select', '권한 없음');
var gotErr = false;
s6.load(function (e) { gotErr = !!e; });
ok(gotErr, '읽지 못하면 알린다');
ok(msgs6.length === 1, '조용히 빈 화면을 그리지 않는다');
eq(s6.count().total, 0, '실패했으면 색인이 비어 있다');

console.log('\n' + (failed ? 'X' : 'O') + ' ' + passed + ' 통과 / ' + failed + ' 실패');
process.exit(failed ? 1 : 0);
