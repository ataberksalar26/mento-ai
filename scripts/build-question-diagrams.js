const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/atabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=(x,y,s)=>`<text x="${x}" y="${y}" text-anchor="middle">${esc(s)}</text>`;
const line=(x,y,a,b,dash=false)=>`<path d="M${x} ${y}L${a} ${b}" fill="none" stroke="${dash?'#b66a12':'#176b91'}" stroke-width="3" ${dash?'stroke-dasharray="8 6"':''}/>`;
const poly=pts=>`<polygon points="${pts}" fill="#d9eef6" stroke="#176b91" stroke-width="3"/>`;
const rect=(x,y,w,h)=>poly(`${x},${y} ${x+w},${y} ${x+w},${y+h} ${x},${y+h}`);
const diagrams=new Map();
function add(n,body,alt){diagrams.set(n,{body,alt});}
function pair(n,a,b,kind='triangle'){
  const shape=kind==='rectangle'?rect(85,110,145,140)+rect(370,90,180,170):poly('90,265 165,110 240,265')+poly('360,265 455,75 550,265');
  add(n,shape+label(165,320,a)+label(455,320,b)+label(165,55,'I')+label(455,55,'II'),a+'; '+b+'. İki '+(kind==='rectangle'?'dikdörtgen':'üçgen')+' şeması.');
}
pair(271,'4, 6, 8 cm','6, 9, x cm');pair(272,'ABC · B = 58°','KLM · L = ?');
pair(276,'6 × 10 cm','9 × x cm','rectangle');pair(278,'Alan = 49 cm²','Eş kare · Çevre = ?','rectangle');
add(279,poly('180,280 180,80 440,280')+label(140,180,'3 cm')+label(310,320,'4 cm')+label(355,160,'5 cm'),'Kenarları 3, 4 ve 5 cm olan dik üçgen.');
pair(281,'Kenar = 4 cm','Kenar = 7 cm');pair(283,'A ↔ K','B ↔ L, C ↔ M');
pair(286,'8 × 12 cm','20 × x cm','rectangle');pair(287,'A:50° B:60° C:70°','X:60° Y:70° Z:50°');
pair(292,'Fotoğraf: 8 × 12','Kâğıt: 18 × 24','rectangle');pair(295,'6, 8, 10 cm','Çevre = 72 cm');pair(296,'AB = 2x + 1','KL = 13; BC = x + 5');
for(const [n,left,right,base] of [[289,'AD=8; AB=12','','BC = 15'],[290,'AD=6; DB=3','AE=8; EC=?',''],[298,'Büyük kenar: 18','Küçük çevre: 36',''],[299,'Yükseklikler: 4 ve 6','','DE=6; BC=?']]){
  add(n,poly('160,290 320,70 480,290')+line(224,202,416,202)+label(320,48,'A')+label(138,310,'B')+label(502,310,'C')+label(210,198,'D')+label(432,198,'E')+label(320,342,base||'DE ∥ BC')+label(180,375,left)+label(465,375,right),`ABC üçgeninde DE, BC'ye paralel. ${left} ${right} ${base}`);
}
add(277,line(70,290,560,290)+line(105,290,105,215)+line(285,290,285,95)+line(105,215,200,290,true)+line(285,95,540,290,true)+label(110,195,'1,5 m')+label(160,325,'2 m')+label(300,70,'h = ?')+label(420,325,'8 m'),'Dik çubuk ve ağaç; gölgeler 2 m ve 8 m, çubuk yüksekliği 1,5 m.');
add(297,poly('210,95 390,95 530,285 90,285')+line(210,95,530,285)+line(390,95,90,285)+label(195,75,'A')+label(405,75,'B')+label(552,310,'C')+label(70,310,'D')+label(300,75,'6 cm')+label(310,320,'14 cm')+label(312,178,'O')+label(320,365,'BD = 20 cm; BO = ?'),'AB ve CD paralel, uzunlukları 6 ve 14 cm. Köşegenler O noktasında kesişiyor.');
add(300,poly('320,275 145,275 320,75')+poly('320,275 495,275 320,75')+line(320,55,320,320,true)+label(335,300,'A')+label(125,300,'B')+label(515,300,'B′')+label(335,60,'C')+label(220,315,'6 cm')+label(365,180,'8 cm'),'A dik açı; AB 6 cm, AC 8 cm. B noktası AC doğrusu boyunca yansıtılır.');
function grid(n,points,caption,mirror){
  const X=x=>320+x*22,Y=y=>200-y*19;let body='';
  for(let i=-8;i<=8;i++){body+=line(X(i),48,X(i),352,true).replace('#b66a12','#dde4e8').replace('stroke-width="3"','stroke-width="1"');body+=line(144,Y(i),496,Y(i),true).replace('#b66a12','#dde4e8').replace('stroke-width="3"','stroke-width="1"');}
  body+=line(130,Y(0),510,Y(0))+line(X(0),35,X(0),365)+label(530,207,'x')+label(320,25,'y');
  for(let i=-8;i<=8;i+=2)if(i)body+=label(X(i),222,i)+label(298,Y(i)+6,i);
  if(mirror)body+=mirror[0]==='x'?line(X(mirror[1]),40,X(mirror[1]),352,true):line(140,Y(mirror[1]),500,Y(mirror[1]),true);
  if(points.length===3)body+=poly(points.map(p=>X(p[1])+','+Y(p[2])).join(' '));
  for(const [name,x,y] of points)body+=`<circle cx="${X(x)}" cy="${Y(y)}" r="5" fill="#bb4e25"/>`+label(X(x)+24,Y(y)-12,name);
  body+=label(320,393,caption);add(n,body,points.map(p=>p[0]+'('+p[1]+','+p[2]+')').join('; ')+'. '+caption);
}
grid(301,[['A',-3,4]],'A(−3,4) · 5 sağa, 2 aşağı');grid(302,[['P',4,-7]],'P(4,−7) · x ekseninde yansıma',['y',0]);
grid(303,[['K',-5,2]],'K(−5,2) · y ekseninde yansıma',['x',0]);grid(304,[['A',-2,5],['A′',3,1]],'A(−2,5) → A′(3,1)');
grid(306,[['A',1,1],['B',5,1],['C',1,4]],'2 sola, 3 yukarı');grid(307,[['P',5,-1]],'P(5,−1) · Ayna: x = 2',['x',2]);
grid(308,[['A',3,4]],'A(3,4) · Ayna: y = −1',['y',-1]);grid(310,[['P',2,3]],'x ekseninde yansıma, sonra 4 sağa',['y',0]);
grid(312,[['A',1,2],['B',5,2],['C',3,6]],'y ekseninde yansıma',['x',0]);grid(313,[['P',4,-2],['P′',-4,-2]],'P(4,−2), P′(−4,−2)');
grid(318,[['P',3,-5]],'Önce x, sonra y ekseninde yansıma');grid(321,[['A',-2,5]],'A(−2,5) · Önce x=1, sonra x=4',['x',1]);
grid(322,[['P',3,6]],'P(3,6) · Önce y=2, sonra y=−1',['y',2]);grid(323,[['A',1,1],['B',5,1],['C',1,4]],'x ekseninde yansıma, 2 yukarı');
grid(326,[['A',0,0],['B',0,6],['C',4,0]],'y ekseninde yansıma',['x',0]);grid(327,[['P',-3,4]],'y ekseninde yansıma, 4 aşağı');grid(328,[['P',-2,3],['P′',8,3]],'Dikey yansıma doğrusu = ?');
function box(n,a,b,h,caption=''){
  const body=poly('200,145 390,145 470,90 280,90')+poly('390,145 470,90 470,255 390,310')+rect(200,145,190,165)+line(200,310,280,255,true)+line(280,255,470,255,true)+line(280,255,280,90,true)+label(295,345,a)+label(464,305,b)+label(145,235,h)+label(320,385,caption);
  add(n,body,`Dik prizma şeması: ${a}, ${b}, ${h}. ${caption}`);
}
for(const [n,a,b,h,c] of [[331,'4 cm','5 cm','6 cm',''],[332,'3 cm','3 cm','3 cm','Bütün yüzler boyanıyor'],[335,'2 cm','3 cm','4 cm',''],[336,'','','','Bütün ayrıtlar'],[338,'20 cm','30 cm','10 cm','Su yüksekliği 10 cm'],[345,'6 cm','8 cm','h = ?','Hacim = 240 cm³'],[348,'3 cm','4 cm','8 cm',''],[350,'6 cm','6 cm','6 cm','Küçük küp ayrıtı: 2 cm'],[356,'24 cm','18 cm','12 cm','Yerleştirilen küp ayrıtı: 6 cm'],[357,'12 cm','12 cm','12 cm','Boyanıp 4 cm ayrıtlı küplere ayrılıyor'],[359,'a','a','10 cm','Hacim = 490 cm³']])box(n,a,b,h,c);
function cylinder(n,r,h,caption=''){
  add(n,`<path d="M205 120V285C205 330 435 330 435 285V120" fill="#d9eef6" stroke="#176b91" stroke-width="3"/><ellipse cx="320" cy="120" rx="115" ry="35" fill="#edf7fa" stroke="#176b91" stroke-width="3"/>`+line(320,120,435,120)+label(367,108,r)+line(475,120,475,285,true)+label(526,210,h)+label(320,365,caption),`Dik silindir: ${r}, ${h}. ${caption}`);
}
for(const [n,r,h,c] of [[333,'r = 3','h = 5','cm · π = 3'],[334,'d = 8','h = 10','Yalnız yan yüz · cm · π = 3'],[340,'r = 2','h = 5','Kapalı silindir · cm · π = 3'],[347,'r = 2','h = 10','Yan yüz açınımı · cm · π = 3'],[353,'r = 3','h = 8','Kapasitenin 3/4’ü dolu · cm · π = 3'],[358,'r = 5','h = 12','Alt taban hariç boyalı · cm · π = 3']]){
  cylinder(n,r,h,c);
  if(n===334)diagrams.get(n).body=diagrams.get(n).body.replace(line(320,120,435,120),line(205,120,435,120));
}
async function main(){
  const bankFile=path.join(root,'data/question-bank.json'),bank=JSON.parse(fs.readFileSync(bankFile,'utf8'));
  const out=path.join(root,'assets/questions');fs.mkdirSync(out,{recursive:true});
  const native=path.resolve(root,'../mento-expo-ios/assets/questions');fs.mkdirSync(native,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:640,height:440},deviceScaleFactor:1.5});
    for(const [n,d] of diagrams){
      const q=bank.tests.flatMap(t=>t.questions).find(q=>q.source.questionNumber===n);if(!q)throw Error('Missing '+n);
      await page.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="640" height="440" viewBox="0 0 640 440"><rect width="640" height="440" fill="#fff"/><g font-family="Arial,sans-serif" font-size="21" fill="#20323d">${d.body}<text x="320" y="430" text-anchor="middle" font-size="15" fill="#596770">Şematik gösterim · Ölçekli değildir</text></g></svg></body></html>`);
      const name='q-'+n+'.png';await page.screenshot({path:path.join(out,name)});fs.copyFileSync(path.join(out,name),path.join(native,name));
      q.image='/assets/questions/'+name;q.imageAlt=d.alt;
    }
  }finally{await browser.close();}
  fs.writeFileSync(bankFile,JSON.stringify(bank,null,2)+'\n');
  fs.copyFileSync(bankFile,path.resolve(root,'../mento-expo-ios/data/question-bank.json'));
  fs.writeFileSync(path.resolve(native,'../../question-images.js'),'export default {\n'+[...diagrams.keys()].map(n=>`  '/assets/questions/q-${n}.png': require('./assets/questions/q-${n}.png'),`).join('\n')+'\n};\n');
  console.log('Generated '+diagrams.size+' diagrams for web and bundled mobile use.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
