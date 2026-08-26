/* 검색 규칙 테스트 — node test/logic.test.js */
'use strict';
var L = require('../js/logic.js');
var passed = 0, failed = 0;

function group(t) { console.log('\n' + t); }
function ok(c, label, detail) {
  if (c) passed++;
  else { failed++; console.log('  X ' + label); if (detail) console.log('      ' + detail); }
}
function eq(got, want, label) {
  ok(JSON.stringify(got) === JSON.stringify(want), label,
     '기대: ' + JSON.stringify(want) + '  실제: ' + JSON.stringify(got));
}

/* 테스트용 색인. 실제 사양서가 아니라 지어낸 값이다. */
function rec(partNo, kind, fields, extra) {
  var f = {};
  ['name','model','maker','use','material','unit','qtyPerUnit','origin','detail','remark','bg','contact']
    .forEach(function (k) {
      if (!(k in fields)) { f[k] = { value: '', state: 'missing' }; return; }
      var v = fields[k];
      f[k] = { value: v, state: v === '' ? 'blank' : 'filled' };
    });
  var r = { partNo: partNo, partNoSource: 'body', kind: kind,
            file: partNo + ' TEST.xlsx', sheet: '부품사양서', fields: f };
  Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
  return r;
}

var IDX = [
  rec('420108-02540', 'spec', { name: 'HOSE,GAS;OXYGEN TWIN', model: '산소호스(쌍줄)-30m',
      use: '산소용접기 호스교체용', maker: '시중품', material: '고무' }),
  rec('420103-00591', 'spec', { name: 'HOSE,FUEL', model: '실리콘 고열호스 / 150mm',
      use: '매연배기장치 내 사용되는 고무호스', maker: '신흥' }),
  rec('101573-00018', 'desc', { name: 'RUBBER,MAGNET', model: '지름 130mm, 2t',
      use: '- 고무자석입니다.\n- 단품도장 마스킹용' }),
  rec('300644-00023', 'purchase', {}, { file: '300644-00023 구매목록.xlsx' }),
  rec('101602-00312', 'spec', { name: 'BRUSH,WIRE;CUP', model: '컵형 와이어브러시 75mm',
      use: '용접 비드 제거용' }, { partNoSource: 'conflict' })
];

/* ─────────────────────────────────── */
group('1. 품번 — 6자리-5자리');

ok(L.isPartNo('420108-02540'), '420108-02540 은 품번이다');
ok(L.isPartNo('101573-00018'), '101573-00018 은 품번이다');
ok(!L.isPartNo('123456-100001'), '6-6 은 이 회사 품번이 아니다 (12번 프로젝트와 다르다)');
ok(!L.isPartNo('42010-02540'), '앞이 5자리면 아니다');
ok(!L.isPartNo('420108-0254'), '뒤가 4자리면 아니다');
ok(!L.isPartNo(' 420108-02540 '.trim() + 'x'), '뒤에 글자가 붙으면 아니다');
ok(L.isPartNo('  420108-02540  '), '앞뒤 공백은 무시한다');


group('2. 말끝을 다듬는다 — LLM 없이');

eq(L.normalizeQuery('호스 검색해줘'), '호스', '"호스 검색해줘" → "호스"');
eq(L.normalizeQuery('산소호스 알려줘'), '산소호스', '"산소호스 알려줘" → "산소호스"');
eq(L.normalizeQuery('산소호스 좀 찾아주세요'), '산소호스', '겹친 꼬리말도 뗀다');
eq(L.normalizeQuery('420108-02540'), '420108-02540', '품번은 건드리지 않는다');
eq(L.normalizeQuery('  '), '', '빈 입력');
/* 조사는 낱말 끝에서만. 두 글자 이하는 그냥 둔다 — '이', '가' 가 낱말일 수 있다 */
eq(L.stripParticle('호스를'), '호스', '"호스를" → "호스"');
eq(L.stripParticle('나사'), '나사', '두 글자는 조사를 떼지 않는다');
/* 꼬리말을 떼서 아무것도 안 남으면 원래 말을 살린다 */
ok(L.normalizeQuery('검색') === '검색' || L.normalizeQuery('검색') === '',
   '"검색"만 친 경우가 죽지 않는다');


group('3. 품번으로 조회');

var r = L.respond(IDX, '420108-02540');
eq(r.kind, 'sheet', '품번을 넣으면 사양서 한 장');
eq(r.rec.partNo, '420108-02540', '그 품번의 사양서다');


group('4. 후보가 여럿이면 되묻는다 — 골라 주지 않는다');

var ask = L.respond(IDX, '호스 검색해줘');
eq(ask.kind, 'ask', '"호스"는 여럿이라 되묻는다');
ok(ask.hits.length === 2, '후보가 2건', String(ask.hits.length));
ok(ask.message.indexOf('어떤 걸 찾으시나요') >= 0, '기획자가 쓴 되묻는 말투', ask.message);
ok(ask.message.indexOf('산소호스') >= 0 && ask.message.indexOf('실리콘 고열호스') >= 0,
   '후보 이름을 불러 준다', ask.message);
ok(!ask.rec, '되물을 때는 사양서를 고르지 않는다');

var one = L.respond(IDX, '산소호스 알려줘');
eq(one.kind, 'sheet', '"산소호스"로 좁히면 한 건');
eq(one.rec.partNo, '420108-02540', '산소호스가 맞다');

/* 낱말이 여럿이면 전부 맞아야 한다 — 좁히려는 사람에게 아무거나 주지 않는다 */
eq(L.search(IDX, '산소 호스').length, 1, '"산소 호스"는 둘 다 맞는 한 건만');
eq(L.search(IDX, '호스 없는말').length, 0, '한 낱말이라도 없으면 탈락');


group('5. 없을 때 — 기획자가 준 문구 그대로');

var none = L.respond(IDX, '건조기 필터');
eq(none.kind, 'none', '없으면 none');
eq(none.message,
   '저장 되어있는 파일이 없습니다. 내용을 재확인 하거나 생산기술팀에 사양서 등록을 요청 하세요',
   '문구가 기획서와 한 글자도 다르지 않다');
eq(L.NOT_FOUND, none.message, 'NOT_FOUND 와 같은 문구');


group('6. 사양서가 아닌 문서를 사양서로 내주지 않는다');

ok(!L.isSearchable(IDX[3]), '구매목록은 검색 대상이 아니다');
var pur = L.respond(IDX, '300644-00023');
eq(pur.kind, 'none', '구매목록 품번을 넣어도 사양서를 주지 않는다');
ok(pur.message.indexOf('구매 목록') >= 0, '무엇이 있는지는 알려 준다', pur.message);
ok(pur.message.indexOf('등록을 요청') >= 0, '등록 요청 안내는 유지한다');
/* 폴더에 파일이 보이는 사람에게 그냥 '없습니다' 라고만 하면
 * 시스템이 고장 났다고 생각한다. 그래서 무엇이 있는지 말한다. */
ok(pur.message.indexOf('저장 되어있는 파일이 없습니다') < 0,
   '"파일이 있으나"와 "파일이 없습니다"를 같이 말하지 않는다', pur.message);


group('7. 못 읽은 칸을 지어내지 않는다');

var spec = IDX[0], desc = IDX[2];
eq(L.fieldState(spec, 'material').state, 'filled', '값이 있으면 filled');
eq(L.fieldState(spec, 'origin').state, 'missing', '항목이 없으면 missing');
ok(!L.fieldState(spec, 'origin').show, 'missing 은 줄 자체를 그리지 않는다');
var blankRec = rec('999999-99999', 'spec', { name: 'X', material: '' });
eq(L.fieldState(blankRec, 'material').state, 'blank', '라벨은 있고 칸이 비면 blank');
ok(L.fieldState(blankRec, 'material').show, 'blank 는 줄을 그린다');
eq(L.fieldState(blankRec, 'material').text, '(비어 있음)', 'blank 는 비어 있다고 적는다');
/* 둘을 뭉뚱그리면 화면에 똑같이 '-' 로 보인다. 사양서에 원래 없는 항목인지
 * 담당자가 안 적은 것인지 알 수 없으면 등록 요청을 할 수가 없다. */
ok(L.fieldState(blankRec, 'material').state !== L.fieldState(spec, 'origin').state,
   'blank 와 missing 은 화면에서 다르게 보인다');

var rows = L.sheetRows(desc);
ok(rows.every(function (x) { return x.state !== 'missing'; }), 'missing 은 줄에 없다');
ok(rows.some(function (x) { return x.key === 'use'; }), '있는 항목은 나온다');


group('8. 사람이 봐야 할 것을 표시한다');

var w = L.warnings(IDX[4]);
ok(w.length > 0, '품번이 어긋난 건은 경고가 붙는다');
ok(w[0].indexOf('서로 다릅니다') >= 0, '무엇이 다른지 말한다', w[0]);
ok(L.warnings(IDX[2]).some(function (x) { return x.indexOf('부품 설명') >= 0; }),
   '구형 양식임을 알려 준다');
eq(L.warnings(IDX[0]).length, 0, '정상 사양서는 경고가 없다');


group('9. 검색 기록에 개인정보를 남기지 않는다');

eq(L.maskContact('홍길동/ 010-1234-5678'), '홍길동/ 010-****-5678', '휴대전화를 가린다');
eq(L.maskContact('010-8765-4321'), '010-****-4321', '하이픈 없는 것도');
eq(L.maskContact('01087654321'), '010-****-4321', '붙여 쓴 번호도');
ok(L.maskContact('gildong.hong@example.com').indexOf('gildong.hong') < 0, '이메일 아이디를 가린다');
eq(L.maskContact('g***@example.com'), 'g***@example.com', '이미 가려진 것은 그대로');
eq(L.maskContact('산소호스'), '산소호스', '보통 검색어는 건드리지 않는다');
eq(L.maskContact(null), '', 'null 도 죽지 않는다');


group('10. 오늘 기록은 오늘 것만');

var log = [
  { at: '2026-08-26T09:00:00Z', query: 'a', result: 'sheet' },
  { at: '2026-08-26T11:00:00Z', query: 'b', result: 'none' },
  { at: '2026-08-25T23:59:59Z', query: 'c', result: 'none' },
  { at: '2026-08-26T10:00:00Z', query: 'b', result: 'none' }
];
var today = L.todayLog(log, '2026-08-26T12:00:00Z');
eq(today.length, 3, '어제 것은 빠진다');
eq(today[0].at, '2026-08-26T11:00:00Z', '최근 것이 위로');

var sum = L.summarize(log, '2026-08-26T12:00:00Z');
eq(sum, { total: 3, found: 1, none: 2, ask: 0 }, '오늘 요약');

var miss = L.missingQueries(log, '2026-08-26T12:00:00Z');
eq(miss.length, 1, '못 찾은 검색어는 같은 말끼리 묶는다');
/* 많이 찾은 것이 위로 — 방금 친 오타가 여러 사람이 찾은 부품을 밀어내지 않게 */
var log2 = [
  { at: '2026-08-26T09:00:00Z', query: '자주', result: 'none' },
  { at: '2026-08-26T09:30:00Z', query: '자주', result: 'none' },
  { at: '2026-08-26T11:59:00Z', query: '방금오타', result: 'none' }
];
eq(L.missingQueries(log2, '2026-08-26T12:00:00Z').map(function (m) { return m.query; }),
   ['자주', '방금오타'], '많이 찾은 것이 최근 것보다 위');
eq(miss[0], { query: 'b', count: 2, at: '2026-08-26T11:00:00Z' }, '몇 번 찾았는지 센다');
eq(L.missingQueries(log, '2026-08-27T00:00:00Z').length, 0, '날이 바뀌면 비어 있다');


group('11. 되물을 때 부르는 이름');

eq(L.joinKorean(['가']), '가', '하나면 그대로');
eq(L.joinKorean(['가', '나']), '가와 나', '둘이면 "와"');
eq(L.joinKorean(['가', '나', '다']), '가, 나와 다', '셋이면 마지막만 "와"');
eq(L.shortLabel(IDX[0]), '산소호스(쌍줄)-30m', '모델명이 있으면 그것으로 부른다');
eq(L.shortLabel(rec('1', 'spec', { name: 'ONLY NAME' })), 'ONLY NAME', '모델이 없으면 품명으로');
eq(L.shortLabel(rec('420108-02540', 'spec', {})), '420108-02540', '둘 다 없으면 품번으로');

/* 후보가 너무 많으면 이름을 다 부르지 않고 개수만 말한다 */
var many = [];
for (var i = 0; i < 9; i++) many.push(rec('42010' + i + '-0000' + i, 'spec',
  { name: 'HOSE ' + i, model: '호스' + i + '형' }));
var manyAsk = L.respond(many, '호스');
eq(manyAsk.kind, 'ask', '많아도 되묻는다');
ok(manyAsk.message.indexOf('9건') >= 0, '개수를 말한다', manyAsk.message);


group('12. 빈 입력과 이상한 입력');

eq(L.respond(IDX, '').kind, 'empty', '빈 입력');
eq(L.respond(IDX, '   ').kind, 'empty', '공백만');
eq(L.respond(IDX, null).kind, 'empty', 'null');
eq(L.respond([], '호스').kind, 'none', '색인이 비면 none');
eq(L.respond(null, '호스').kind, 'none', '색인이 null 이어도 죽지 않는다');
eq(L.search(IDX, '<script>').length, 0, '이상한 문자로 터지지 않는다');


group('13. 동의어 — 못 찾았을 때만 쓴다');

var SYN = [
  rec('920101-00039', 'spec', { name: 'ANGLE;40X40X3T', model: 'ANGLE 40x40x3T',
      use: '개선반 운영용 자재' }),
  rec('920501-00663', 'spec', { name: 'PLATE,STEEL;FLAT BAR', model: 'FLAT BAR 19MM',
      use: '치구 제작용' })
];
/* 사양서 품명은 영문인데 찾는 사람은 한글로 친다 */
eq(L.search(SYN, '앵글').length, 1, '"앵글" 로 ANGLE 을 찾는다');
eq(L.search(SYN, 'ㄱ형강').length, 1, '현장 용어 "ㄱ형강" 으로도 찾는다');
eq(L.search(SYN, '평철').length, 1, '"평철" 로 FLAT BAR 를 찾는다');

/* ★ 적은 대로 찾아지면 넓히지 않는다.
 * 이게 없으면 '산소호스' 가 '호스' 로 넓혀져 온갖 호스가 다 나온다 —
 * 좁히려고 길게 친 사람에게 정반대로 답하는 셈이다. 실제로 그렇게 만들었다가
 * 기획서의 「산소호스 알려줘 → 한 건」 이 4건으로 늘어난 것을 보고 고쳤다. */
eq(L.search(IDX, '산소호스').length, 1, '"산소호스" 는 여전히 한 건 (동의어로 넓히지 않는다)');
eq(L.search(IDX, '호스').length, 2, '"호스" 는 두 건');
var sets = L.wordSetsFor(IDX, ['산소호스']);
eq(sets[0], ['산소호스'], '찾아지는 낱말은 넓히지 않는다');
ok(L.wordSetsFor(SYN, ['앵글'])[0].length > 1, '못 찾는 낱말만 넓힌다');

/* 이유에 동의어를 썼다는 사실을 밝힌다 — 왜 나왔는지 숨기지 않는다 */
var why = L.matchReasons(SYN[0], 'ㄱ형강', SYN);
ok(why[0].indexOf('같은 말') >= 0, '동의어로 걸렸으면 그렇게 적는다', why[0]);
ok(L.matchReasons(IDX[0], '산소호스', IDX)[0].indexOf('같은 말') < 0,
   '그대로 걸렸으면 동의어라고 적지 않는다');


group('14. 결과 표 — 최대 5개, 선택 이유 포함');

var ask2 = L.respond(IDX, '호스');
eq(ask2.kind, 'ask', '여럿이면 표를 준다');
ok(Array.isArray(ask2.rows), '표 줄이 있다');
eq(ask2.rows.length, 2, '맞은 만큼만');
var row = ask2.rows[0];
['partNo', 'name', 'model', 'maker', 'use', 'reasons'].forEach(function (k) {
  ok(k in row, '표에 ' + k + ' 칸이 있다');
});
ok(row.reasons.length > 0, '선택 이유가 비어 있지 않다');
/* 이유는 지어낸 설명이 아니라 판정에 쓴 근거다 */
ok(row.reasons[0].indexOf('「호스」') >= 0, '무엇이 어디서 맞았는지 적는다', row.reasons[0]);

/* 다섯 개를 넘으면 잘라 내되 잘랐다고 말한다 */
var many2 = [];
for (var k = 0; k < 8; k++) many2.push(rec('42010' + k + '-0000' + k, 'spec',
  { name: 'HOSE ' + k, model: '호스' + k + '형' }));
var big = L.respond(many2, '호스');
eq(big.rows.length, 5, '표는 다섯 줄까지');
eq(big.shown, 5, '보여 준 수');
eq(big.more, 3, '남은 수를 센다');
/* 잘라 낸 사실을 숨기면 "다 봤다"고 착각한다 */
ok(big.more > 0, '잘렸다는 사실이 결과에 남는다');
eq(L.respond(IDX, '420108-02540').kind, 'sheet', '한 건이면 표가 아니라 사양서');


group('15. 못 찾았을 때 대신 쳐 볼 말을 권한다');

var none2 = L.respond(IDX, '건조기 호스');
eq(none2.kind, 'none', '두 낱말 다 맞아야 하므로 없음');
ok((none2.suggest || []).indexOf('호스') >= 0,
   '한 낱말만 쳐 보라고 권한다', JSON.stringify(none2.suggest));
/* 사용자가 이미 친 말을 권한다. 영문 동의어를 권하면 두 번 헛걸음이다 */
var none3 = L.respond(SYN, '건조기 평철');
ok((none3.suggest || []).indexOf('평철') >= 0, '친 말 그대로 권한다',
   JSON.stringify(none3.suggest));

/* 지어내지 않는다 — 색인에 실제로 있는 말만 권한다 */
var none4 = L.respond(IDX, '유압커플러');
(none4.suggest || []).forEach(function (w) {
  ok(L.search(IDX, w).length > 0, '권한 말 "' + w + '" 은 실제로 찾힌다');
});
eq(L.respond([], '아무거나').suggest, [], '색인이 비면 권할 말도 없다');


group('16. 최신화 — 무엇이 달라졌는지 말한다');

function specFile(file, partNo, fields) {
  var r = rec(partNo, 'spec', fields);
  r.file = file;
  return r;
}
var before = [
  specFile('a.xlsx', '420108-02540', { name: 'HOSE,GAS', model: '산소호스-30m', maker: '시중품' }),
  specFile('b.xlsx', '420103-00591', { name: 'HOSE,FUEL', model: '실리콘 고열호스' }),
  specFile('c.xlsx', '101573-00018', { name: 'RUBBER,MAGNET' })
];
var after = [
  specFile('a.xlsx', '420108-02540', { name: 'HOSE,GAS', model: '산소호스-50m', maker: '한별테크' }),
  specFile('b.xlsx', '420103-00591', { name: 'HOSE,FUEL', model: '실리콘 고열호스' }),
  specFile('d.xlsx', '420115-00042', { name: 'HOSE,AIR' })
];
var cmp = L.compareIndex(before, after);
eq(L.compareSummary(cmp), { added: 1, changed: 1, same: 1, removed: 1 }, '신규·변경·동일·사라짐');
eq(cmp.added[0].partNo, '420115-00042', '새 파일은 신규');
eq(cmp.removed[0].partNo, '101573-00018', '없어진 파일은 사라짐 — 조용히 지우지 않는다');
eq(cmp.same[0].partNo, '420103-00591', '안 바뀐 것은 동일');

/* "뭔가 바뀐 것 같다"가 아니라 어느 칸이 무엇에서 무엇으로 바뀌었는지 */
var ch = cmp.changed[0];
eq(ch.diffs.length, 2, '바뀐 칸 수');
ok(ch.reasons.some(function (r) { return r.indexOf('모델 및 규격 변경') >= 0; }),
   '규격 변경을 짚는다', ch.reasons.join(' / '));
ok(ch.reasons.some(function (r) { return r.indexOf('제조 Maker 변경') >= 0; }),
   '메이커 변경을 짚는다');
ok(ch.reasons[0].indexOf('→') >= 0, '무엇에서 무엇으로인지 적는다', ch.reasons[0]);

/* 파일 기준으로 견준다 — 품번은 파일명과 내용이 어긋날 수 있다 */
var moved = [specFile('a.xlsx', '999999-99999', { name: 'HOSE,GAS', model: '산소호스-30m', maker: '시중품' })];
var cmp2 = L.compareIndex([before[0]], moved);
eq(L.compareSummary(cmp2).changed, 1, '같은 파일에서 품번이 바뀌면 변경');
ok(cmp2.changed[0].reasons[0].indexOf('품번 변경') >= 0, '품번이 바뀐 것도 짚는다');

/* 빈 색인끼리 견줘도 죽지 않는다 */
eq(L.compareSummary(L.compareIndex([], [])), { added: 0, changed: 0, same: 0, removed: 0 }, '빈 색인');
eq(L.compareSummary(L.compareIndex(null, after)).added, 3, '이전 색인이 없으면 전부 신규');


console.log('\n' + (failed ? 'X' : 'O') + ' ' + passed + ' 통과 / ' + failed + ' 실패');
process.exit(failed ? 1 : 0);
