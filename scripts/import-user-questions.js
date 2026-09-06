const fs = require('node:fs');
const path = require('node:path');
const { validateBank } = require('../question-bank');

function plainMath(text) {
  let value = text.replace(/\\\(|\\\)|\$\$/g, '').replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\Box/g, '□').replace(/\\blacksquare/g, '■').replace(/\\qquad/g, '  ').replace(/\\[,; ]/g, ' ');
  for (let i = 0; i < 5; i++) value = value.replace(/\\(?:text|operatorname|boxed)\{([^{}]*)\}/g, '$1');
  value = value.replace(/\^([0-9])/g, (_, n) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(n)]);
  if (/\\[a-zA-Z]|\\[()]/.test(value)) throw new Error('Unsupported math notation: ' + value);
  return value.trim();
}
function parse(text) {
  const blocks = text.replace(/\r/g, '').split(/(?=^Soru numarası:)/m).filter(s => s.trim().startsWith('Soru numarası:'));
  const questions = blocks.map((block, i) => {
    const match = block.match(/^Soru numarası:\s*(\d+)\nSınav:\s*LGS\nDers:\s*Matematik\nKonu:\s*Çarpanlar ve Katlar\nZorluk:\s*(Orta|Zor)\s*\n+Soru metni:\s*\n([\s\S]+?)\nA\)\s*([^\n]+)\nB\)\s*([^\n]+)\nC\)\s*([^\n]+)\nD\)\s*([^\n]+)\s*\n+Doğru cevap:\s*([ABCD])\s*\n+Adım adım çözüm:\s*\n([\s\S]*?)(?:\nKontrol edilmiş cevap anahtarı[\s\S]*)?\s*$/);
    if (!match || Number(match[1]) !== i + 1) throw new Error('Invalid question block ' + (i + 1));
    return {
      id: 'lgs-matematik-carpanlar-katlar-user-v1-' + String(i + 1).padStart(2, '0'),
      question: plainMath(match[3]), options: match.slice(4, 8).map(plainMath), correctIndex: 'ABCD'.indexOf(match[8]),
      explanation: plainMath(match[9]), difficulty: match[2] === 'Orta' ? 'orta' : 'zor',
      reviewedBy: 'Codex: hesap ve tek doğru seçenek kontrolü; öğretmen incelemesi değildir',
      source: { origin: 'user-ai', title: 'ChatGPT ile hazırlanmış, kullanıcı tarafından sağlanmış soru', document: 'lgs-carpanlar-katlar-2026-09-06', permissionReference: 'Kullanıcının 6 Eylül 2026 tarihli bu soruları kullan talebi', questionNumber: i + 1 }
    };
  });
  if (questions.length !== 30) throw new Error('Expected exactly 30 questions');
  // Specify the complete factor sets rather than an unspecified subset of cards.
  questions[0].question = '36’nın bütün pozitif tam sayı çarpanları birer karta, 48’in bütün pozitif tam sayı çarpanları da ayrı birer karta yazılıyor. Her iki grupta da bulunan sayılar birer kez tahtaya yazılıyor.\n\nTahtaya kaç farklı sayı yazılır?';
  questions[0].source.editNote = 'Bütün çarpanların kullanıldığı açıklaştırıldı; sayılar ve cevap değişmedi.';
  return { exam: 'LGS', lesson: 'Matematik', topic: 'Çarpanlar ve Katlar', questions };
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file) throw new Error('Provide the user question text file');
  const test = parse(fs.readFileSync(file, 'utf8'));
  const bankPath = path.join(__dirname, '../data/question-bank.json');
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  bank.tests = bank.tests.filter(t => !(t.exam === test.exam && t.lesson === test.lesson && t.topic === test.topic));
  bank.tests.push(test); validateBank(bank);
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n');
  console.log('Imported 30 user-provided AI questions; original source attribution preserved.');
}
module.exports = { parse, plainMath };
