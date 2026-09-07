const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('C:/Users/atabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mento-ui-'));
const port = process.env.TEST_PORT || '3198';
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: port, OPENAI_API_KEY: 'disabled', AI_USAGE_FILE: path.join(dir, 'usage.json') }, windowsHide: true });
let browser;
(async () => {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 10000);
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code)); });
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  for (const resource of ['/server.js', '/users.json', '/.env', '/.runtime/ai-usage.json', '/ai-budget.js', '/data/question-bank.json']) assert.equal((await fetch(base + resource)).status, 403);
  const pending = await fetch(base + '/api/question-bank', { method: 'POST', body: JSON.stringify({ exam:'AYT', lesson:'Matematik', topic:'Fonksiyonlar' }) });
  assert.equal(pending.status, 404);
  assert.equal((await pending.json()).code, 'QUESTION_BANK_PENDING');
  assert.equal((await (await fetch(base+'/api/ai-usage')).json()).remaining, 20);
  browser = await chromium.launch({ headless:true, channel:'chrome' });
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const aiRequests = []; page.on('request', req => { if(req.url().includes('/api/generate-quiz')) aiRequests.push(req.url()); });
  await page.goto(base+'/panel/konu-anlatimi');
  await page.locator('#currentExamLabel').waitFor();
  await page.evaluate(()=>openTopicLearning('LGS','Matematik','Çarpanlar ve Katlar',true));
  await page.locator('#beginQuiz').click();
  await page.locator('[data-test-number="1"]').waitFor();
  assert.equal(await page.locator('[data-test-number]').count(),3);
  await page.locator('[data-test-number="2"]').click();
  await page.locator('[data-jump="1"]').click();
  assert.equal(await page.locator('.question-table tbody tr').count(),6);
  assert.equal(await page.locator('a.question-source').count(),0);
  assert.match(await page.locator('.question-source').textContent(),/ChatGPT/);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.study-body').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  await page.screenshot({path:path.join(__dirname,'user-questions-mobile.png')});
  const real=require('../data/question-bank.json').tests.find(t=>t.exam==='LGS'&&t.topic==='Çarpanlar ve Katlar');
  for(let i=0;i<10;i++){await page.locator('[data-jump="'+i+'"]').click();await page.locator('[data-answer="'+real.questions[i+10].correctIndex+'"]').click();}
  await page.locator('#finishQuiz').click();await page.getByText('10 doğru · 0 yanlış · 0 boş').waitFor();
  await page.locator('#backToTests').click();await page.locator('[data-test-number="1"]').click();
  assert.equal(await page.locator('[data-answer][aria-pressed="true"]').count(),0);
  await page.locator('#backToTests').click();await page.locator('[data-test-number="2"]').click();
  await page.getByText('10 doğru · 0 yanlış · 0 boş').waitFor();
  await page.locator('.close-study').click();await page.setViewportSize({width:1440,height:1000});
  for(const test of require('../data/question-bank.json').tests){
    await page.evaluate(t=>openTopicLearning(t.exam,t.lesson,t.topic,true),test);
    await page.locator('#beginQuiz').click();await page.locator('[data-test-number="3"]').waitFor();
    assert.equal(await page.locator('[data-test-number]').count(),3);
    for(let n=1;n<=3;n++){
      await page.locator('[data-test-number="'+n+'"]').click();
      if(await page.locator('#retryQuiz').count())await page.locator('#retryQuiz').click();
      assert.equal(await page.locator('[data-jump]').count(),10);
      for(let i=0;i<10;i++){
        await page.locator('[data-jump="'+i+'"]').click();
        await page.locator('[data-answer="'+test.questions[(n-1)*10+i].correctIndex+'"]').click();
      }
      await page.locator('#finishQuiz').click();await page.getByText('10 doğru · 0 yanlış · 0 boş').waitFor();
      await page.locator('#backToTests').click();
    }
    await page.locator('.close-study').click();
  }
  // Old 30-question progress is split without overwriting a newer ten-question attempt.
  await page.evaluate(test=>{
    const key='mentoReadyQuiz:v1:LGS|Matematik|Çarpanlar ve Katlar';
    [1,2,3].forEach(n=>localStorage.removeItem(key+'|test:'+n));
    localStorage.setItem(key,JSON.stringify({questions:test.questions,answers:test.questions.map(q=>q.correctIndex),finished:true}));
  },real);
  await page.evaluate(()=>openTopicLearning('LGS','Matematik','Çarpanlar ve Katlar',true));
  await page.locator('#beginQuiz').click();await page.locator('[data-test-number="3"]').click();
  await page.getByText('10 doğru · 0 yanlış · 0 boş').waitFor();
  await page.locator('#retryQuiz').click();await page.locator('[data-answer="0"]').click();
  await page.locator('.close-study').click();
  await page.evaluate(()=>openTopicLearning('LGS','Matematik','Çarpanlar ve Katlar',true));
  await page.locator('#beginQuiz').click();await page.locator('[data-test-number="3"]').click();
  assert.equal(await page.locator('[data-answer="0"]').getAttribute('aria-pressed'),'true');
  await page.getByText('1 cevaplandı',{exact:true}).waitFor();
  await page.locator('.close-study').click();
  await page.evaluate(()=>openTopicLearning('LGS','Matematik','Kareköklü İfadeler',true));
  await page.locator('#beginQuiz').click();await page.setViewportSize({width:390,height:844});
  await page.locator('[data-test-number="3"]').waitFor();
  await page.screenshot({path:path.join(__dirname,'numbered-tests-mobile.png')});
  await page.locator('[data-test-number="2"]').click();await page.locator('#retryQuiz').click();
  assert.ok(await page.locator('.study-body').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  await page.screenshot({path:path.join(__dirname,'radicals-test-mobile.png')});
  await page.locator('.close-study').click();await page.setViewportSize({width:1440,height:1000});
  await page.locator('#examDropdown summary').click();
  const summary = await page.locator('#examDropdown summary').boundingBox();
  const options = await page.locator('.exam-options').boundingBox();
  assert.ok(options.y >= summary.y+summary.height);
  await page.screenshot({ path:path.join(__dirname,'exam-menu-desktop.png') });
  await page.locator('[data-main-exam="AYT"]').click();
  assert.equal(await page.locator('#currentExamLabel').textContent(), 'AYT');
  assert.equal(await page.locator('#profileMode').textContent(), 'AYT hedef modu');
  await page.reload();
  assert.equal(await page.locator('#currentExamLabel').textContent(), 'AYT');
  await page.locator('[data-topic="Fonksiyonlar"]').click();
  await page.locator('#testTab').click(); await page.locator('#beginQuiz').click();
  await page.getByText('Bu konu için hazır test henüz eklenmedi.', { exact:true }).waitFor();
  assert.equal(await page.locator('.question-source').count(), 1);
  await page.locator('.close-study').click();
  // Synthetic fixtures are confined to intercepted test traffic.
  await page.route('**/api/question-bank', route => route.fulfill({ json: { source:'question-bank', quiz: { questions:Array.from({length:30}, (_, i) => ({ question:'Test fixture '+i, options:['A','B','C','D','E'], correctIndex:4, explanation:'Fixture explanation', source:{title:'Fixture',url:'https://example.org',license:'test-only'} })) } } }));
  await page.locator('[data-topic="Fonksiyonlar"]').click();
  await page.locator('#testTab').click(); await page.locator('#beginQuiz').click();
  await page.locator('[data-test-number="3"]').click();
  for(let i=0;i<10;i++) { await page.locator('[data-answer="4"]').click(); if(i<9)await page.locator('#nextQuestion').click(); }
  await page.locator('#finishQuiz').click();
  await page.getByText('10 doğru · 0 yanlış · 0 boş').waitFor();
  await page.locator('.close-study').click();
  await page.setViewportSize({ width:390, height:844 });
  await page.locator('#examDropdown summary').scrollIntoViewIfNeeded();
  await page.locator('#examDropdown summary').click();
  await page.screenshot({ path:path.join(__dirname,'exam-menu-mobile.png') });
  const mobile = await page.locator('.exam-options').boundingBox();
  assert.ok(mobile.x>=0 && mobile.x+mobile.width<=390);
  await page.locator('[data-main-exam="TYT"]').click();
  assert.equal(await page.locator('#profileMode').textContent(),'TYT hedef modu');
  assert.deepEqual(aiRequests, []);
  assert.deepEqual(errors, []);
  console.log('PASS: private files blocked, missing test, menu, isolated numbered ten-question tests/results, mobile layout, no AI requests or JS errors.');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  await browser?.close();
  server.kill();
  fs.rmSync(dir,{recursive:true,force:true});
});
