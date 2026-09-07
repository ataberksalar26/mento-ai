const fs=require('node:fs');
const path=require('node:path');
const {plainMath}=require('./import-user-batch');
const {validateBank}=require('../question-bank');
function parse(text){
  const sections=text.replace(/\r/g,'').split(/(?=^TEST \d+ —)/m).filter(s=>s.startsWith('TEST '));
  if(sections.length!==5)throw Error('Expected five topics');
  return sections.map((section,index)=>{
    const meta=section.match(/Sınav: LGS · Ders: (.+) · Konu: (.+)/);
    const blocks=section.split(/(?=^\d{3}\. )/m).slice(1);
    if(!meta||blocks.length!==30)throw Error('Invalid topic');
    const questions=blocks.map((raw,i)=>{
      const m=raw.split('\nCevap anahtarı')[0].trim().match(/^(\d+)\. ([\s\S]+?)\s+A\) ([\s\S]+?)\s+B\) ([\s\S]+?)\s+C\) ([\s\S]+?)\s+D\) ([\s\S]+?)\s+Doğru cevap: ([ABCD])\. Çözüm: ([\s\S]+)$/);
      if(!m||+m[1]!==271+index*30+i)throw Error('Invalid question '+(271+index*30+i));
      const q={id:'lgs-user-v1-'+m[1],question:plainMath(m[2]),options:m.slice(3,7).map(plainMath),correctIndex:'ABCD'.indexOf(m[7]),explanation:plainMath(m[8]),difficulty:i<18?'orta':'zor',reviewedBy:'Codex: içerik ve seçenek kontrolü; öğretmen incelemesi değildir',source:{origin:'user-ai',title:'ChatGPT ile hazırlanmış, kullanıcı tarafından sağlanmış soru',document:'lgs-271-420-2026-09-07',permissionReference:'Kullanıcının 7 Eylül 2026 tarihli ekleme talebi',questionNumber:+m[1]}};
      if(index===2)q.question+='\n\nGerektiğinde π = 3 alınız.';
      const target={361:'“Keskin” sözcüğünün',384:'“Yerleşik kanılar” sözünün',386:'“Köprü kurmak” sözünün'}[m[1]];
      if(target){q.question=q.question.replace(/Altı çizili (?:sözcüğün|söz)/,target);q.source.editNote='Altı çizili ifadesi yerine hedef sözcük açıkça belirtildi.';}
      return q;
    });
    return {exam:'LGS',lesson:meta[1],topic:meta[2],questions};
  });
}
if(require.main===module){
  const file=path.join(__dirname,'../data/question-bank.json');
  const bank=JSON.parse(fs.readFileSync(file,'utf8'));const tests=parse(fs.readFileSync(process.argv[2],'utf8'));
  bank.tests=bank.tests.filter(t=>!tests.some(n=>n.exam===t.exam&&n.lesson===t.lesson&&n.topic===t.topic)).concat(tests);
  validateBank(bank);fs.writeFileSync(file,JSON.stringify(bank,null,2)+'\n');console.log('Imported 150 questions / 5 topics.');
}
module.exports={parse};
