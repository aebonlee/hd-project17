/* 브라우저에 실제로 띄워 화면이 그려지는지 본다.
 *
 *   node test/smoke.browser.js
 *
 * 규칙 테스트가 전부 통과해도 app.js 의 오타 하나면 페이지가 빈 화면이 된다.
 * 규칙은 맞는데 아무도 그것을 볼 수 없는 상태다.
 *
 * playwright 가 없으면 **조용히 건너뛴다.** 이것 하나 때문에 다른 테스트가
 * 막히면 아무도 안 돌리게 된다. CI 에서는 설치하고 돌린다.
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');

var chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  console.log('playwright 가 없어 화면 연기 테스트를 건너뜁니다 (CI 에서는 설치 후 돌립니다).');
  process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var passed = 0, failed = 0;
function group(t) { console.log('\n' + t); }
function ok(c, label, detail) {
  if (c) passed++; else { failed++; console.log('  X ' + label); if (detail) console.log('      ' + detail); }
}
function eq(g, w, label) {
  ok(String(g) === String(w), label, '기대: ' + w + '  실제: ' + g);
}

var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
             '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function serve(port) {
  return http.createServer(function (req, res) {
    var rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    var file = path.join(ROOT, rel);
    if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nope'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(port);
}

(async function main() {
  var PORT = 8791;
  var server = serve(PORT);
  var base = 'http://127.0.0.1:' + PORT + '/';
  var browser = await chromium.launch();
  var errors = [];

  try {
    var ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
    var page = await ctx.newPage();
    page.on('pageerror', function (e) { errors.push(String(e)); });
    page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });

    group('1. 첫 화면 — 검색창 하나');
    ok(await page.isVisible('#q'), '검색창이 보인다');
    ok(await page.isVisible('#btnGo'), '검색 단추가 보인다');
    eq(await page.textContent('h1'), '사양서 검색', '제목');
    ok((await page.textContent('#idxInfo')).indexOf('색인') >= 0, '색인 건수를 알려 준다');
    ok(await page.locator('.stage.center').count() === 1, '처음엔 검색창이 가운데 있다');
    /* 결과가 없는데 답 상자가 자리를 차지하면 화면이 비어 보인다 */
    eq((await page.textContent('#answer')).trim(), '', '처음엔 답이 비어 있다');

    group('2. 품번으로 조회하면 사양서가 펴진다');
    await page.fill('#q', '420108-02540');
    await page.click('#btnGo');
    await page.waitForSelector('#answer .sheet');
    ok((await page.textContent('.sheet-head .pn')) === '420108-02540', '품번이 크게 보인다');
    var rows = await page.locator('.sheet table tr').count();
    ok(rows >= 5, '항목이 여러 줄 펴진다 (' + rows + '줄)');
    ok((await page.textContent('.sheet')).indexOf('산소호스') >= 0, '모델명이 보인다');
    ok((await page.textContent('.sheet-foot')).indexOf('.xlsx') >= 0, '원본 파일 이름을 알려 준다');
    ok(await page.locator('.stage.center').count() === 0, '결과가 나오면 검색창이 위로 붙는다');

    group('3. 되묻기 — 표로 보여 주되 골라 주지 않는다');
    await page.fill('#q', '호스 검색해줘');
    await page.click('#btnGo');
    await page.waitForSelector('.msg.ask');
    var askMsg = await page.textContent('.msg.ask');
    ok(askMsg.indexOf('어떤 걸 찾으시나요') >= 0, '되묻는 말이 나온다', askMsg);
    ok(await page.locator('#answer .sheet').count() === 0, '되물을 때는 사양서를 펴지 않는다');

    /* 기획서 Format: 표 형식 필수 · 품번/품명/규격/메이커/용도/선택 이유 */
    await page.waitForSelector('table.results');
    var heads = await page.$$eval('table.results thead th',
      function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
    ['품번', '품명', '규격 · 모델', '메이커', '용도', '선택 이유'].forEach(function (h) {
      ok(heads.indexOf(h) >= 0, '표에 「' + h + '」 칸이 있다', JSON.stringify(heads));
    });
    var rows = await page.locator('table.results tbody tr').count();
    ok(rows >= 2 && rows <= 5, '표가 2~5줄이다 (' + rows + '줄)');

    /* 선택 이유는 지어낸 설명이 아니라 판정 근거다 */
    var whys = await page.$$eval('table.results .why',
      function (els) { return els.map(function (e) { return e.textContent.trim(); }); });
    ok(whys.every(function (w) { return w && w !== '-'; }), '모든 줄에 선택 이유가 있다',
       JSON.stringify(whys));
    ok(whys[0].indexOf('호스') >= 0, '무엇이 맞았는지 적는다', whys[0]);

    /* 표가 한 글자씩 접히지 않는지 — 폭이 없는 칸에 긴 글을 넣으면 실제로 그랬다 */
    var rowH = await page.$$eval('table.results tbody tr',
      function (els) { return els.map(function (e) { return e.getBoundingClientRect().height; }); });
    ok(rowH.every(function (h) { return h < 120; }), '표 줄이 세로로 접히지 않는다',
       JSON.stringify(rowH));

    /* 후보를 누르면 그 사양서로 간다 — 기획서의 2번 시나리오 */
    await page.click('table.results button[data-pn="420108-02540"]');
    await page.waitForSelector('#answer .sheet');
    eq(await page.textContent('.sheet-head .pn'), '420108-02540', '고른 사양서가 펴진다');

    group('4. 없을 때 — 기획자가 준 문구 그대로');
    await page.fill('#q', '건조기 필터');
    await page.click('#btnGo');
    await page.waitForSelector('.msg.none');
    var noneMsg = (await page.textContent('.msg.none')).trim();
    eq(noneMsg,
       '저장 되어있는 파일이 없습니다. 내용을 재확인 하거나 생산기술팀에 사양서 등록을 요청 하세요',
       '문구가 기획서와 한 글자도 다르지 않다');

    /* 기획서 Format 5: 결과 없을 때 검색 키워드 제안 */
    await page.fill('#q', '건조기 필터');
    await page.click('#btnGo');
    await page.waitForSelector('.msg.none');
    ok(await page.locator('.suggest button').count() > 0, '대신 쳐 볼 말을 권한다');
    var sug = (await page.textContent('.suggest')).trim();
    ok(sug.indexOf('필터') >= 0, '사용자가 친 말을 권한다', sug);
    /* 권한 말을 누르면 실제로 찾힌다 — 지어낸 말을 권하지 않는다 */
    await page.click('.suggest button');
    await page.waitForTimeout(200);
    ok(await page.locator('#answer .msg.none').count() === 0,
       '권한 말로 검색하면 결과가 나온다');

    group('5. 오늘 검색 기록 창');
    eq(await page.textContent('#logCount'), '6', '검색한 횟수가 세어진다');
    await page.click('#logTab');
    await page.waitForSelector('#logBody:not([hidden])');
    var sum = await page.textContent('#logSum');
    ok(sum.indexOf('6') >= 0, '오늘 요약이 보인다', sum);
    var missing = await page.textContent('#logMissing');
    ok(missing.indexOf('건조기 필터') >= 0, '못 찾은 검색어가 목록에 오른다', missing);
    var list = await page.textContent('#logList');
    ok(list.indexOf('호스 검색해줘') >= 0, '검색한 말이 그대로 남는다');

    /* 기록에서 다시 눌러 본 것은 새 검색으로 세지 않는다 —
     * 그러면 "오늘 몇 번 찾았나"가 눌러 본 횟수만큼 부풀어 오른다 */
    await page.click('#logList button[data-q="건조기 필터"]');
    await page.waitForTimeout(150);
    eq(await page.textContent('#logCount'), '6', '기록을 눌러 봐도 횟수가 늘지 않는다');

    group('6. 예시 단추');
    await page.click('.examples button[data-ex="산소호스 알려줘"]');
    await page.waitForSelector('#answer .sheet');
    eq(await page.textContent('.sheet-head .pn'), '420108-02540', '예시를 누르면 바로 조회된다');

    group('7. 사양서가 아닌 문서는 펴지 않는다');
    await page.fill('#q', '300644-00023');
    await page.click('#btnGo');
    await page.waitForSelector('.msg.none');
    ok(await page.locator('#answer .sheet').count() === 0, '구매목록은 사양서로 펴지지 않는다');
    ok((await page.textContent('.msg.none')).indexOf('구매 목록') >= 0,
       '무엇이 있는지는 알려 준다');

    group('8. 표가 접혀 두 배 높이가 되지 않는다');
    await page.fill('#q', '420108-02540');
    await page.click('#btnGo');
    await page.waitForSelector('#answer .sheet table');
    var heights = await page.$$eval('.sheet table tr', function (els) {
      return els.map(function (e) { return e.getBoundingClientRect().height; });
    });
    var tall = heights.filter(function (h) { return h > 92; });
    ok(tall.length === 0, '한 줄짜리 항목이 두 배로 부풀지 않는다', JSON.stringify(heights));

    group('9. 좁은 화면에서 가로로 넘치지 않는다');
    await page.setViewportSize({ width: 380, height: 780 });
    await page.waitForTimeout(120);
    var over = await page.evaluate(function () {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    ok(over <= 1, '가로 스크롤이 생기지 않는다 (넘침 ' + over + 'px)');
    ok(await page.isVisible('#q'), '좁은 화면에서도 검색창이 보인다');

    group('10. 콘솔에 오류가 없다');
    ok(errors.length === 0, '자바스크립트 오류 없음', errors.join(' | '));

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + (failed ? 'X' : 'O') + ' ' + passed + ' 통과 / ' + failed + ' 실패');
  process.exit(failed ? 1 : 0);
}());
