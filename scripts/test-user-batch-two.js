const assert = require('node:assert/strict');
const {loadBank} = require('../question-bank');
const gcd=(a,b)=>b?gcd(b,a%b):a;
const frac=(a,b)=>'('+a/gcd(a,b)+')/('+b/gcd(a,b)+')';
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
const sum=a=>a.reduce((s,n)=>s+n,0);
const expected=[
  frac(5,10),frac(2,6),frac(8,20),frac(6,8),frac(12,30),18-10,frac(8,10),frac(4,9),'7 gelmesi','Sayının pozitif olması',frac(8,25),frac(2,4),'L daha avantajlıdır; kırmızıların toplam içindeki payı daha büyüktür.',frac(4,6),frac(7,30),'0,75',frac(5,10),frac(5,8),frac(range(1,40).filter(n=>n%3===0||n%5===0).length,40),18-10,2*4,frac(4,50),frac(3,10),frac(1,6),frac(6,14),frac(range(1,60).filter(n=>n%6===0&&n%9!==0).length,60),'A',frac(6,18),frac(4,8),2,
  '5x-3','x²+8x+16','(x-7)(x+7)','x²+3x-10','6a+2b','4x²-12x+9',99**2,'3x(2x+3)','12x+4','x²','2ab','3x-16',12**2-7**2,'4x+4','Terimler benzer değildir; çıkarılarak tek terime indirgenemez.','x²+8x+15','(2x-5)(2x+5)','x+5','x²+8x+4',9**2-2*14,5**2+2*6,'20x+40','2x','3(2x-3)(2x+3)','x²+8x',(81-25)/4,'10.000',(41-1)/2,7**2-1,5-8,
  3*4+5,(19-7)/2,'y=2x+5',25+12*5,'II. bölge',(10-2)/4,12/3,'(0,6)',(135-60)/15,0,18/2,'y=60x','y=x-5','y=100-8x',1.5*6,8+5,-6/2,30/2-9,(40-10)/(11-8),(120-30)/(6+3),'-(1)/(2)','2,5',(260-60)/5+20,52+4*4,7,'%75',(48-6)/6,40/5,54/1.8,120/(14-8),
  'x<5','x≤-4',4,Math.floor((350-110)/30),4-(-2),4,Math.floor(80/12),5,'x>3',Math.floor(Math.sqrt(30)),'x>5','x≤3',Math.ceil((250-178)/24),'-1≤ x<3',6,'x<20',240-150,Math.floor(17/2.5),Math.floor(300/22),'0<x<10',4,-1+10,8,Math.ceil(139/46),sum(range(5,11)),range(1,20).filter(n=>40+15*n>=160&&40+15*n<200).length,15+165/3,Math.floor(81/7),Math.ceil(105/7),31,
  11,180-50-60,Math.hypot(6,8),Math.sqrt(100-36),'7 cm’lik kenarın','AB','3 cm, 4 cm, 8 cm',12*7/2,Math.hypot(5,12),14/2,80/2,Math.sqrt(289-64),130-50,6+8+10,4,'BC doğrusuna dik olması',90-35,Math.sqrt(36),range(1,25).filter(x=>x+2+2*x-1>10&&x+12>2*x-1&&2*x+9>x+2).length,180/36,'2√(22)',10*12/2,'7,5',range(1,20).filter(x=>x%2===0&&x>5&&x<19).length,180*4/9,'AB','2√(13)',35-Math.hypot(15,20),'9,6',25+17+12
];
const bank=loadBank();const qs=bank.tests.flatMap(t=>t.questions).filter(q=>q.source.questionNumber>=121);
assert.equal(qs.length,150);assert.equal(expected.length,150);
qs.forEach((q,i)=>{
  assert.equal(q.source.questionNumber,i+121);
  assert.equal(q.options[q.correctIndex].replace(/−/g,'-'),String(expected[i]),'Q'+(i+121));
  assert.doesNotMatch(q.question+q.explanation+q.options.join(''),/\\|\$\$|[{}]/);
  assert.equal(q.source.origin,'user-ai');assert.equal(q.source.url,undefined);
});
assert.equal(bank.tests.length,9);
assert.equal(new Set(bank.tests.flatMap(t=>t.questions.map(q=>q.id))).size,270);
for(const t of bank.tests){assert.equal(t.questions.length,30);assert.equal(t.questions.filter(q=>q.difficulty==='orta').length,18);}
console.log('PASS: new 150 answers checked, 270 unique questions, 9 topics and 27 ten-question tests.');
