const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const output = path.join(root, 'data/topic-videos.json');
const catalog = JSON.parse(fs.readFileSync(output, 'utf8'));
const banks = vm.runInNewContext('(' + fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/const topicBanks = (\{[\s\S]*?\n    \});/)[1] + ')');
const wrongLevel = (title, exam) => /KPSS|AGS|DGS|ALES|YDS|YDT/i.test(title) && !new RegExp(exam + '|YKS', 'i').test(title);
function walk(value, results) {
  if (!value || typeof value !== 'object') return;
  if (value.videoRenderer) results.push(value.videoRenderer);
  for (const child of Object.values(value)) if (typeof child === 'object') walk(child, results);
}
async function replacement(entry, used) {
  const query = `${entry.exam} ${entry.lesson} ${entry.topic} konu anlatımı -KPSS -AGS`;
  const response = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {signal:AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error('Search HTTP ' + response.status);
  const match = (await response.text()).match(/(?:var )?ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
  if (!match) throw new Error('Search data missing');
  const results = []; walk(JSON.parse(match[1]), results);
  return results.map(v => ({id:v.videoId,title:v.title?.runs?.map(r=>r.text).join('')||'',channel:v.ownerText?.runs?.map(r=>r.text).join('')||'',duration:v.lengthText?.simpleText||'',url:'https://www.youtube.com/watch?v='+v.videoId}))
    .filter(v=>/^[\w-]{11}$/.test(v.id)&&v.duration&&!used.has(v.id)&&!wrongLevel(v.title,entry.exam)&&new RegExp(entry.exam+'|YKS','i').test(v.title));
}
async function main() {
  const changes = [], failures = [], checked = new Map();
  for (const [key, entry] of Object.entries(catalog)) {
    if (!entry.videos.some(v=>wrongLevel(v.title,entry.exam))) continue;
    const keep = entry.videos.filter(v=>!wrongLevel(v.title,entry.exam));
    try {
      const candidates = await replacement(entry,new Set(keep.map(v=>v.id)));
      for (const video of candidates) {if(keep.length===3)break;if(!keep.some(v=>v.id===video.id))keep.push(video);}
      if(keep.length!==3)throw new Error('Not enough matching videos');
      changes.push({key,before:entry.videos.map(v=>v.title),after:keep.map(v=>v.title)});
      entry.videos=keep;
    } catch(error) {failures.push({key,error:error.message});}
  }
  const videos = [...new Map(Object.values(catalog).flatMap(t=>t.videos).map(v=>[v.id,v])).values()];
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<videos.length){
      const video=videos[next++];
      try {
        const response=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(video.url),{signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('oEmbed HTTP '+response.status);
        const meta=await response.json();
        checked.set(video.id,{title:meta.title,channel:meta.author_name,metadataCheckedAt:new Date().toISOString()});
      }catch(error){failures.push({id:video.id,error:error.message});}
      if(checked.size%50===0)console.log('Metadata checked: '+checked.size+'/'+videos.length);
    }
  }));
  for(const entry of Object.values(catalog))for(const video of entry.videos)Object.assign(video,checked.get(video.id)||{});
  const missing=[];
  for(const [exam,lessons] of Object.entries(banks))for(const [lesson,topics]of Object.entries(lessons))for(const [topic]of topics){const key=[exam,lesson,topic].join('|');if(catalog[key]?.videos?.length!==3)missing.push(key);}
  fs.writeFileSync(output,JSON.stringify(catalog,null,2)+'\n');
  const report={at:new Date().toISOString(),topics:Object.keys(catalog).length,links:Object.values(catalog).reduce((n,t)=>n+t.videos.length,0),uniqueVideos:videos.length,metadataVerified:checked.size,missing,changes,failures,note:'Metadata availability checked; full video playback and teaching quality are not automatically verified.'};
  fs.writeFileSync(path.join(root,'scripts/video-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(missing.length||failures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
