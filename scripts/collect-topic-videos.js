const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bankText = html.match(/const topicBanks = (\{[\s\S]*?\n    \});/)[1];
const banks = vm.runInNewContext('(' + bankText + ')');
const output = path.join(root, 'data', 'topic-videos.json');
const catalog = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : {};
const jobs = Object.entries(banks).flatMap(([exam, lessons]) => Object.entries(lessons).flatMap(([lesson, topics]) => topics.map(([topic]) => ({exam, lesson, topic}))));
function walk(value, found) {
  if (!value || typeof value !== 'object') return;
  if (value.videoRenderer) found.push(value.videoRenderer);
  for (const child of Object.values(value)) if (typeof child === 'object') walk(child, found);
}
async function collect(job) {
  const key = [job.exam, job.lesson, job.topic].join('|');
  if (catalog[key]?.videos?.length === 3) return;
  const query = `${job.exam} ${job.lesson} ${job.topic} konu anlatımı`;
  const response = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), {headers:{Connection:'close'},signal: AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error('YouTube HTTP ' + response.status);
  const body = await response.text();
  const match = body.match(/(?:var )?ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
  if (!match) throw new Error('YouTube search data missing');
  const results = [];
  walk(JSON.parse(match[1]), results);
  const seen = new Set();
  const videos = results.filter(v => v.lengthText && /^[\w-]{11}$/.test(v.videoId) && !seen.has(v.videoId) && seen.add(v.videoId)).slice(0,3).map(v => ({id:v.videoId,title:(v.title.runs || []).map(r=>r.text).join(''),channel:(v.ownerText?.runs || []).map(r=>r.text).join(''),duration:v.lengthText.simpleText,url:'https://www.youtube.com/watch?v='+v.videoId}));
  if (videos.length !== 3) throw new Error('Three videos not found: ' + key);
  catalog[key] = {...job, query, checkedAt:new Date().toISOString(), videos};
}
async function main() {
  let next = 0, done = 0;
  const errors = [];
  await Promise.all(Array.from({length:3}, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try { await collect(job); } catch(e) { errors.push({...job,error:e.message}); console.log(job.topic + ': ' + e.message + ' ' + (e.cause?.message || '')); }
      done++;
      if (done % 20 === 0) console.log(`${done}/${jobs.length}, errors ${errors.length}`);
      fs.writeFileSync(output, JSON.stringify(catalog,null,2)+'\n');
    }
  }));
  console.log(JSON.stringify({topics:jobs.length,complete:Object.keys(catalog).length,errors}));
  if(errors.length) process.exitCode=1;
}
main();
