/* 데모 저장소 — node test/store.test.js
 * 검색 한 바퀴와 부수 효과(기록·요약·등록요청 목록)를 본다. */
'use strict';
var L = require('../js/logic.js');
var Store = require('../js/store.js');
var passed = 0, failed = 0;

function group(t) { console.log('\n' + t); }
function ok(c, label, detail) {
  if (c) passed++; else { failed++; console.log('  X ' + label); if (detail) console.log('      ' + detail); }
}
function eq(g, w, label) {
  ok(JSON.stringify(g) === JSON.stringify(w), label,
     '기대: ' + JSON.stringify(w) + '  실제: ' + JSON.stringify(g));
}

global.self = global.self || {};
require('../js/seed-data.js');
var SEED = global.self.SEED_INDEX;

group('1. 샘플 색인이 기벽까지 담고 있는가');

ok(SEED.length >= 12, '넉넉히 담겨 있다 (' + SEED.length + '건)');
ok(SEED.some(function (r) { return r.kind === 'desc'; }), '구형 「부품 설명」 양식이 있다');
ok(SEED.some(function (r) { return r.kind === 'purchase'; }), '사양서가 아닌 문서가 있다');
ok(SEED.some(function (r) { return r.partNoSource === 'conflict'; }), '품번이 어긋난 건이 있다');
ok(SEED.some(function (r) { return r.partNoSource === 'filename'; }), '파일명에서 읽은 건이 있다');
ok(SEED.some(function (r) {
  return Object.keys(r.fields).some(function (k) { return r.fields[k].state === 'blank'; });
}), '라벨은 있고 비어 있는 칸이 있다');
/* 매끈한 샘플만 넣으면 화면이 매끈해 보이고, 실물을 넣는 날 무너진다 */
ok(SEED.every(function (r) { return L.isPartNo(r.partNo); }), '샘플 품번이 전부 6-5 형식이다');

group('2. 검색 한 바퀴 — 기획서의 시나리오 그대로');

var s = new Store(SEED);
eq(s.count().total, SEED.length, '색인이 담겼다');

// 1) 품번을 알 때
var r1 = L.respond(s.index(), '420108-02540');
eq(r1.kind, 'sheet', '① 품번으로 조회하면 사양서');
s.record('420108-02540', r1);

// 2) 품번을 모를 때 → 되묻고 → 좁히면 나온다
var r2 = L.respond(s.index(), '호스 검색해줘');
eq(r2.kind, 'ask', '② 여럿이면 되묻는다');
s.record('호스 검색해줘', r2);
var r3 = L.respond(s.index(), '산소호스 알려줘');
eq(r3.kind, 'sheet', '   좁히면 한 건');
eq(r3.rec.partNo, '420108-02540', '   산소호스가 맞다');
s.record('산소호스 알려줘', r3);

// 3) 없을 때
var r4 = L.respond(s.index(), '건조기 필터');
eq(r4.kind, 'none', '③ 없으면 안내');
s.record('건조기 필터', r4);

eq(s.summary(), { total: 4, found: 2, none: 1, ask: 1 }, '네 번의 검색이 그대로 세어진다');

group('3. 못 찾은 검색어가 등록 요청 목록이 된다');

s.record('건조기 필터', L.respond(s.index(), '건조기 필터'));
s.record('유압 커플러', L.respond(s.index(), '유압 커플러'));
var miss = s.missing();
eq(miss.length, 2, '못 찾은 검색어가 두 종류');
/* 많이 찾은 것이 위로. 최근 순이면 방금 친 오타가 맨 위에 온다. */
eq(miss[0].query, '건조기 필터', '많이 찾은 것이 맨 위');
eq(miss[0].count, 2, '몇 번 찾았는지 센다');
eq(miss[1].count, 1, '한 번만 찾은 것은 아래로');
ok(!miss.some(function (m) { return m.query === '산소호스 알려줘'; }), '찾은 것은 목록에 없다');

group('4. 기록에 연락처를 남기지 않는다');

var s2 = new Store(SEED);
s2.record('담당자 010-8765-4321', L.respond(s2.index(), '담당자'));
ok(s2.log()[0].query.indexOf('2756') < 0, '가운데 자리가 지워진다', s2.log()[0].query);
ok(s2.log()[0].query.indexOf('010-****-4321') >= 0, '앞뒤는 남는다', s2.log()[0].query);

group('5. 빈 검색어는 기록하지 않는다');

var s3 = new Store(SEED);
eq(s3.record('', { kind: 'empty' }), null, '빈 검색어는 null');
eq(s3.record('   ', { kind: 'empty' }), null, '공백만도 null');
eq(s3.log().length, 0, '기록이 늘지 않는다');

group('6. 사양서가 아닌 문서는 검색 결과에 나오지 않는다');

var s4 = new Store(SEED);
var purchase = s4.index().filter(function (r) { return r.kind === 'purchase'; })[0];
ok(purchase, '샘플에 구매목록이 있다');
var hits = L.search(s4.index(), purchase.partNo);
eq(hits.length, 0, '그 품번으로 검색해도 사양서로 나오지 않는다');
var res = L.respond(s4.index(), purchase.partNo);
eq(res.kind, 'none', '결과는 none');
ok(res.message.indexOf('구매 목록') >= 0, '무엇이 있는지는 알려 준다', res.message);

group('7. 색인 갈아 끼우기');

var s5 = new Store([]);
eq(s5.count().total, 0, '빈 색인으로 시작');
var out = s5.replaceIndex(SEED);
ok(out.ok, '색인을 넣는다');
eq(s5.count().total, SEED.length, '넣은 만큼 담긴다');
ok(!s5.replaceIndex('배열 아님').ok, '배열이 아니면 거절');
ok(!s5.replaceIndex([{ kind: 'spec' }]).ok, '품번이 없으면 거절');
eq(s5.count().total, SEED.length, '거절되면 이전 색인이 그대로다');

group('8. 기록 비우기와 되돌리기');

var s6 = new Store(SEED);
s6.record('호스', L.respond(s6.index(), '호스'));
ok(s6.log().length === 1, '기록이 하나');
s6.clearLog();
eq(s6.log().length, 0, '비우면 없다');
eq(s6.count().total, SEED.length, '기록을 비워도 색인은 남는다');

console.log('\n' + (failed ? 'X' : 'O') + ' ' + passed + ' 통과 / ' + failed + ' 실패');
process.exit(failed ? 1 : 0);
