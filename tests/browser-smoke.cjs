/* Run: node tests/browser-smoke.cjs
 * Requires Playwright and Chromium. Optional: BASE_URL, CHROMIUM_PATH,
 * SMOKE_ROUTES=dashboard,essentials,roppo,glossary,settings,cases.
 * SMOKE_SCREENSHOTS_DIR optionally saves case detail desktop/mobile captures.
 * A temporary local server is started unless BASE_URL is supplied.
 * Speech is mocked: this verifies sequencing and controls, not audio quality.
 */
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const routes = (process.env.SMOKE_ROUTES || 'dashboard,essentials,roppo,glossary,settings,cases').split(',');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.webp':'image/webp', '.mp3':'audio/mpeg', '.wasm':'application/wasm' };

const caseFixtures = Array.from({ length:25 }, (_, index) => ({
  id:`test-case-${index + 1}`, title:`動作確認用裁判例 ${String(index + 1).padStart(2, '0')}`,
  date:`2020-01-${String(index + 1).padStart(2, '0')}`, court:'最高裁判所（テスト用）',
  caseNumber:`令和2年（テスト）第${index + 1}号`, category:index % 2 ? '行政' : '民事',
  summary:index === 0 ? '検索専用語についての動作確認用要旨です。' : '行政処分についての動作確認用要旨です。',
  holding:index === 1 ? '裁判要旨専用語。法律上の利益を具体的に判断するという確認用の裁判要旨です。' : '',
  lawReferences:index === 1 ? '参照法条専用語。行政事件訴訟法第九条。' : '',
  sourceUrl:`https://www.courts.go.jp/test/${index + 1}`, pdfUrl:`https://www.courts.go.jp/test/${index + 1}.pdf`,
  bodyShard:'text/test.json.gz'
}));
const fixtureBodies = Object.fromEntries(caseFixtures.map(record => [record.id, `これは${record.title}の動作確認用の本文です。\n行政処分について判断します。以下はテスト用の文章です。`]));
fixtureBodies['test-case-24'] = 'あ'.repeat(20000) + '二頁目マーカー対象。後続の本文です。';
fixtureBodies['test-case-25'] = '';

async function interceptCases(context) {
  await context.route('**/cases/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname.endsWith('/manifest.json')
      ? { total:caseFixtures.length, bodyCount:caseFixtures.length - 1, coverageComplete:true, index:'index.json.gz', updatedAt:'2026-01-01（テスト）' }
      : pathname.endsWith('/index.json.gz') ? caseFixtures
      : pathname.endsWith('/text/test.json.gz') ? fixtureBodies : null;
    if (!data) return route.fulfill({ status:404, body:'Unknown fixture' });
    const json = JSON.stringify(data);
    return route.fulfill({ status:200, contentType:pathname.endsWith('.gz') ? 'application/gzip' : 'application/json', body:pathname.endsWith('.gz') ? gzipSync(json) : json });
  });
}

async function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }).end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, base:`http://127.0.0.1:${server.address().port}/` };
}

function mockSpeech() {
  const voice = { lang:'ja-JP', name:'Test Japanese', voiceURI:'test-ja', localService:true, default:true };
  window.__speech = { current:null, history:[], cancelled:0 };
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value:class { constructor(text) { this.text = text; } } });
  Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:{
    paused:false, speaking:false,
    getVoices:() => [voice], addEventListener() {},
    speak(utterance) { window.__speech.current = utterance; window.__speech.history.push(utterance.text); this.speaking = true; utterance.onstart?.(); },
    cancel() { window.__speech.current = null; window.__speech.cancelled++; this.speaking = false; },
    pause() { this.paused = true; }, resume() { this.paused = false; }
  } });
}

async function finishCurrentItem(page) {
  await page.evaluate(async () => {
    const initial = GYOSHI_ROPPO.__test.playback().queue?.index;
    for (let i = 0; i < 120; i++) {
      const playback = GYOSHI_ROPPO.__test.playback();
      if (!playback.speaking || playback.queue?.index !== initial) return;
      const current = window.__speech.current;
      if (current) { window.__speech.current = null; current.onend?.(); }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Speech did not finish the current item');
  });
}

async function checkLawPlayback(page, base) {
  await page.goto(base + '#roppo?law=321CONSTITUTION');
  await page.waitForSelector('.rp-article');
  const last = page.locator('.rp-article').last();
  const id = await last.getAttribute('data-article');
  await last.locator('[data-rp="speak-article"]').click();
  const before = await page.evaluate(() => ({ index:GYOSHI_ROPPO.__test.playback().queue.index, page:GYOSHI_ROPPO.__test.s.page }));
  assert.equal(await page.locator('.rp-reading-now').getAttribute('data-article'), id);
  await finishCurrentItem(page);
  const after = await page.evaluate(() => ({ index:GYOSHI_ROPPO.__test.playback().queue.index, page:GYOSHI_ROPPO.__test.s.page }));
  assert.equal(after.index, before.index + 1, 'speech must continue to the next law article');
  assert.equal(after.page, before.page + 1, 'speech must cross the law page boundary');
  assert.equal(await page.locator('.rp-reading-now').count(), 1);

  await page.locator('#content [data-audio="pause"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().paused), true);
  await page.locator('#content [data-audio="pause"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().paused), false);
  await page.locator('#content [data-audio="previous"]').click();
  assert.equal(await page.locator('.rp-reading-now').getAttribute('data-article'), id);
  await page.locator('#content [data-audio="next"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.index), after.index);

  await page.locator('#content [data-audio-continuous]').uncheck();
  await finishCurrentItem(page);
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.index), after.index, 'disabling continuous playback must retain the current item');
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  await page.locator('#content [data-audio="next"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.index), after.index + 1, 'manual next must work after single-item playback');
  await page.locator('#content [data-audio-continuous]').check();

  const current = page.locator('.rp-reading-now');
  await current.locator('[data-rp="bookmark"]').click();
  await page.locator('[data-rp="only-book"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false, 'filtering must stop stale playback');
  assert.equal(await page.locator('.rp-article').count(), 1);
  await page.locator('[data-rp="speak-article"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.items.length), 1, 'queue must follow the active filter');
  await finishCurrentItem(page);
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false, 'last item must stop');
  await page.locator('[data-rp="speak-article"]').click();
  await page.locator('.sidebar [data-value="essentials"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false, 'leaving a section must stop speech');
}

async function checkCases(page, base) {
  await page.goto(base + '#cases');
  await page.waitForSelector('#cl-search');
  assert.equal(await page.locator('#cl-count').innerText(), '25');
  assert.equal(await page.locator('[data-cl="open"]').count(), 20);
  await page.locator('#cl-search').fill('裁判要旨専用語');
  await page.waitForFunction(() => document.getElementById('cl-count')?.textContent === '1');
  await page.locator('[data-cl="open"]').click();
  await page.waitForSelector('#cl-body');
  assert.match(await page.locator('#cl-reader').innerText(), /裁判要旨専用語/);
  await page.locator('[data-cl="speak"]').click();
  await page.waitForFunction(() => GYOSHI_ROPPO.__test.playback().speaking && window.__speech.current);
  await finishCurrentItem(page);
  assert.ok(await page.evaluate(() => window.__speech.history.some(text => text.includes('裁判要旨専用語'))), 'official holdings must be searchable, visible, and spoken');
  await page.locator('#cl-search').fill('参照法条専用語');
  await page.waitForFunction(() => GYOSHI_CASES.__test.filtered().length === 1 && GYOSHI_CASES.__test.filtered()[0].id === 'test-case-2');
  await page.locator('#cl-search').fill('検索専用語');
  await page.waitForFunction(() => document.getElementById('cl-count')?.textContent === '1' && document.querySelector('[data-cl="open"]')?.dataset.id === 'test-case-1');
  await page.locator('[data-cl="open"]').click();
  await page.waitForSelector('#cl-body');
  assert.equal(await page.locator('#cl-reader').getAttribute('data-case-id'), 'test-case-1');
  await page.locator('[data-cl="bookmark"]').click();
  await page.locator('.cl-notes:has(#cl-note) > summary').click();
  await page.locator('#cl-note').fill('検証用メモ。争点と判断を確認。');
  await page.locator('#cl-status').selectOption('mastered');
  const quote = await page.locator('#cl-body').evaluate(body => {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(first, Math.min(5, first.textContent.length));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return range.toString();
  });
  await page.locator('[data-cl="mark"][data-color="yellow"]').click();
  assert.equal(await page.locator('#cl-body mark').innerText(), quote);
  await page.reload();
  await page.waitForSelector('#cl-body');
  assert.equal(await page.locator('[data-cl="bookmark"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#cl-status').inputValue(), 'mastered');
  assert.equal(await page.locator('#cl-note').inputValue(), '検証用メモ。争点と判断を確認。');
  assert.equal(await page.locator('#cl-body mark').innerText(), quote);

  await page.locator('#cl-search').fill('一致しない検索語ZZZ');
  await page.waitForFunction(() => document.getElementById('cl-count')?.textContent === '0');
  assert.equal(await page.locator('[data-cl="open"]').count(), 0);
  await page.locator('#cl-search').fill('');
  await page.waitForFunction(() => document.getElementById('cl-count')?.textContent === '25');
  await page.locator('#cl-filter').selectOption('bookmarked');
  assert.equal(await page.locator('#cl-count').innerText(), '1');
  await page.locator('[data-cl="speak-results"]').click();
  await page.waitForFunction(() => GYOSHI_ROPPO.__test.playback().speaking && window.__speech.current);
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.items.length), 1);
  await finishCurrentItem(page);
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  assert.ok(await page.evaluate(() => window.__speech.history.some(text => text.includes('動作確認用の本文'))), 'case playback must include loaded full text');

  await page.locator('#cl-filter').selectOption('all');
  await page.locator('[data-cl="open"]').nth(19).click();
  await page.waitForFunction(() => document.getElementById('cl-reader')?.dataset.caseId === 'test-case-20');
  await page.locator('[data-cl="speak"]').click();
  await page.waitForFunction(() => GYOSHI_ROPPO.__test.playback().queue?.index === 19 && window.__speech.current);
  await finishCurrentItem(page);
  await page.waitForFunction(() => document.getElementById('cl-reader')?.dataset.caseId === 'test-case-21');
  assert.equal(await page.evaluate(() => GYOSHI_CASES.__test.view.page), 2, 'case playback must cross result pages');
  assert.equal(await page.locator('[data-cl="open"]').first().getAttribute('data-id'), 'test-case-21');
  await page.locator('#content [data-audio="previous"]').click();
  await page.waitForFunction(() => document.getElementById('cl-reader')?.dataset.caseId === 'test-case-20');
  assert.equal(await page.evaluate(() => GYOSHI_CASES.__test.view.page), 1);
  await page.locator('#cl-category').selectOption('民事');
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  assert.equal(await page.locator('#cl-count').innerText(), '13');
  await page.locator('[data-cl="speak"]').click();
  await page.waitForFunction(() => GYOSHI_ROPPO.__test.playback().speaking && window.__speech.current);
  assert.deepEqual(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.items.map(item => item.id)), ['test-case-20'], 'a visible selected case outside the filter must read that case only');
  await finishCurrentItem(page);
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  assert.equal(await page.locator('#cl-reader').getAttribute('data-case-id'), 'test-case-20');

  await page.locator('[data-cl="open"][data-id="test-case-25"]').click();
  await page.waitForFunction(() => {
    const section = document.querySelector('.cl-text-section');
    return section && !section.textContent.includes('本文を読み込んでいます');
  }, null, { timeout:3000 });
  assert.match(await page.locator('.cl-text-section').innerText(), /未収録|見つかりません/);

  await page.evaluate(() => {
    const search = document.getElementById('cl-search');
    search.value = '画面移動前の検索語';
    search.dispatchEvent(new Event('input', { bubbles:true }));
    document.querySelector('.sidebar [data-value="dashboard"]').click();
  });
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.hash), '#dashboard', 'a delayed case search must not navigate back after leaving the page');
  assert.equal(await page.locator('#content h1').innerText(), '朱引文庫');

  await page.locator('.sidebar [data-value="settings"]').click();
  const downloading = page.waitForEvent('download');
  await page.locator('[data-action="export"]').first().click();
  const backup = JSON.parse(await fs.readFile(await (await downloading).path(), 'utf8'));
  assert.equal(backup.data.cases['test-case-1'].note, '検証用メモ。争点と判断を確認。');
  assert.equal(backup.data.cases['test-case-1'].bookmarked, true);
  assert.equal(backup.data.cases['test-case-1'].status, 'mastered');
  assert.equal(backup.data.cases['test-case-1'].marks[0].quote, quote);
  backup.data.cases['test-case-1'].note = 'バックアップから復元したメモ';
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({ name:'backup.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction(() => location.hash === '#dashboard');
  await page.goto(base + '#cases?id=test-case-1');
  await page.waitForSelector('#cl-body');
  assert.equal(await page.locator('#cl-note').inputValue(), 'バックアップから復元したメモ');
  assert.equal(await page.locator('#cl-body mark').innerText(), quote);

  await page.goto(base + '#cases?id=test-case-24');
  await page.waitForSelector('#cl-body');
  assert.equal((await page.locator('#cl-body').textContent()).length, 20000);
  await page.locator('[data-cl="body-page"][data-page="2"]').click();
  assert.equal(await page.locator('#cl-body').getAttribute('data-offset'), '20000');
  const longQuote = await page.locator('#cl-body').evaluate(body => {
    const first = document.createTreeWalker(body, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(first, Math.min(5, first.textContent.length));
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    return range.toString();
  });
  await page.locator('[data-cl="mark"][data-color="blue"]').click();
  const savedMark = await page.evaluate(() => JSON.parse(localStorage.getItem('gyosei_master_state_v2')).cases['test-case-24'].marks[0]);
  assert.ok(savedMark.start >= 20000 && savedMark.end > 20000, 'second-page markers must use full-body offsets');
  assert.equal(fixtureBodies['test-case-24'].slice(savedMark.start, savedMark.end), longQuote);
  await page.reload();
  await page.waitForSelector('#cl-body');
  await page.locator('[data-cl="body-page"][data-page="2"]').click();
  assert.equal(await page.locator('#cl-body mark.cl-blue').innerText(), longQuote, 'second-page markers must survive reload');

  if (process.env.SMOKE_SCREENSHOTS_DIR) {
    await page.goto(base + '#cases?id=test-case-1');
    await fs.mkdir(process.env.SMOKE_SCREENSHOTS_DIR, { recursive:true });
    for (const [label, width] of [['desktop',1440], ['mobile',390]]) {
      await page.setViewportSize({ width, height:900 });
      await page.reload();
      await page.waitForSelector('#cl-body');
      await page.evaluate(() => scrollTo({ top:0, behavior:'instant' }));
      await page.waitForTimeout(350);
      await page.screenshot({ path:path.join(process.env.SMOKE_SCREENSHOTS_DIR, `cases-${label}.png`), fullPage:true });
    }
  }
}

async function checkCaseFetchRecovery(context, base) {
  const page = await context.newPage();
  const rows = caseFixtures.map((record, index) => ({ ...record, bodyShard:`text/individual-${index + 1}.json.gz` }));
  const attempts = new Map();
  let delayedRoute, requestSeen;
  const delayedRequest = new Promise(resolve => { requestSeen = resolve; });
  await page.route('**/cases/index.json.gz*', route => route.fulfill({ status:200, contentType:'application/gzip', body:gzipSync(JSON.stringify(rows)) }));
  await page.route('**/cases/text/individual-*.json.gz*', route => {
    const number = Number(/individual-(\d+)\.json/.exec(route.request().url())[1]);
    const attempt = (attempts.get(number) || 0) + 1; attempts.set(number, attempt);
    if (number === 1 && attempt === 1) { delayedRoute = route; requestSeen(); return; }
    if (number === 3 && attempt === 1) return route.fulfill({ status:503, body:'Temporary fixture failure' });
    const id = `test-case-${number}`;
    return route.fulfill({ status:200, contentType:'application/gzip', body:gzipSync(JSON.stringify({ [id]:fixtureBodies[id] })) });
  });
  try {
    await page.goto(base + '#cases?id=test-case-1');
    await delayedRequest;
    await page.evaluate(() => location.hash = '#cases?id=test-case-2');
    await page.waitForSelector('#cl-body');
    const failureResponse = page.waitForResponse(response => response.url().includes('individual-1.json.gz'));
    await delayedRoute.fulfill({ status:503, body:'Temporary fixture failure' });
    await (await failureResponse).finished();
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    await page.evaluate(() => location.hash = '#cases?id=test-case-1');
    await page.waitForFunction(() => document.querySelector('#cl-reader')?.dataset.caseId === 'test-case-1' && document.querySelector('#cl-body'), null, { timeout:5000 });
    assert.equal(attempts.get(1), 2, 'a request failing after navigation must be retried when its case is reopened');

    await page.evaluate(() => location.hash = '#cases?id=test-case-3');
    await page.waitForSelector('[data-cl="retry-body"]');
    await page.evaluate(() => location.hash = '#cases?id=test-case-4');
    await page.waitForFunction(() => document.querySelector('#cl-reader')?.dataset.caseId === 'test-case-4' && document.querySelector('#cl-body'), null, { timeout:5000 });
    assert.equal(attempts.get(4), 1, 'a previous case error must not block loading a different deep-linked case');
  } finally { await page.close(); }
}

async function checkGlossaryPlayback(page, base) {
  await page.goto(base + '#glossary');
  await page.waitForSelector('[data-guide-read-results]');
  await page.locator('[data-guide-read-results]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.kind), 'glossary');
  await page.evaluate(() => GYOSHI_ROPPO.__test.skipSpeech(59));
  assert.match(await page.locator('.sg-index-pagination > span').innerText(), /^1 \/ /);
  await finishCurrentItem(page);
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.index), 60);
  assert.match(await page.locator('.sg-index-pagination > span').innerText(), /^2 \/ /);
  assert.equal(await page.locator('.sg-index-item.rp-reading-now').count(), 1);
  assert.equal(await page.locator('.sg-index-item.rp-reading-now').getAttribute('aria-current'), 'true');

  await page.locator('#sg-search').fill('相殺');
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  const count = Number((await page.locator('.sg-result-count').innerText()).replace(/[^0-9]/g, ''));
  assert.ok(count > 0 && count < 60);
  await page.locator('[data-guide-read-results]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.items.length), count);
  await page.locator('#sg-index-law').selectOption('civil');
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  await page.locator('[data-audio="read-screen"]').evaluate(button => button.closest('details').open = true);
  await page.locator('[data-audio="read-screen"]').click();
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().queue.kind), 'glossary', 'global read-screen must delegate to glossary entries');
  await page.locator('[data-audio="read-screen"]').evaluate(button => button.closest('details').open = false);
  await page.locator('#sg-search').fill('存在しない用語ZZZ');
  assert.equal(await page.evaluate(() => GYOSHI_ROPPO.__test.playback().speaking), false);
  assert.equal(await page.locator('.sg-index-item').count(), 0);
}

async function main() {
  let local, browser;
  const failures = [];
  try {
    local = process.env.BASE_URL ? null : await serve();
    const base = (process.env.BASE_URL || local.base).replace(/\/?$/, '/');
    browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
    const context = await browser.newContext({ serviceWorkers:'block' });
    await context.addInitScript(mockSpeech);
    await interceptCases(context);
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().startsWith(base)) failures.push(`HTTP ${response.status()} ${response.url()}`);
    });
    let layouts = 0;
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({ width, height:900 });
      for (const route of routes) {
        await page.goto(base + '#' + route);
        await page.waitForSelector('#content h1');
        if (route === 'roppo') await page.waitForSelector('.rp-article');
        if (route === 'cases') await page.waitForSelector('#cl-search');
        const layout = await page.evaluate(() => ({
          width:innerWidth, scroll:document.documentElement.scrollWidth,
          titles:document.querySelectorAll('#content h1').length,
          heading:document.querySelector('#content h1').textContent,
          duplicates:Object.entries([...document.querySelectorAll('[id]')].reduce((out, el) => (out[el.id] = (out[el.id] || 0) + 1, out), {})).filter(([, count]) => count > 1)
        }));
        assert.ok(layout.scroll <= layout.width + 1, `${route} overflows at width ${width}`);
        assert.equal(layout.titles, 1, `${route} must have one page heading`);
        assert.deepEqual(layout.duplicates, [], `${route} must not duplicate element IDs`);
        if (route === 'cases') {
          assert.match(layout.heading, /判例|裁判例/);
          assert.ok(await page.evaluate(() => Boolean(window.GYOSHI_CASES)), 'case library must be loaded');
        }
        layouts++;
      }
    }
    if (routes.includes('roppo')) await checkLawPlayback(page, base);
    if (routes.includes('glossary')) await checkGlossaryPlayback(page, base);
    if (routes.includes('cases')) { await checkCases(page, base); await checkCaseFetchRecovery(context, base); }
    assert.deepEqual(failures, [], 'browser errors or missing assets');
    console.log(`PASS: ${layouts} route/viewport layouts, asset loading, playback/navigation/filter checks, and case study records with backup/restore (25 fixture records).`);
  } finally {
    await browser?.close();
    if (local) await new Promise(resolve => local.server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
