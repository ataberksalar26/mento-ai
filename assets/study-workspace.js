/* Topic workspace uses the existing curriculum and server learning APIs. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let preferences = read('mentoStudyPreferences', {exam:activeExamBank,theme:'dark',minutes:60});
  let catalogPromise;
  let requestController;
  let focusBefore;
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
  dialog.addEventListener('close', () => { requestController?.abort(); focusBefore?.focus(); });
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
  studentApp.classList.toggle('light',preferences.theme==='light');
  for(const id of ['themeToggle','topThemeToggle']) document.getElementById(id).addEventListener('click',()=>{
    preferences.theme=studentApp.classList.contains('light')?'light':'dark';save('mentoStudyPreferences',preferences);
  });
  window.openStudySettings = () => {
    const body=shell('Ayarlar','Mento AI');
    body.innerHTML=`<form class="settings-form"><label>Görünüm<select name="theme"><option value="dark">Koyu</option><option value="light">Açık</option></select></label><label>Sınav<select name="exam"><option>LGS</option><option>TYT</option><option>AYT</option></select></label><label>Günlük çalışma hedefi (dakika)<input name="minutes" type="number" min="10" max="480" step="5" required></label><button class="primary" type="submit">Kaydet</button><p role="status" id="settingsSaved"></p></form>`;
    const form=body.querySelector('form');
    form.elements.theme.value=preferences.theme;
    form.elements.exam.value=activeExamBank;
    form.elements.minutes.value=preferences.minutes;
    form.onsubmit=e=>{
      e.preventDefault();
      preferences={exam:form.elements.exam.value,theme:form.elements.theme.value,minutes:Number(form.elements.minutes.value)};
      save('mentoStudyPreferences',preferences);chooseExam(preferences.exam);
      studentApp.classList.toggle('light',preferences.theme==='light');
      dialog.classList.toggle('study-light',preferences.theme==='light');
      body.querySelector('#settingsSaved').textContent='Ayarlar kaydedildi.';
    };
  };
  window.openTopicLearning = async (exam, lesson, topic, startTest=false) => {
    const body=shell(topic,exam+' · '+lesson);
    const signal=requestController.signal;
    const key=[exam,lesson,topic].join('|');
    const info={exam,lesson,topic};
    body.innerHTML=`<div class="study-tabs" role="tablist" aria-label="Konu çalışması"><button role="tab" aria-selected="true" id="lectureTab">Konu anlatımı</button><button role="tab" aria-selected="false" id="testTab">30 soruluk test</button></div><section id="lecturePane"><h3>Video dersleri</h3><div id="topicVideos" class="study-status" aria-live="polite">Videolar yükleniyor…</div><div id="topicLecture" class="study-section"><button class="primary" id="loadLecture">Ayrıntılı anlatımı aç</button></div></section><section id="testPane" hidden></section>`;
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
    async function loadVideos() {
      const node=body.querySelector('#topicVideos');
      try {
        catalogPromise ||= fetch('/data/topic-videos.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).catch(e=>{catalogPromise=null;throw e;});
        const catalog=await catalogPromise;
        if(signal.aborted)return;
        const videos=catalog[key]?.videos;
        if(!videos||videos.length!==3)throw new Error();
        node.className='video-list';
        node.innerHTML=videos.map((v,i)=>`<a class="video-item" href="https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}" target="_blank" rel="noopener noreferrer"><img src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="${escape(v.title)}" loading="lazy"><span class="video-number">${i+1}. Video</span><strong>${escape(v.title)}</strong><small>${escape(v.channel)} · ${escape(v.duration)}</small></a>`).join('');
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
  function initQuiz(node,key,info,signal) {
    let state=read('mentoReadyQuiz:v1:'+key,null);
    let position=0;
    if(state?.questions?.length!==30)state=null;
    const persist=()=>save('mentoReadyQuiz:v1:'+key,state);
    function entry() {
      node.innerHTML=`<h3>30 soruluk konu testi</h3><p>${escape(info.exam)} · ${escape(info.lesson)} · ${escape(info.topic)}</p><p>Günlük çalışma hedefin: ${preferences.minutes} dakika</p><button class="primary" id="beginQuiz">${state?(state.finished?'Sonuçları aç':'Teste devam et'):'Testi aç'}</button>`;
      node.querySelector('button').onclick=()=>state?(state.finished?results():question()):generate();
    }
    async function generate() {
      node.innerHTML='<p class="study-status" role="status">Hazır test yükleniyor…</p>';
      try {
        const data=await api('/api/question-bank',info,signal);
        if(signal.aborted)return;
        if(data.quiz?.questions?.length!==30)throw new Error();
        state={questions:data.quiz.questions,answers:Array(30).fill(null),finished:false};persist();question();
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
      node.innerHTML=`<div class="quiz-nav"><strong>Soru ${position+1} / 30</strong><span>${completed} cevaplandı</span></div><progress max="30" value="${completed}" aria-label="Cevaplanan sorular"></progress><h3 class="lecture-copy">${escape(q.question)}</h3><div class="quiz-options">${q.options.map((o,i)=>`<button aria-pressed="${state.answers[position]===i}" data-answer="${i}">${String.fromCharCode(65+i)}. ${escape(o)}</button>`).join('')}</div><button id="clearAnswer" ${state.answers[position]===null?'disabled':''}>Cevabı temizle</button><div class="quiz-nav"><button id="prevQuestion" ${position===0?'disabled':''}>Önceki</button><button id="nextQuestion" ${position===29?'disabled':''}>Sonraki</button><button class="primary" id="finishQuiz">Testi bitir</button></div><div class="quiz-grid" aria-label="Sorular">${state.questions.map((_,i)=>`<button data-jump="${i}" class="${state.answers[i]!==null?'answered':''}" aria-current="${i===position}" aria-label="Soru ${i+1}${state.answers[i]!==null?', cevaplandı':''}">${i+1}</button>`).join('')}</div><div id="finishConfirm"></div>`;
      node.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{state.answers[position]=Number(b.dataset.answer);persist();question();});
      if(q.image){const image=document.createElement('img');image.src=q.image;image.alt='Soruya ait şekil';image.className='question-image';node.querySelector('.quiz-options').before(image);}
      if(q.source){const link=document.createElement('a');link.href=q.source.url;link.target='_blank';link.rel='noopener noreferrer';link.className='question-source';link.textContent=q.source.title+' · '+q.source.license;node.appendChild(link);}
      node.querySelector('#clearAnswer').onclick=()=>{state.answers[position]=null;persist();question();};
      node.querySelector('#prevQuestion').onclick=()=>{position--;question();};
      node.querySelector('#nextQuestion').onclick=()=>{position++;question();};
      node.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{position=Number(b.dataset.jump);question();});
      node.querySelector('#finishQuiz').onclick=()=>{
        if(completed<30){const confirm=node.querySelector('#finishConfirm');confirm.innerHTML=`<p>${30-completed} soru boş. Testi bitirmek istiyor musun?</p><button class="primary">Bitir ve sonuçları gör</button>`;confirm.querySelector('button').onclick=finish;}
        else finish();
      };
    }
    function finish(){state.finished=true;persist();results();}
    function results() {
      const correct=state.questions.filter((q,i)=>q.correctIndex===state.answers[i]).length;
      const blank=state.answers.filter(a=>a===null).length;
      node.innerHTML=`<h3>Test sonucu</h3><p>${correct} doğru · ${30-correct-blank} yanlış · ${blank} boş</p><button id="retryQuiz">Aynı testi yeniden çöz</button>${state.questions.map((q,i)=>`<article class="quiz-review ${state.answers[i]===q.correctIndex?'correct':'incorrect'}"><h3>${i+1}. ${escape(q.question)}</h3><p>Cevabın: ${escape(state.answers[i]===null?'Boş':q.options[state.answers[i]])}</p><p>Doğru cevap: ${escape(q.options[q.correctIndex])}</p><p class="lecture-copy">${escape(q.explanation)}</p></article>`).join('')}`;
      node.querySelector('#retryQuiz').onclick=()=>{state.answers=Array(30).fill(null);state.finished=false;position=0;persist();question();};
    }
    entry();
  }
})();
