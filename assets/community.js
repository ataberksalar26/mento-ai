/* LGS community shares the existing account flow; credentials stay in memory. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let group = 'all', query = '', feed, data, request = 0;
  const joined = new Set(read('mentoCommunityGroups', []));
  const blocked = new Set(read('mentoCommunityBlocked', []));
  const dialog = document.createElement('dialog');
  dialog.className = 'community-dialog';
  document.body.append(dialog);
  let previousFocus;
  dialog.addEventListener('close', () => previousFocus?.focus());
  function modal(title, html) {
    previousFocus = document.activeElement;
    dialog.innerHTML = `<header><h2 id="communityDialogTitle">${esc(title)}</h2><button data-close aria-label="Kapat">×</button></header>${html}`;
    dialog.setAttribute('aria-labelledby', 'communityDialogTitle');
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
  }
  async function api(action, body = {}) {
    const response = await fetch('/api/community/' + action, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...body, email:currentUserEmail, password:currentUserPassword }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.');
    return result;
  }
  function announce(message) { if (feed?.isConnected) feed.querySelector('[role=status]').textContent = message; }
  function loginRequired() {
    if (currentUserEmail && currentUserPassword) return false;
    modal('Hesabınla katıl', '<p>Paylaşım ve yanıt için e-posta ve şifreyle doğrulanmış hesabına giriş yap. Sosyal hesaplarla paylaşım henüz açık değil.</p><a href="/giris">Giriş yap</a>');
    return true;
  }
  function story(item) {
    if (Date.parse(item.expiresAt) <= Date.now()) return announce('Bu hikâyenin süresi doldu.');
    modal(item.demo ? 'Demo hikâye' : 'Öğretmen hikâyesi', `<section class="story-view" style="--story-color:${/^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#217a63'}"><span>${esc(item.authorName)} ${item.demo ? '· Demo' : ''}</span><h3>${esc(item.title)}</h3><p>${esc(item.content)}</p><small>${item.demo ? 'Örnek içerik; gerçek öğretmen paylaşımı değildir. · ' : ''}${new Date(item.expiresAt).toLocaleString('tr-TR')} tarihinde sona erer.</small></section>`);
  }
  function compose(parentId = null, storyMode = false) {
    if (loginRequired()) return;
    modal(storyMode ? 'Hikâye paylaş' : parentId ? 'Yanıt yaz' : 'Yeni paylaşım', `<form class="community-compose"><label>Grup<select name="group">${data.groups.map(g => `<option value="${g.id}" ${g.id === group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>${storyMode ? '<label>Başlık<input name="title" maxlength="70" required></label>' : ''}<label>Mesaj<textarea name="content" rows="5" maxlength="600" required placeholder="Sorunu veya çalışma önerini paylaş..."></textarea></label><small>Telefon, adres, okul bilgisi ve kişisel bilgi paylaşma. İçerikler editör kontrolünden sonra görünür.${storyMode ? ' Hikâyeler 72 saat kalır.' : ''}</small><button type="submit">${parentId ? 'Yanıtı gönder' : 'Paylaş'}</button><p role="status"></p></form>`);
    const form = dialog.querySelector('form');
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]'); button.disabled = true;
      try {
        const result = await api(storyMode ? 'story' : 'post', { group:form.elements.group.value, content:form.elements.content.value, title:form.elements.title?.value, parentId });
        dialog.close(); await load(); announce(result.status === 'pending' ? 'Paylaşımın editör onayına gönderildi.' : 'Paylaşıldı.');
      } catch (error) { form.querySelector('[role=status]').textContent = error.message; }
      finally { button.disabled = false; }
    };
  }
  const visiblePosts = () => data.posts.filter(p => !blocked.has(p.authorId));
  function postHtml(p, detail = false) {
    const count = visiblePosts().filter(reply => reply.parentId === p.id).length;
    return `<article class="community-post"><header><span class="community-avatar">${esc(p.authorName[0])}</span><div><strong>${esc(p.authorName)}</strong><small>${esc(data.groups.find(g => g.id === p.group)?.name)} · ${new Date(p.createdAt).toLocaleDateString('tr-TR')}</small></div></header><p>${esc(p.content)}</p><footer>${!detail ? `<button data-thread="${p.id}">${count} yanıt</button>` : ''}<button data-report="${p.id}">Bildir</button><button data-block="${p.authorId}">Gizle</button><button data-delete="${p.id}">Sil</button></footer></article>`;
  }
  function bindPosts(root) {
    root.querySelectorAll('[data-thread]').forEach(b => b.onclick = () => {
      const post = data.posts.find(p => p.id === b.dataset.thread);
      modal('Grup konuşması', `<div class="community-thread">${postHtml(post, true)}${visiblePosts().filter(p => p.parentId === post.id).map(p => postHtml(p, true)).join('')}<button data-reply>Yanıt yaz</button></div>`);
      bindPosts(dialog); dialog.querySelector('[data-reply]').onclick = () => compose(post.id);
    });
    root.querySelectorAll('[data-block]').forEach(b => b.onclick = () => { blocked.add(b.dataset.block); save('mentoCommunityBlocked', [...blocked]); if(dialog.open)dialog.close(); paint(); announce('Bu kişinin paylaşımları bu cihazda gizlendi.'); });
    for (const action of ['report', 'delete']) root.querySelectorAll(`[data-${action}]`).forEach(b => b.onclick = async () => {
      if (loginRequired()) return;
      b.disabled = true;
      try { await api(action, { id:b.dataset[action] }); if(dialog.open)dialog.close(); await load(); announce(action === 'report' ? 'Paylaşım inceleme için yayından kaldırıldı.' : 'Paylaşım silindi.'); }
      catch(error) { if(dialog.open){const note=document.createElement('p');note.setAttribute('role','status');note.textContent=error.message;dialog.append(note);}else announce(error.message); }
      finally { b.disabled = false; }
    });
  }
  function paintPosts() {
    const list = feed.querySelector('.community-posts');
    const posts = visiblePosts().filter(p => !p.parentId && (group === 'all' || p.group === group) && (!query || p.content.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))));
    list.innerHTML = posts.length ? posts.map(p => postHtml(p)).join('') : '<p class="community-empty">Henüz paylaşım yok. İlk konuyu sen açabilirsin.</p>';
    bindPosts(list);
  }
  function paint() {
    if (!feed?.isConnected || !data) return;
    const stories = data.stories.filter(s => Date.parse(s.expiresAt) > Date.now() && !blocked.has(s.authorId));
    feed.innerHTML = `<header class="community-heading"><div><small>LGS TOPLULUĞU</small><h2>Birlikte çalışalım</h2></div><button data-compose>+ Paylaş</button></header><div class="community-stories" aria-label="Hikâyeler">${stories.map(s => `<button data-story="${s.id}"><span class="community-story-icon">${esc(s.authorName[0])}</span><strong>${esc(s.authorName)}</strong><small>${s.demo ? 'Demo · ' : ''}72 saat</small></button>`).join('')}<button data-add-story><span class="community-story-icon">+</span><strong>Hikâye ekle</strong><small>Öğretmenler</small></button></div><div class="community-groups" role="group" aria-label="LGS grupları"><button data-group="all" aria-pressed="${group==='all'}">Tüm gruplar</button>${data.groups.map(g=>`<button data-group="${g.id}" aria-pressed="${group===g.id}">${esc(g.name)}${joined.has(g.id) ? ' ✓' : ''}</button>`).join('')}</div><div class="community-tools"><input type="search" aria-label="Paylaşımlarda ara" placeholder="Paylaşımlarda ara" value="${esc(query)}">${group!=='all'?`<button data-join>${joined.has(group)?'Gruptan ayrıl':'Gruba katıl'}</button>`:''}<button data-refresh title="Akışı yenile" aria-label="Akışı yenile">↻</button></div><p role="status" aria-live="polite"></p><div class="community-posts"></div><footer class="community-bottom"><button data-unblock>Gizlenenleri göster</button><button data-moderate>Editör paneli</button><a href="/gizlilik.html">Gizlilik</a></footer>`;
    feed.querySelector('[data-compose]').onclick = () => compose();
    feed.querySelector('[data-add-story]').onclick = () => compose(null, true);
    feed.querySelectorAll('[data-story]').forEach(b => b.onclick = () => story(stories.find(s => s.id === b.dataset.story)));
    feed.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { group = b.dataset.group; paint(); });
    feed.querySelector('[data-join]')?.addEventListener('click', () => { joined.has(group) ? joined.delete(group) : joined.add(group); save('mentoCommunityGroups',[...joined]); paint(); });
    feed.querySelector('input[type=search]').oninput = e => { query=e.target.value; paintPosts(); };
    feed.querySelector('[data-refresh]').onclick = load;
    feed.querySelector('[data-unblock]').onclick = () => { blocked.clear();save('mentoCommunityBlocked',[]);paint(); };
    feed.querySelector('[data-moderate]').onclick = moderate;
    paintPosts();
  }
  async function moderate() {
    if (loginRequired()) return;
    try {
      const result = await api('moderate');
      modal('Editör incelemesi', result.pending.length ? result.pending.map(p => `<article class="community-post"><strong>${esc(p.authorName)}</strong><p>${esc(p.content)}</p><button data-approve="${p.id}">Yayınla</button><button data-hide="${p.id}">Reddet</button></article>`).join('') : '<p>Bekleyen içerik yok.</p>');
      for(const [attr,status] of [['approve','published'],['hide','hidden']]) dialog.querySelectorAll(`[data-${attr}]`).forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('moderate',{id:b.dataset[attr],status});await load();await moderate();}catch(e){b.textContent=e.message;b.disabled=false;}});
    } catch(error) { announce(error.message); }
  }
  async function load() {
    const id = ++request;
    announce('Yükleniyor...');
    try {
      const response = await fetch('/api/community', { cache:'no-store' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if(id !== request)return;
      data = result; paint();
    } catch { announce('Akış yüklenemedi. Yenile düğmesiyle tekrar dene.'); }
  }
  window.openCommunity = async () => {
    messages.replaceChildren();
    feed = document.createElement('section');feed.className='feed-wrap community';
    feed.innerHTML='<p role="status">Yükleniyor...</p><button data-retry>Yenile</button>';
    feed.querySelector('button').onclick=load;
    messages.append(feed); await load();
  };
  // Stories expire even when the page stays open for days.
  setInterval(() => {
    if(data?.stories.some(s=>Date.parse(s.expiresAt)<=Date.now())){
      data.stories=data.stories.filter(s=>Date.parse(s.expiresAt)>Date.now());
      if(dialog.open)dialog.close();paint();
    }
  }, 30000);
  function lgsOnly(root) {
    root.querySelectorAll('option').forEach(option => {
      if (/^(TYT|AYT)(\s|$)/.test(option.textContent.trim())) option.remove();
    });
  }
  lgsOnly(document);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)lgsOnly(node);}))).observe(document.body,{childList:true,subtree:true});
  document.querySelectorAll('[data-exam-choice]').forEach(b=>b.classList.toggle('selected',b.dataset.examChoice==='LGS'));
  document.title = 'Mento AI | LGS Çalışma ve Öğrenme Platformu';
  if(studentApp.classList.contains('open') && location.pathname==='/panel/akis') openCommunity();
})();
