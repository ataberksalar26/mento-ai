const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../data/topic-videos.json');
const catalog=JSON.parse(fs.readFileSync(file,'utf8'));
const fixes=[
  {key:'AYT|Coğrafya|Türkiye’nin Yer Şekilleri',query:"Türkiye'nin yer şekilleri TYT AYT konu anlatımı",accept:/yer\s*şekil/i,reject:/KPSS|AGS/i,replace:/İklimi/},
  {key:'TYT|Tarih|İnkılap Tarihi',query:'TYT Atatürkçülük Türk İnkılabı konu anlatımı',accept:/Atatürk|İnkılap/i,reject:/Soru Çözümü|KPSS|AGS/i,replace:/Soru Çözümü/}
];
function walk(v,a){if(!v||typeof v!=='object')return;if(v.videoRenderer)a.push(v.videoRenderer);Object.values(v).forEach(c=>{if(typeof c==='object')walk(c,a);});}
(async()=>{
  for(const fix of fixes){
    const response=await fetch('https://www.youtube.com/results?search_query='+encodeURIComponent(fix.query),{signal:AbortSignal.timeout(25000)});
    const match=(await response.text()).match(/(?:var )?ytInitialData\s*=\s*(\{.+?\});<\/script>/s);if(!match)throw Error('Search unavailable');
    const a=[];walk(JSON.parse(match[1]),a);
    const candidates=a.map(v=>({id:v.videoId,title:v.title?.runs?.map(r=>r.text).join('')||'',channel:v.ownerText?.runs?.map(r=>r.text).join('')||'',duration:v.lengthText?.simpleText||'',url:'https://www.youtube.com/watch?v='+v.videoId})).filter(v=>v.duration&&fix.accept.test(v.title)&&!fix.reject.test(v.title)&&!catalog[fix.key].videos.some(old=>old.id===v.id));
    if(!candidates.length)throw Error('No suitable candidate '+fix.key);
    console.log(JSON.stringify({key:fix.key,candidates:candidates.slice(0,4)}));
    const replacement=candidates[0];
    const meta=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(replacement.url),{signal:AbortSignal.timeout(15000)});
    if(meta.ok){const data=await meta.json();replacement.title=data.title;replacement.channel=data.author_name;replacement.metadataCheckedAt=new Date().toISOString();}
    catalog[fix.key].videos=catalog[fix.key].videos.map(v=>fix.replace.test(v.title)?replacement:v);
  }
  fs.writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
