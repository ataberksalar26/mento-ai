const fs = require('node:fs');
const path = require('node:path');

const sources = {
  LGS: [{ title: 'MEB - LGS örnek sorular ve çıkmış sorular', url: 'https://mimarsinanoo.meb.k12.tr/icerikler/lgscikmisveorneksorular_16286742.html' }],
  TYT: [{ title: 'OGM Materyal - Soru bankası', url: 'https://ogmmateryal.eba.gov.tr/soru-bankasi' }],
  AYT: [{ title: 'OGM Materyal - Soru bankası', url: 'https://ogmmateryal.eba.gov.tr/soru-bankasi' }]
};
function validateBank(bank) {
  if (!bank || bank.version !== 1 || !Array.isArray(bank.tests)) throw new Error('Invalid question bank');
  const keys = new Set();
  const ids = new Set();
  for (const test of bank.tests) {
    const key = [test.exam, test.lesson, test.topic].join('|');
    if (!sources[test.exam] || !test.lesson || !test.topic || keys.has(key)) throw new Error('Invalid or duplicate topic: ' + key);
    keys.add(key);
    if (!Array.isArray(test.questions) || test.questions.length !== 30) throw new Error('Each topic needs exactly 30 questions: ' + key);
    const texts = new Set();
    for (const q of test.questions) {
      if (!q.id || ids.has(q.id) || typeof q.question !== 'string' || !q.question.trim() || texts.has(q.question.trim())) throw new Error('Invalid or duplicate question');
      ids.add(q.id); texts.add(q.question.trim());
      if (!Array.isArray(q.options) || ![4, 5].includes(q.options.length) || q.options.some(o => typeof o !== 'string' || !o.trim()) || new Set(q.options).size !== q.options.length) throw new Error('Invalid options: ' + q.id);
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length || !q.explanation?.trim()) throw new Error('Invalid answer: ' + q.id);
      if (!['orta', 'zor'].includes(q.difficulty) || !q.reviewedBy?.trim()) throw new Error('Question needs difficulty and editorial review: ' + q.id);
      if (!q.source?.title || !/^https:\/\//.test(q.source.url || '') || !q.source.license || !q.source.permissionReference || q.source.origin !== 'published') throw new Error('Question needs source and reuse permission: ' + q.id);
      if (q.image && !/^\/assets\/questions\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(q.image)) throw new Error('Invalid image path: ' + q.id);
    }
  }
  return bank;
}
function loadBank(file = path.join(__dirname, 'data', 'question-bank.json')) {
  return validateBank(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function findTest(bank, exam, lesson, topic) {
  return bank.tests.find(test => test.exam === exam && test.lesson === lesson && test.topic === topic);
}
module.exports = { sources, validateBank, loadBank, findTest };
