const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GROUPS = [
  ['genel', 'LGS Sohbet'], ['matematik', 'Matematik'], ['turkce', 'Türkçe'],
  ['fen', 'Fen Bilimleri'], ['inkilap', 'İnkılap Tarihi'], ['din', 'Din Kültürü'],
  ['ingilizce', 'İngilizce'], ['deneme', 'Deneme ve Çalışma']
].map(([id, name]) => ({ id, name }));
const TTL = 72 * 60 * 60 * 1000;

module.exports = function createCommunity({ root, readUsers, verifyPassword, sendJson, readBody }) {
  const file = process.env.COMMUNITY_FILE || path.join(root, '.runtime', 'community.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) persist({ demoStartedAt: Date.now(), posts: [], stories: [], reports: [] });
  function read() { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  function persist(data) {
    fs.writeFileSync(file + '.tmp', JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  const attempts = new Map();
  function limit(req) {
    const key = req.socket.remoteAddress;
    const now = Date.now();
    for (const [ip, value] of attempts) if (value.until < now) attempts.delete(ip);
    const entry = attempts.get(key) || { count: 0, until: now + 60000 };
    attempts.set(key, entry);
    if (++entry.count > 30) fail(429, 'Çok sık işlem yapıldı. Bir dakika sonra tekrar dene.');
  }
  function fail(status, message) { throw Object.assign(new Error(message), { status }); }
  function authenticate(body) {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const adminEmail = process.env.ADMIN_USER_EMAIL || process.env.ADMIN_EMAIL || process.env.MENTO_ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_USER_PASSWORD || process.env.ADMIN_PASSWORD || process.env.MENTO_ADMIN_PASSWORD;
    if (adminEmail && adminPassword && email === adminEmail.toLowerCase() && password === adminPassword) {
      return { id: 'community-admin', name: 'Mento Editör', role: 'admin', verified: true };
    }
    const user = readUsers().find(u => u.email.toLowerCase() === email);
    if (!user?.passwordHash || !verifyPassword(password, user) || !user.verified) fail(401, 'Paylaşım için doğrulanmış hesabınla giriş yap.');
    return user;
  }
  const authorId = user => crypto.createHash('sha256').update(String(user.id || user.email)).digest('hex').slice(0, 16);
  const isEditor = user => user.role === 'admin';
  function publicItem(item) {
    const { owner, status, ...visible } = item;
    return visible;
  }
  function validateText(value, max = 600) {
    const text = String(value || '').trim();
    if (!text || text.length > max) fail(400, `Metin 1–${max} karakter olmalı.`);
    if (/https?:|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d[\s()+-]*){10,}/i.test(text)) fail(400, 'Bağlantı, telefon veya e-posta paylaşma.');
    return text;
  }
  function demos(data, now) {
    const expiresAt = data.demoStartedAt + TTL;
    if (now >= expiresAt) return [];
    return [
      ['matematik', 'Matematik Atölyesi', 'Önce modeli kur', 'Yeni nesil bir soruda verilenleri tabloya ayır. İşleme başlamadan önce senden isteneni tek cümleyle yaz.', '#217a63'],
      ['turkce', 'Türkçe Atölyesi', 'Paragraf molası', 'Ana düşünceyi seçerken yalnızca bir cümleye değil, metnin bütününe bak. Seçeneğin metinde karşılığı var mı?', '#405dcc'],
      ['fen', 'Fen Atölyesi', 'Deneyin değişkenleri', 'Değiştirilen: bağımsız değişken. Ölçülen: bağımlı değişken. Sabit tutulan: kontrol değişkeni.', '#99548b']
    ].map(([group, authorName, title, content, color]) => ({ id: 'demo-' + group, group, authorName, title, content, color, demo: true, createdAt: new Date(data.demoStartedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() }));
  }
  return async function community(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method === 'GET' && req.url === '/api/community') {
        const data = read();
        sendJson(res, 200, { groups: GROUPS, posts: data.posts.filter(p => p.status === 'published').map(publicItem), stories: [...demos(data, Date.now()), ...data.stories.filter(s => s.status === 'published' && Date.parse(s.expiresAt) > Date.now()).map(publicItem)] });
        return;
      }
      if (req.method !== 'POST') fail(405, 'Geçersiz işlem.');
      if ((process.env.NODE_ENV === 'production' || process.env.RENDER) && !process.env.COMMUNITY_FILE) {
        fail(503, 'Topluluk paylaşımları kalıcı depolama hazırlanırken kapalı. Dersleri ve testleri kullanabilirsin.');
      }
      limit(req);
      const body = JSON.parse(await readBody(req) || '{}');
      const user = authenticate(body);
      const owner = authorId(user);
      const data = read();
      if (req.url === '/api/community/moderate') {
        if (!isEditor(user)) fail(403, 'Editör yetkisi gerekli.');
        if (body.id) {
          const item = [...data.posts, ...data.stories].find(p => p.id === body.id);
          if (!item) fail(404, 'Paylaşım bulunamadı.');
          if (!['published', 'hidden'].includes(body.status)) fail(400, 'Geçersiz durum.');
          item.status = body.status;
          persist(data);
        }
        sendJson(res, 200, { pending: [...data.posts, ...data.stories].filter(p => p.status === 'pending' || p.status === 'reported').map(publicItem) });
        return;
      }
      if (req.url === '/api/community/report' || req.url === '/api/community/delete') {
        const item = [...data.posts, ...data.stories].find(p => p.id === body.id);
        if (!item) fail(404, 'Paylaşım bulunamadı.');
        if (req.url.endsWith('/delete')) {
          if (item.owner !== owner && !isEditor(user)) fail(403, 'Yalnızca kendi paylaşımını silebilirsin.');
          item.status = 'hidden';
        } else {
          item.status = 'reported';
          data.reports.push({ id: item.id, owner, createdAt: new Date().toISOString() });
          data.reports = data.reports.slice(-1000);
        }
        persist(data);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.url !== '/api/community/post' && req.url !== '/api/community/story') fail(404, 'Adres bulunamadı.');
      const story = req.url.endsWith('/story');
      if (story && !isEditor(user) && !user.teacherVerified) fail(403, 'Hikâye paylaşımı için öğretmen hesabının editör tarafından doğrulanması gerekir.');
      const group = GROUPS.find(g => g.id === body.group)?.id;
      if (!group) fail(400, 'Bir LGS grubu seç.');
      const items = [...data.posts, ...data.stories].filter(p => p.owner === owner && Date.now() - Date.parse(p.createdAt) < 86400000);
      if (items.length >= 10) fail(429, 'Günlük 10 paylaşım sınırına ulaştın.');
      if (items.some(p => Date.now() - Date.parse(p.createdAt) < 30000)) fail(429, 'Yeni paylaşım için 30 saniye bekle.');
      const parent = body.parentId && data.posts.find(p => p.id === body.parentId && !p.parentId && p.status === 'published');
      if (body.parentId && !parent) fail(400, 'Konu artık yanıtlanamıyor.');
      const item = {
        id: crypto.randomUUID(), owner, authorId: owner,
        authorName: isEditor(user) ? 'Mento Editör' : user.teacherVerified ? String(user.name).slice(0, 50) : 'Öğrenci ' + owner.slice(0, 6),
        teacher: !!user.teacherVerified, group: parent?.group || group,
        content: validateText(body.content), parentId: parent?.id || null,
        createdAt: new Date().toISOString(), status: isEditor(user) ? 'published' : 'pending',
        ...(story ? { title: validateText(body.title, 70), expiresAt: new Date(Date.now() + TTL).toISOString(), color: '#217a63' } : {})
      };
      if (story) data.stories.unshift(item); else data.posts.unshift(item);
      if (data.posts.length + data.stories.length > 20000) fail(503, 'Topluluk kapasitesine ulaşıldı. Editöre haber ver.');
      persist(data);
      sendJson(res, 201, { ok: true, status: item.status, id: item.id });
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.status ? error.message : 'İşlem tamamlanamadı. Lütfen yeniden dene.' });
    }
  };
};
