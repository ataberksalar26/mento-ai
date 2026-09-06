const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiBudget, context } = require('../ai-budget');
const { validateBank, findTest } = require('../question-bank');

function setup(t, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mento-budget-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'usage.json');
  let time = Date.parse('2026-09-05T12:00:00Z');
  const calls = [];
  const options = { env, file, now: () => time, fetch: async (_url, init) => { calls.push(JSON.parse(init.body)); return new Response('{"output_text":"answer"}'); } };
  const budget = createAiBudget(options);
  const invoke = (address = '10.0.0.1', url = '/api/coach', input = 'question', tokens = 900, instance = budget) => context.run({ req: { url, headers: {}, socket: { remoteAddress: address } } }, () => instance.request('https://api.openai.com/v1/responses', { body: JSON.stringify({ input, max_output_tokens: tokens }) }));
  return { budget, invoke, calls, options, file, advance: ms => { time += ms; } };
}
test('daily quota survives restart, cannot be bypassed by another AI route, resets next day', async t => {
  const s = setup(t, { AI_DAILY_IP_LIMIT: '2', AI_MINUTE_IP_LIMIT: '10' });
  await s.invoke(); await s.invoke();
  const restarted = createAiBudget(s.options);
  await assert.rejects(s.invoke('10.0.0.1', '/api/vision-solve', 'different', 900, restarted), { status: 429 });
  assert.equal(s.calls.length, 2);
  s.advance(86400000);
  await s.invoke('10.0.0.1', '/api/coach', 'next day', 900, restarted);
  assert.equal(s.calls.length, 3);
});
test('global cap covers different clients and limits output per request', async t => {
  const s = setup(t, { AI_DAILY_SITE_LIMIT: '2' });
  await s.invoke('10.0.0.1', '/api/coach', 'a', 12000);
  await s.invoke('10.0.0.2');
  await assert.rejects(s.invoke('10.0.0.3'), { status: 429 });
  assert.equal(s.calls[0].max_output_tokens, 1800);
});
test('cached and concurrent identical lectures make one paid request', async t => {
  const s = setup(t);
  const results = await Promise.all([s.invoke('a', '/api/topic-lecture'), s.invoke('b', '/api/topic-lecture')]);
  for (const result of results) assert.equal((await result.json()).output_text, 'answer');
  await s.invoke('c', '/api/topic-lecture');
  assert.equal(s.calls.length, 1);
});
test('oversized input, corrupt ledger and minute limit prevent paid calls', async t => {
  const s = setup(t, { AI_MINUTE_IP_LIMIT: '1' });
  await assert.rejects(s.invoke('a', '/api/coach', 'x'.repeat(20000)), { status: 413 });
  await s.invoke();
  await assert.rejects(s.invoke(), { status: 429 });
  s.advance(61000); await s.invoke();
  fs.writeFileSync(s.file, 'bad json');
  await assert.rejects(s.invoke('other', '/api/coach', 'x', 900, createAiBudget(s.options)), { status: 503 });
  assert.equal(s.calls.length, 2);
});
test('global token reservations and concurrency are enforced before upstream calls', async t => {
  const s = setup(t, { AI_DAILY_OUTPUT_TOKENS: '1000' });
  await s.invoke();
  await assert.rejects(s.invoke('other'), { status: 429 });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const single = createAiBudget({ ...s.options, file: s.file + '.other', env: { AI_CONCURRENT_LIMIT: '1' }, fetch: async () => { await pending; return new Response('{}'); } });
  const first = s.invoke('a', '/api/coach', 'one', 900, single);
  await assert.rejects(s.invoke('b', '/api/coach', 'two', 900, single), { status: 429 });
  release(); await first;
});
test('question bank requires 30 distinct reviewed sourced questions and accepts five options', () => {
  // Synthetic fixtures exercise the schema only; never published as study content.
  const questions = Array.from({ length: 30 }, (_, i) => ({ id: 'test-' + i, question: 'Fixture ' + i, options: ['a','b','c','d','e'], correctIndex: 4, explanation: 'Fixture explanation', difficulty: 'zor', reviewedBy: 'test', source: { title: 'Fixture', url: 'https://example.org', license: 'test-only', permissionReference: 'test-only', origin: 'published' } }));
  const bank = { version: 1, tests: [{ exam: 'AYT', lesson: 'Matematik', topic: 'Fonksiyonlar', questions }] };
  assert.equal(findTest(validateBank(bank), 'AYT', 'Matematik', 'Fonksiyonlar').questions.length, 30);
  const missing = structuredClone(bank); delete missing.tests[0].questions[0].source;
  assert.throws(() => validateBank(missing));
  const short = structuredClone(bank); short.tests[0].questions.pop();
  assert.throws(() => validateBank(short));
});
