const assert = require('node:assert/strict');
const { loadBank } = require('../question-bank');
const { plainMath } = require('./import-user-batch');
const range = (a,b) => Array.from({length:b-a+1},(_,i)=>a+i);
const dec = n => String(n).replace('.', ',');
const pow = n => '2' + [...String(n)].map(c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
const radical = (a,b) => a+'√('+b+')';
const expected = [
  String(-(2**4)+(-2)**3+1),pow(8+2*3-3*2),'7,2×10⁻⁵',String(9*2**6),dec(128*.08),'K<L<M',pow(15-7),dec(400+.7+.003),
  'Üsler çarpılmalı ve sonuç 3⁸ olmalıydı.',pow(2+5),'4,4×10⁶',String(2.5e-6*4e5),pow(2+4),String(3**5),'M',String(5**3*2**3/100),String(Math.log10(48/.0048)),String(256/2**4),
  String(8*9*16*.75),String(32*8/16*.75*.5),pow(20-(12-2)),'4.000',String(1-1+1),String((8.4e7-6e6)/3e5),String(Math.log2(224/7)),String((256-32)/16),String(Math.sqrt(4**6*2**-4)), '(-2)⁻²',String(2**12/4**3),String(3*2**20/2**12+120),
  '6√(5) cm, kök içinde tam kare çarpan kalmamıştır.','8 ile 9',radical(6-3+5,2),String(Math.sqrt(12*27)),String(Math.sqrt(288/8)),radical(4*7,2),'√(45)',dec(Math.sqrt(.0081)),String(range(1,10).find(n=>Number.isInteger(Math.sqrt(72*n)))),String(Math.round(Math.sqrt(200))),radical(72/6,2),radical(4+5,3),
  'Çözüm yanlıştır; önce kök içi toplanmalı, sonuç 13 bulunmalıdır.','L',String(range(0,30).filter(n=>n>16&&n<25).length),radical(2*(2+3),3),String(Math.sqrt(108/12)),dec(.7+.4),String(15-4),String(Math.floor((14+1)/4)),String(5*(18/3)**2),String(range(1,30).filter(n=>n+5>9&&n+5<25).length),String(100*3-192),String(range(0,30).filter(n=>n>Math.sqrt(200)&&n<Math.sqrt(500)).length),String((3+5)*2*2),radical(5+3,2),String(range(37,48).filter(n=>n%3===0).length),String(128-8*2),String((2-1)+(3-1)+(4-1)),String((10-6)**2*2),
  'Perşembe',String(36*120/360),String((60+70+80+90)/4),'%'+(150-120)/120*100,String(360*30/60),'Yalnız M','11.00–12.00','Öğrenci yanlıştır; gerçek satış oranı 60/40=1,5’tir.',String(72*150/360),String(4*25-20-24-28),'Çizgi grafiği','K ürününün satış sayısı değişmemiş, toplam içindeki payı azalmıştır.','8-C',String(6+2*8+3*2),String((120+90+150)*2),String(200*.35),String((21-9)/4),String(360*14/35),String((20*70+30*80)/50),'%'+((300*144/360)/(240*120/360)-1)*100,String([200,300,250,450,150].filter(n=>n>270).length),String((18-10)/2-(24-18)/3),dec(360*90/160),String(90+30),String(5*72-4*68),'%'+(180/400*100),String(360*192/432),String((18-8)/8*100-(18-10)/10*100),'(4)/(7)',String(12*360/60*90/360)
];
// Percentage concatenation must happen after the arithmetic.
expected[63] = '%' + ((150-120)/120*100);
expected[79] = '%' + (((300*144/360)/(240*120/360)-1)*100);
const tests = loadBank().tests;
assert.ok(tests.length>=4);
const questions = tests.flatMap(t=>t.questions).filter(q=>q.source.questionNumber>=31&&q.source.questionNumber<=120);
assert.equal(questions.length,90);assert.equal(expected.length,90);
questions.forEach((q,i)=>{
  const selected=q.options[q.correctIndex].replace(/−/g,'-');
  assert.equal(selected,expected[i], 'Q'+(i+31));
  assert.doesNotMatch(q.question+q.explanation+q.options.join(''), /\\|\$\$|[{}]/);
  assert.equal(q.source.questionNumber,i+31);assert.equal(q.source.origin,'user-ai');assert.equal(q.source.url,undefined);
});
assert.equal(plainMath('\\sqrt{\\frac{49}{100}}'), '√((49)/(100))');
assert.equal(plainMath('2^{12} + 10^{-5}'), '2¹² + 10⁻⁵');
assert.throws(()=>plainMath('\\unknown{x}'));
assert.equal(new Set(tests.flatMap(t=>t.questions.map(q=>q.id))).size,tests.length*30);
console.log('PASS: 90 answer checks, nested math, 120 unique questions, 4 topics / 12 ten-question sets.');
