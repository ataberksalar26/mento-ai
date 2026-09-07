const fs = require('node:fs');
const path = require('node:path');
const { validateBank } = require('../question-bank');

// Parse the limited TeX vocabulary in the supplied document, including nested groups.
function plainMath(input) {
  const text = input.replace(/\\\(|\\\)|\$\$/g, '');
  let at = 0;
  function atom() {
    while (text[at] === ' ') at++;
    if (text[at] === '{') { at++; const result = sequence(true); return result; }
    if (text[at] === '\\') return command();
    if (at >= text.length) throw new Error('Missing math argument');
    return text[at++];
  }
  function command() {
    at++;
    const match = text.slice(at).match(/^[a-zA-Z]+/);
    if (!match) { const char = text[at++]; if ('%,; '.includes(char)) return char === '%' ? '%' : ' '; throw new Error('Unknown escape ' + char); }
    const name = match[0]; at += name.length;
    const symbols = { times:'×', cdot:'·', div:'÷', circ:'°', qquad:'  ', quad:' ', le:'≤', ge:'≥', ldots:'…', cong:'≅', sim:'∼', Rightarrow:'⇒', to:'→', min:'min', pi:'π' };
    if (name in symbols) return symbols[name];
    if (['boxed','text','operatorname'].includes(name)) return atom();
    if (name === 'sqrt') return '√(' + atom() + ')';
    if (name === 'frac') return '(' + atom() + ')/(' + atom() + ')';
    throw new Error('Unsupported TeX command: ' + name);
  }
  function sequence(group = false) {
    let out = '';
    while (at < text.length) {
      if (text[at] === '}') { if (!group) throw new Error('Unexpected group end'); at++; return out; }
      if (text[at] === '^') {
        at++; const power = atom();
        const chars = '0123456789+-'; const supers = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
        out += power === '°' ? '°' : /^[\d+-]+$/.test(power) ? [...power].map(c => supers[chars.indexOf(c)]).join('') : '^(' + power + ')';
      } else if (text[at] === '\\' || text[at] === '{') out += atom();
      else out += text[at++];
    }
    if (group) throw new Error('Unclosed math group');
    return out;
  }
  return sequence().trim();
}
function parse(text) {
  const start = Number(text.match(/Soru numarası:\s*(\d+)/)?.[1]);
  if (![31,121].includes(start)) throw new Error('Unsupported batch');
  const topics = start === 31 ? ['Üslü İfadeler', 'Kareköklü İfadeler', 'Veri Analizi'] : ['Basit Olayların Olma Olasılığı','Cebirsel İfadeler ve Özdeşlikler','Doğrusal Denklemler','Eşitsizlikler','Üçgenler'];
  const slugs = start === 31 ? ['uslu-ifadeler', 'karekoklu-ifadeler', 'veri-analizi'] : ['olasilik','cebirsel-ifadeler-ozdeslikler','dogrusal-denklemler','esitsizlikler','ucgenler'];
  const blocks = text.replace(/\r/g, '').split(/(?=^Soru numarası:)/m).filter(b => b.startsWith('Soru numarası:'));
  if (blocks.length !== topics.length * 30) throw new Error('Expected ' + topics.length * 30 + ' questions');
  const tests = topics.map(topic => ({exam:'LGS',lesson:'Matematik',topic,questions:[]}));
  blocks.forEach((raw, i) => {
    const block = raw.split(/\n(?:KAREKÖKLÜ İFADELER|VERİ ANALİZİ|CEBİRSEL İFADELER VE ÖZDEŞLİKLER|DOĞRUSAL DENKLEMLER|EŞİTSİZLİKLER|ÜÇGENLER|Cevap anahtarları|Kontrol edilmiş cevap anahtarları)\s*\n/)[0].trim();
    const m = block.match(/^Soru numarası:\s*(\d+)\nSınav:\s*LGS\nDers:\s*Matematik\nKonu:\s*([^\n]+)\nZorluk:\s*(Orta|Zor)\s*\n+Soru metni:\s*([\s\S]+?)\nA\)\s*([^\n]+)\nB\)\s*([^\n]+)\nC\)\s*([^\n]+)\nD\)\s*([^\n]+)\s*\n+Doğru cevap:\s*([ABCD])\s*\n+Adım adım çözüm:\s*\n([\s\S]+)$/);
    const group = Math.floor(i / 30);
    if (!m || +m[1] !== i + start || m[2] !== topics[group]) throw new Error('Invalid question ' + (i + start));
    const q = {id:'lgs-matematik-' + slugs[group] + '-user-v1-' + m[1], question:plainMath(m[4]), options:m.slice(5,9).map(plainMath), correctIndex:'ABCD'.indexOf(m[9]), explanation:plainMath(m[10]), difficulty:m[3] === 'Orta' ? 'orta' : 'zor', reviewedBy:'Codex: hesap ve seçenek kontrolü; öğretmen incelemesi değildir', source:{origin:'user-ai',title:'ChatGPT ile hazırlanmış, kullanıcı tarafından sağlanmış soru',document:'lgs-matematik-31-120-2026-09-06',permissionReference:'Kullanıcının 6 Eylül 2026 tarihli ekleme talebi',questionNumber:+m[1]}};
    if (+m[1] === 119) { q.options[2] = '(2)/(3)'; q.source.editNote = 'C şıkkındaki gereksiz karşılaştırma kaldırıldı; çeldirici 2/3 ve doğru cevap D korundu.'; }
    if (start === 121) { q.source.document = 'lgs-matematik-121-270-2026-09-07'; q.source.permissionReference = 'Kullanıcının 7 Eylül 2026 tarihli ekleme talebi'; }
    tests[group].questions.push(q);
  });
  return tests;
}
if (require.main === module) {
  const tests = parse(fs.readFileSync(process.argv[2], 'utf8'));
  const file = path.join(__dirname, '../data/question-bank.json');
  const bank = JSON.parse(fs.readFileSync(file, 'utf8'));
  bank.tests = bank.tests.filter(old => !tests.some(t => t.exam === old.exam && t.lesson === old.lesson && t.topic === old.topic)).concat(tests);
  validateBank(bank);
  fs.writeFileSync(file, JSON.stringify(bank, null, 2) + '\n');
  console.log('Imported ' + tests.length * 30 + ' questions in ' + tests.length + ' topics.');
}
module.exports = { parse, plainMath };
