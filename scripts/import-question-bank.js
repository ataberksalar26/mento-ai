const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateBank, loadBank } = require('../question-bank');
const root = path.join(__dirname, '..');
const match = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/const topicBanks = (\{[\s\S]*?\n    \});/);
const curriculum = vm.runInNewContext('(' + match[1] + ')');
const topics = Object.entries(curriculum).flatMap(([exam, lessons]) => Object.entries(lessons).flatMap(([lesson, rows]) => rows.map(([topic]) => [exam, lesson, topic].join('|'))));
let bank = loadBank();
if (process.argv[2]) {
  const incoming = validateBank(JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8')));
  const merged = new Map(bank.tests.map(t => [[t.exam, t.lesson, t.topic].join('|'), t]));
  for (const test of incoming.tests) {
    const key = [test.exam, test.lesson, test.topic].join('|');
    if (!topics.includes(key)) throw new Error('Unknown curriculum topic: ' + key);
    for (const q of test.questions) if (q.image && !fs.existsSync(path.join(root, q.image))) throw new Error('Missing question image: ' + q.image);
    merged.set(key, test);
  }
  bank = validateBank({ version: 1, tests: [...merged.values()] });
  fs.writeFileSync(path.join(root, 'data', 'question-bank.json'), JSON.stringify(bank, null, 2) + '\n');
}
const complete = new Set(bank.tests.map(t => [t.exam, t.lesson, t.topic].join('|')));
console.log(JSON.stringify({ topics: topics.length, ready: complete.size, questions: complete.size * 30, missing: topics.filter(t => !complete.has(t)) }, null, 2));
