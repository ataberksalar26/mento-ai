const assert = require('node:assert/strict');
const { loadBank, validateBank, findTest } = require('../question-bank');
const gcd = (a,b) => b ? gcd(b,a%b) : a;
const lcm = (a,b) => a/gcd(a,b)*b;
const range = (a,b) => Array.from({length:b-a+1},(_,i)=>a+i);
const divisors = n => range(1,n).filter(x=>n%x===0);
const primes = n => divisors(n).filter(x=>x>1&&divisors(x).length===2);
const sum = a => a.reduce((n,x)=>n+x,0);
const test = findTest(loadBank(),'LGS','Matematik','Çarpanlar ve Katlar');
const expected = [
  divisors(gcd(36,48)).length, primes(360).length,
  range(0,9).filter(d=>(402+10*d)%6===0&&(402+10*d)%9===0)[0],
  gcd(72,120),lcm(12,18),primes(180).reduce((n,x)=>n*x,1),'16 ve 27',gcd(72,60),lcm(24,90),
  sum(divisors(30).filter(n=>n%3!==0)),Math.min(...divisors(48).filter(a=>a>1&&48/a>1).map(a=>2*(a+48/a))),60/5,
  (84+126)/gcd(84,126),'10.10',gcd(gcd(45,60),75),range(1,72).find(x=>Number.isInteger(Math.sqrt(72*x))),lcm(6,8),2*(30+42)/gcd(30,42),
  divisors(gcd(144,204)).filter(x=>x>=12)[0],range(0,360).filter(t=>t%18===0&&t%24===0).length,
  lcm(18,30)**2/(18*30),sum(range(101,149).filter(x=>x%12===5&&x%18===5)),
  Math.min(...range(1,180).flatMap(a=>range(a,180).filter(b=>gcd(a,b)===12&&lcm(a,b)===180).map(b=>a+b))),
  range(1,144).filter(t=>t%12===0&&t%18===0&&t%8!==0).length,
  range(1,1000).filter(n=>n%12===0&&n%18===0&&n/12-n/18===5).map(n=>n/12+n/18)[0],
  Math.max(...range(1,41).filter(a=>gcd(a,42-a)===6).map(a=>a*(42-a))),lcm(24,40)/24+lcm(24,40)/40,
  divisors(gcd(96,120)).filter(n=>n<20&&216/n<=20).map(n=>216/n)[0],
  range(0,240).filter(t=>t%15===0&&t>=5&&(t-5)%20===0).length,
  sum([84,132,180].map(n=>n/gcd(gcd(84,132),180)-1))*5
];
assert.equal(test.questions.length,30);
test.questions.forEach((q,i)=>{
  assert.equal(q.options[q.correctIndex],String(expected[i]),'Incorrect answer for Q'+(i+1));
  assert.equal(q.options.filter(o=>o===String(expected[i])).length,1);
  assert.equal(q.source.origin,'user-ai');assert.equal(q.source.url,undefined);
  assert.doesNotMatch(q.question+q.explanation,/\\(?:boxed|times|div|text|operatorname)|\$\$/);
});
assert.equal(test.questions.filter(q=>q.difficulty==='orta').length,18);
assert.equal(test.questions.filter(q=>q.difficulty==='zor').length,12);
const invalid=structuredClone({version:1,tests:[test]});invalid.tests[0].questions[0].source.origin='published';
assert.throws(()=>validateBank(invalid),/source/);
console.log('PASS: all 30 answers independently recalculated, unique correct options, 18 orta/12 zor labels, no raw TeX, honest AI provenance and no forged source URL.');
