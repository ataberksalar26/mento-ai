/* Topic workspace uses the existing curriculum and server learning APIs. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const questionMarkup = value => String(value).split(/\n\s*\n/).map(block => {
    const rows=block.split('\n');
    if(rows.length>1&&rows.every(row=>row.includes('\t'))){const cells=rows.map(row=>row.split('\t'));return '<div class="question-table-wrap"><table class="question-table"><thead><tr>'+cells[0].map(cell=>'<th scope="col">'+escape(cell)+'</th>').join('')+'</tr></thead><tbody>'+cells.slice(1).map(row=>'<tr>'+row.map(cell=>'<td>'+escape(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
    return '<p>'+escape(block)+'</p>';
  }).join('');
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  let preferences = read('mentoStudyPreferences', {exam:activeExamBank,theme:'dark',minutes:60});
  let catalogPromise;
  let requestController;
  let focusBefore;
  const progressKey='mentoTopicProgress:v1';
  const progress=()=>read(progressKey,{});
  const topicState=key=>progress()[key]||{note:'',watched:[],planned:false,done:false};
  const updateTopic=(key,patch)=>save(progressKey,{...progress(),[key]:{...topicState(key),...patch,updatedAt:Date.now()}});
  const dayKey=()=>new Date().toLocaleDateString('en-CA');
  function appearance(){
    studentApp.classList.toggle('light',preferences.theme==='light');
    document.documentElement.classList.toggle('mento-reduce-motion',!!preferences.reduceMotion);
    document.documentElement.classList.toggle('mento-large-text',!!preferences.largeText);
    dialog.classList.toggle('study-light',preferences.theme==='light');
  }
  window.refreshAiUsage = async () => {
    try {
      const response=await fetch('/api/ai-usage');
      if(!response.ok)return;
      const usage=await response.json();
      document.getElementById('aiUsage').textContent=`Günlük AI hakkı: ${usage.remaining}/${usage.dailyLimit}`;
    } catch {}
  };
  refreshAiUsage();
  const dialog = document.createElement('dialog');
  dialog.className = 'study-dialog';
  dialog.setAttribute('aria-labelledby','studyTitle');
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => { if(dialog.open)return;requestController?.abort(); focusBefore?.focus(); });
  function shell(title, subtitle) {
    requestController?.abort();
    requestController = new AbortController();
    dialog.classList.toggle('study-light', studentApp.classList.contains('light'));
    dialog.innerHTML = `<header><div><div class="study-meta">${escape(subtitle)}</div><h2 id="studyTitle">${escape(title)}</h2></div><button class="close-study" aria-label="Kapat">×</button></header><div class="study-body"></div>`;
    dialog.querySelector('.close-study').onclick = () => dialog.close();
    if (!dialog.open) { focusBefore=document.activeElement; dialog.showModal(); }
    return dialog.querySelector('.study-body');
  }
  async function api(url, body, signal) {
    const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    const data = await response.json();
    refreshAiUsage();
    if (!response.ok) { const error=new Error(data.error || 'İçerik yüklenemedi.');error.status=response.status;error.sources=data.sources;throw error; }
    return data;
  }
  function chooseExam(exam) {
    if (!topicBanks[exam]) return;
    activeExamBank = exam;
    selectedExam = exam;
    if (!topicBanks[exam][activeLesson]) activeLesson=Object.keys(topicBanks[exam])[0];
    document.getElementById('currentExamLabel').textContent=exam;
    document.querySelectorAll('[data-main-exam]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mainExam===exam)));
    profileMode.textContent=exam+' hedef modu';
    preferences.exam=exam;
    save('mentoStudyPreferences',preferences);
    renderLessonTabs();renderTopics();
    if(activeLearningMode==='Mini testler')addLearningCards('Mini testler');
  }
  const examDropdown=document.getElementById('examDropdown');
  examDropdown.querySelectorAll('[data-main-exam]').forEach(button=>button.onclick=()=>{chooseExam(button.dataset.mainExam);examDropdown.open=false;examDropdown.querySelector('summary').focus();});
  document.addEventListener('click',event=>{if(!examDropdown.contains(event.target))examDropdown.open=false;});
  examDropdown.addEventListener('keydown',event=>{if(event.key==='Escape'){examDropdown.open=false;examDropdown.querySelector('summary').focus();}});
  chooseExam(preferences.exam);
  appearance();
  for(const id of ['themeToggle','topThemeToggle']) document.getElementById(id).addEventListener('click',()=>{
    preferences.theme=studentApp.classList.contains('light')?'light':'dark';save('mentoStudyPreferences',preferences);
  });
  window.openStudySettings = () => {
    const body=shell('Ayarlar','Mento AI');
    body.innerHTML=`<form class="settings-form"><label>Görünüm<select name="theme"><option value="dark">Koyu</option><option value="light">Açık</option></select></label><label>Sınav<select name="exam"><option>LGS</option><option>TYT</option><option>AYT</option></select></label><label>Hedef tarihi<input name="targetDate" type="date"></label><label>Günlük çalışma hedefi (dakika)<input name="minutes" type="number" min="10" max="480" step="5" required></label><label class="setting-check"><input name="largeText" type="checkbox">Büyük metin</label><label class="setting-check"><input name="reduceMotion" type="checkbox">Hareketi azalt</label><button class="primary" type="submit">Kaydet</button><p role="status" id="settingsSaved"></p></form><section class="study-section"><h3>Çalışma verileri</h3><button id="exportStudy">Notları ve ilerlemeyi indir</button><p>Bu cihazdaki çalışma verilerin. Hesaplar arasında otomatik eşitlenmez.</p><a class="question-source" href="/gizlilik.html" target="_blank" rel="noopener">Gizlilik politikası</a></section>`;
    const form=body.querySelector('form');
    form.elements.theme.value=preferences.theme;
    form.elements.exam.value=activeExamBank;
    form.elements.minutes.value=preferences.minutes;
    form.elements.targetDate.value=preferences.targetDate||'';
    form.elements.largeText.checked=!!preferences.largeText;
    form.elements.reduceMotion.checked=!!preferences.reduceMotion;
    body.querySelector('#exportStudy').onclick=()=>{
      const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),preferences,topics:progress(),focus:read('mentoFocusLog:v1',[])},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mento-calisma-verileri.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    form.onsubmit=e=>{
      e.preventDefault();
      preferences={...preferences,exam:form.elements.exam.value,theme:form.elements.theme.value,minutes:Number(form.elements.minutes.value),targetDate:form.elements.targetDate.value,largeText:form.elements.largeText.checked,reduceMotion:form.elements.reduceMotion.checked};
      const saved=save('mentoStudyPreferences',preferences);chooseExam(preferences.exam);appearance();
      body.querySelector('#settingsSaved').textContent=saved?'Ayarlar kaydedildi.':'Depolama dolu veya kullanılamıyor. Ayarlar kalıcı kaydedilemedi.';
    };
  };
  window.openTopicLearning = async (exam, lesson, topic, startTest=false) => {
    const body=shell(topic,exam+' · '+lesson);
    const signal=requestController.signal;
    const key=[exam,lesson,topic].join('|');
    const info={exam,lesson,topic};
    body.innerHTML=`<div class="study-tabs" role="tablist" aria-label="Konu çalışması"><button role="tab" aria-controls="lecturePane" aria-selected="true" id="lectureTab">Konu anlatımı</button><button role="tab" aria-controls="testPane" aria-selected="false" id="testTab">Konu testi</button></div><section id="lecturePane" role="tabpanel" aria-labelledby="lectureTab"><div class="topic-actions"><label><input type="checkbox" id="topicPlanned">Çalışma planımda</label><label><input type="checkbox" id="topicDone">Konuyu tamamladım</label></div><h3>Video dersleri</h3><div id="topicVideos" class="study-status" aria-live="polite">Videolar yükleniyor…</div><section class="study-section"><label for="topicNote"><strong>Konu notlarım</strong></label><textarea id="topicNote" maxlength="12000" rows="5"></textarea><small id="noteStatus" role="status"></small></section><div id="topicLecture" class="study-section"><button class="primary" id="loadLecture">Ayrıntılı anlatımı aç</button></div></section><section id="testPane" role="tabpanel" aria-labelledby="testTab" hidden></section>`;
    const state=topicState(key);
    body.querySelector('#topicNote').value=state.note;
    body.querySelector('#topicNote').oninput=e=>{body.querySelector('#noteStatus').textContent=updateTopic(key,{note:e.target.value})?'Not kaydedildi.':'Not kaydedilemedi; cihaz depolamasını kontrol et.';};
    for(const [id,field]of [['topicPlanned','planned'],['topicDone','done']]){const input=body.querySelector('#'+id);input.checked=!!state[field];input.onchange=()=>updateTopic(key,{[field]:input.checked});}
    const lecturePane=body.querySelector('#lecturePane'),testPane=body.querySelector('#testPane');
    let testInitialized=false;
    function tab(test) {
      lecturePane.hidden=test;testPane.hidden=!test;
      body.querySelector('#lectureTab').setAttribute('aria-selected',String(!test));
      body.querySelector('#testTab').setAttribute('aria-selected',String(test));
      if(test&&!testInitialized){testInitialized=true;initQuiz(testPane,key,info,signal);}
    }
    body.querySelector('#lectureTab').onclick=()=>tab(false);
    body.querySelector('#testTab').onclick=()=>tab(true);
    body.querySelector('.study-tabs').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const test=e.key==='End'||(e.key!=='Home'&&document.activeElement.id==='lectureTab');tab(test);body.querySelector(test?'#testTab':'#lectureTab').focus();}};
    async function loadVideos() {
      const node=body.querySelector('#topicVideos');
      try {
        catalogPromise ||= fetch('/data/topic-videos.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).catch(e=>{catalogPromise=null;throw e;});
        const catalog=await catalogPromise;
        if(signal.aborted)return;
        const videos=catalog[key]?.videos;
        if(!videos||videos.length!==3)throw new Error();
        node.className='video-list';
        node.innerHTML=videos.map((v,i)=>`<article class="video-entry"><a class="video-item" href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener noreferrer"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="" loading="lazy"><span class="video-number">${i+1}. Video ↗</span><strong>${escape(v.title)}</strong><small>${escape(v.channel)} · ${escape(v.duration)}</small></a><label class="watched-label"><input type="checkbox" data-watched="${escape(v.id)}" ${topicState(key).watched.includes(v.id)?'checked':''}>İzledim</label></article>`).join('');
        node.querySelectorAll('[data-watched]').forEach(input=>input.onchange=()=>{const watched=new Set(topicState(key).watched);input.checked?watched.add(input.dataset.watched):watched.delete(input.dataset.watched);updateTopic(key,{watched:[...watched]});});
      }catch{if(!signal.aborted){node.innerHTML='Videolar yüklenemedi. <button type="button">Tekrar dene</button>';node.querySelector('button').onclick=loadVideos;}}
    }
    async function loadLecture() {
      const node=body.querySelector('#topicLecture');
      node.innerHTML='<p class="study-status" role="status">Konu anlatımı hazırlanıyor…</p>';
      try {
        let lecture=read('mentoLecture:'+key,null);
        if(!lecture){lecture=(await api('/api/topic-lecture',info,signal)).lecture;save('mentoLecture:'+key,lecture);}
        if(signal.aborted)return;
        node.innerHTML=`<p class="lecture-copy">${escape(lecture.summary)}</p>${lecture.sections.map(s=>`<section class="study-section"><h3>${escape(s.heading)}</h3><div class="lecture-copy">${escape(s.body)}</div></section>`).join('')}<section class="study-section"><h3>Çözümlü örnek</h3><p class="lecture-copy">${escape(lecture.example?.question)}</p><div class="lecture-copy">${escape(lecture.example?.solution)}</div></section><p class="lecture-copy">${escape(lecture.tip)}</p>`;
      }catch(error){if(!signal.aborted){node.innerHTML=`<p role="status">${escape(error.message)}</p><button>Tekrar dene</button>`;node.querySelector('button').onclick=loadLecture;}}
    }
    body.querySelector('#loadLecture').onclick=loadLecture;
    loadVideos();
    if(startTest)tab(true);
  };
  window.openStudyDashboard=()=>{
    const body=shell('Çalışma planım',activeExamBank);
    const signal=requestController.signal;
    const all=Object.entries(progress()).filter(([key])=>key.startsWith(activeExamBank+'|'));
    const planned=all.filter(([,s])=>s.planned),done=all.filter(([,s])=>s.done).length;
    const watched=all.reduce((n,[,s])=>n+s.watched.length,0);
    const focusLog=read('mentoFocusLog:v1',[]);
    const today=focusLog.filter(s=>s.day===dayKey()&&s.exam===activeExamBank).reduce((n,s)=>n+s.minutes,0);
    const remaining=preferences.targetDate?Math.max(0,Math.ceil((new Date(preferences.targetDate+'T00:00:00')-new Date())/86400000)):null;
    body.innerHTML=`<div class="study-metrics"><div><strong>${done}</strong><span>Tamamlanan konu</span></div><div><strong>${watched}</strong><span>İzlenen video</span></div><div><strong>${today}/${preferences.minutes}</strong><span>Bugün · dakika</span></div></div>${remaining!==null?`<p>Hedef tarihine ${remaining} gün kaldı.</p>`:''}<section class="study-section"><h3>Odak oturumu</h3><label>Süre (dakika) <input id="focusMinutes" type="number" min="5" max="120" value="25"></label><div class="focus-controls"><output id="focusClock" aria-label="Kalan süre"></output><button id="focusStart">Başlat</button><button id="focusPause">Duraklat</button><button id="focusCancel">İptal</button></div><p id="focusStatus" role="status"></p></section><section class="study-section"><h3>Planladığım konular</h3><div class="planned-topics">${planned.length?planned.map(([key,s])=>`<button data-open-topic="${escape(key)}"><span>${s.done?'✓ ':''}${escape(key.split('|')[2])}</span><small>${escape(key.split('|')[1])} · ${s.watched.length}/3 video</small></button>`).join(''):'<p>Henüz planlanan konu yok.</p>'}</div><button id="browseTopics">Konu seç</button></section><section class="study-section"><h3>Yanlış defterim</h3><div id="wrongNotebook"></div></section>`;
    body.querySelectorAll('[data-open-topic]').forEach(b=>b.onclick=()=>openTopicLearning(...b.dataset.openTopic.split('|')));
    body.querySelector('#browseTopics').onclick=()=>openStudyLibrary();
    const wrong=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key.startsWith('mentoReadyQuiz:v1:'+activeExamBank+'|'))continue;
      const quiz=read(key,null);if(!quiz?.finished||!Array.isArray(quiz.questions)||!Array.isArray(quiz.answers))continue;
      if(!key.includes('|test:')&&read(key+'|test:1',null))continue;
      quiz.questions.forEach((q,j)=>{if(quiz.answers[j]!==q.correctIndex)wrong.push({...q,topic:key.split('|')[2]});});
    }
    body.querySelector('#wrongNotebook').innerHTML=wrong.length?wrong.map(q=>`<details class="wrong-entry"><summary>${escape(q.topic)} · ${escape(q.question)}</summary><p>${escape(q.options[q.correctIndex])}</p><p class="lecture-copy">${escape(q.explanation)}</p></details>`).join(''):'<p>Tamamlanan testlerdeki yanlış ve boş sorular burada listelenir. Henüz kayıt yok.</p>';
    let session=read('mentoFocusSession:v1',null);
    const clock=body.querySelector('#focusClock'),status=body.querySelector('#focusStatus');
    function tick(){
      if(signal.aborted)return;
      const left=session?(session.endsAt?Math.max(0,Math.ceil((session.endsAt-Date.now())/1000)):session.remaining):Number(body.querySelector('#focusMinutes').value)*60;
      clock.textContent=`${Math.floor(left/60).toString().padStart(2,'0')}:${(left%60).toString().padStart(2,'0')}`;
      body.querySelector('#focusMinutes').disabled=!!session;
      body.querySelector('#focusStart').disabled=!!session?.endsAt;
      body.querySelector('#focusPause').disabled=!session?.endsAt;
      body.querySelector('#focusCancel').disabled=!session;
      if(session&&left<=0){const logs=read('mentoFocusLog:v1',[]);if(!logs.some(s=>s.id===session.id))save('mentoFocusLog:v1',[...logs,{id:session.id,exam:session.exam,minutes:session.minutes,day:dayKey()}].slice(-1000));save('mentoFocusSession:v1',null);session=null;status.textContent='Oturum tamamlandı ve çalışma sürene eklendi.';}
    }
    body.querySelector('#focusStart').onclick=()=>{const input=body.querySelector('#focusMinutes');if(!input.reportValidity())return;if(!session)session={id:Date.now().toString(),exam:activeExamBank,minutes:Number(input.value),remaining:Number(input.value)*60};session.endsAt=Date.now()+session.remaining*1000;save('mentoFocusSession:v1',session);status.textContent='Odak oturumu sürüyor.';tick();};
    body.querySelector('#focusPause').onclick=()=>{if(!session?.endsAt)return;session.remaining=Math.max(0,Math.ceil((session.endsAt-Date.now())/1000));session.endsAt=null;save('mentoFocusSession:v1',session);status.textContent='Duraklatıldı.';tick();};
    body.querySelector('#focusCancel').onclick=()=>{session=null;save('mentoFocusSession:v1',null);status.textContent='Oturum iptal edildi; süre eklenmedi.';tick();};
    body.querySelector('#focusMinutes').oninput=tick;
    tick();const interval=setInterval(tick,1000);signal.addEventListener('abort',()=>clearInterval(interval),{once:true});
  };
  window.openStudyLibrary=()=>{
    const body=shell('Konu kütüphanesi',activeExamBank);
    body.innerHTML='<label class="library-search">Konu ara<input id="topicSearch" type="search" autocomplete="off"></label><div id="libraryTopics"></div>';
    function render(){const query=body.querySelector('input').value.toLocaleLowerCase('tr-TR');body.querySelector('#libraryTopics').innerHTML=Object.entries(topicBanks[activeExamBank]).map(([lesson,topics])=>{const filtered=topics.filter(([topic])=>(lesson+' '+topic).toLocaleLowerCase('tr-TR').includes(query));return filtered.length?`<section class="study-section"><h3>${escape(lesson)}</h3><div class="planned-topics">${filtered.map(([topic])=>`<button data-topic-key="${escape([activeExamBank,lesson,topic].join('|'))}"><span>${escape(topic)}</span><small>3 video</small></button>`).join('')}</div></section>`:'';}).join('')||'<p>Aramana uygun konu bulunamadı.</p>';body.querySelectorAll('[data-topic-key]').forEach(b=>b.onclick=()=>openTopicLearning(...b.dataset.topicKey.split('|')));}
    body.querySelector('input').oninput=render;render();
  };
  function initQuiz(node,key,info,signal) {
    const baseKey='mentoReadyQuiz:v1:'+key;
    let state=null,position=0,testNumber=1,sets=[];
    const valid=(saved,questions)=>saved?.questions?.length===questions.length&&saved.questions.every((q,i)=>q.id===questions[i].id)&&Array.isArray(saved.answers)&&saved.answers.length===questions.length&&saved.answers.every((a,i)=>a===null||(Number.isInteger(a)&&a>=0&&a<questions[i].options.length));
    const persist=()=>save(baseKey+'|test:'+testNumber,{...state,position});
    function entry() {
      node.innerHTML=`<h3>Konu testleri</h3><p>${escape(info.exam)} · ${escape(info.lesson)} · ${escape(info.topic)}</p><button class="primary" id="beginQuiz">Testleri aç</button>`;
      node.querySelector('button').onclick=generate;
    }
    function list() {
      node.innerHTML=`<h3>Konu testleri</h3><p>${escape(info.topic)}</p><div class="planned-topics">${sets.map((questions,i)=>{const saved=read(baseKey+'|test:'+(i+1),null);const status=valid(saved,questions)?(saved.finished?'Tamamlandı':saved.answers.some(a=>a!==null)?'Devam et':'Başla'):'Başla';return `<button data-test-number="${i+1}"><span>Test ${i+1}</span><small>${questions.length} soru · ${status}</small></button>`;}).join('')}</div>`;
      node.querySelectorAll('[data-test-number]').forEach(b=>b.onclick=()=>{
        testNumber=Number(b.dataset.testNumber);const questions=sets[testNumber-1];const saved=read(baseKey+'|test:'+testNumber,null);
        state=valid(saved,questions)?{...saved,questions}:{questions,answers:questions.map(()=>null),finished:false};
        position=Math.max(0,Math.min(questions.length-1,state.position||0));
        state.finished?results():question();
      });
    }
    function backButton() {
      node.insertAdjacentHTML('afterbegin',`<button id="backToTests">Testlere dön</button><h3>Test ${testNumber}</h3>`);
      node.querySelector('#backToTests').onclick=list;
    }
    async function generate() {
      node.innerHTML='<p class="study-status" role="status">Hazır test yükleniyor…</p>';
      try {
        const data=await api('/api/question-bank',info,signal);
        if(signal.aborted)return;
        const questions=data.quiz?.questions;
        if(!Array.isArray(questions)||!questions.length||questions.length%10!==0)throw new Error('Hazır test verisi geçersiz.');
        sets=Array.from({length:questions.length/10},(_,i)=>questions.slice(i*10,i*10+10));
        const legacy=read(baseKey,null);
        if(valid(legacy,questions))sets.forEach((part,i)=>{
          if(!read(baseKey+'|test:'+(i+1),null))save(baseKey+'|test:'+(i+1),{questions:part,answers:legacy.answers.slice(i*10,i*10+10),finished:!!legacy.finished,position:0});
        });
        list();
      }catch(error){if(!signal.aborted){
        node.innerHTML=`<p role="status">${escape(error.message)}</p>`;
        if(error.status===404){
          node.insertAdjacentHTML('beforeend',`<h3>Resmî soru kaynakları</h3>${(error.sources||[]).filter(s=>/^https:\/\//.test(s.url)).map(s=>`<p><a class="question-source" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a></p>`).join('')}`);
        }else{node.insertAdjacentHTML('beforeend','<button>Tekrar dene</button>');node.querySelector('button').onclick=generate;}
      }}
    }
    function question() {
      const q=state.questions[position];
      const completed=state.answers.filter(a=>a!==null).length;
      const count=state.questions.length;
      node.innerHTML=`<div class="quiz-nav"><strong>Soru ${position+1} / ${count}</strong><span>${completed} cevaplandı</span></div><progress max="${count}" value="${completed}" aria-label="Cevaplanan sorular"></progress><div class="lecture-copy question-copy">${questionMarkup(q.question)}</div><div class="quiz-options">${q.options.map((o,i)=>`<button aria-pressed="${state.answers[position]===i}" data-answer="${i}">${String.fromCharCode(65+i)}. ${escape(o)}</button>`).join('')}</div><button id="clearAnswer" ${state.answers[position]===null?'disabled':''}>Cevabı temizle</button><div class="quiz-nav"><button id="prevQuestion" ${position===0?'disabled':''}>Önceki</button><button id="nextQuestion" ${position===count-1?'disabled':''}>Sonraki</button><button class="primary" id="finishQuiz">Testi bitir</button></div><div class="quiz-grid" aria-label="Sorular">${state.questions.map((_,i)=>`<button data-jump="${i}" class="${state.answers[i]!==null?'answered':''}" aria-current="${i===position}" aria-label="Soru ${i+1}${state.answers[i]!==null?', cevaplandı':''}">${i+1}</button>`).join('')}</div><div id="finishConfirm"></div>`;
      backButton();
      node.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{state.answers[position]=Number(b.dataset.answer);persist();question();});
      if(q.image){const image=document.createElement('img');image.src=q.image;image.alt='Soruya ait şekil';image.className='question-image';node.querySelector('.quiz-options').before(image);}
      if(q.source){const published=q.source.origin!=='user-ai'&&/^https:\/\//.test(q.source.url||'');const source=document.createElement(published?'a':'p');if(published){source.href=q.source.url;source.target='_blank';source.rel='noopener noreferrer';}source.className='question-source';source.textContent=q.source.title+(q.source.license?' · '+q.source.license:'');node.appendChild(source);}
      node.querySelector('#clearAnswer').onclick=()=>{state.answers[position]=null;persist();question();};
      node.querySelector('#prevQuestion').onclick=()=>{position--;persist();question();};
      node.querySelector('#nextQuestion').onclick=()=>{position++;persist();question();};
      node.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{position=Number(b.dataset.jump);persist();question();});
      node.querySelector('#finishQuiz').onclick=()=>{
        if(completed<count){const confirm=node.querySelector('#finishConfirm');confirm.innerHTML=`<p>${count-completed} soru boş. Testi bitirmek istiyor musun?</p><button class="primary">Bitir ve sonuçları gör</button>`;confirm.querySelector('button').onclick=finish;}
        else finish();
      };
    }
    function finish(){state.finished=true;persist();results();}
    function results() {
      const correct=state.questions.filter((q,i)=>q.correctIndex===state.answers[i]).length;
      const blank=state.answers.filter(a=>a===null).length;
      node.innerHTML=`<h3>Test sonucu</h3><p>${correct} doğru · ${state.questions.length-correct-blank} yanlış · ${blank} boş</p><button id="retryQuiz">Aynı testi yeniden çöz</button>${state.questions.map((q,i)=>`<article class="quiz-review ${state.answers[i]===q.correctIndex?'correct':'incorrect'}"><h3>Soru ${i+1}</h3><div class="question-copy">${questionMarkup(q.question)}</div><p>Cevabın: ${escape(state.answers[i]===null?'Boş':q.options[state.answers[i]])}</p><p>Doğru cevap: ${escape(q.options[q.correctIndex])}</p><p class="lecture-copy">${escape(q.explanation)}</p></article>`).join('')}`;
      backButton();
      node.querySelector('#retryQuiz').onclick=()=>{state.answers=state.questions.map(()=>null);state.finished=false;position=0;persist();question();};
    }
    entry();
  }
  if(location.pathname==='/panel/hedef-takibi')openStudyDashboard();
})();
