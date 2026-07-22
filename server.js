const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, 'users.json');
const BRAIN_DATA_FILE = path.join(ROOT, 'data', 'mento-brain-questions.json');
const APP_VERSION = 'orange-accent-panel-2026-07-22-0010';

loadEnv(path.join(ROOT, '.env'));

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBrainItems() {
  if (!fs.existsSync(BRAIN_DATA_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(BRAIN_DATA_FILE, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreBrainItem(item, text, exam, lesson) {
  const haystack = normalizeText([item.exam, item.lesson, item.topic, item.type, item.question, item.mistake].join(' '));
  const words = normalizeText(text).split(' ').filter(word => word.length > 2);
  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score += word.length > 5 ? 3 : 1;
  }
  if (score === 0) return 0;
  if (exam && item.exam === exam) score += 5;
  if (lesson && item.lesson === lesson) score += 5;
  return score;
}

function solveSimpleMath(question) {
  const normalized = String(question || '')
    .toLocaleLowerCase('tr-TR')
    .replaceAll('artı', '+')
    .replaceAll('arti', '+')
    .replaceAll('eksi', '-')
    .replaceAll('çarpı', '*')
    .replaceAll('carpi', '*')
    .replaceAll('kere', '*')
    .replaceAll('bölü', '/')
    .replaceAll('bolu', '/')
    .replaceAll(',', '.');
  if (!/^[\s\d.+\-*/()%=?kaçkacederneolursonuçcevap]+$/i.test(normalized)) return null;
  const expression = normalized
    .replace(/kaç|kac|eder|ne|olur|sonuç|sonuc|cevap|=/g, ' ')
    .replace(/[^\d.+\-*/()%\s]/g, '')
    .trim();
  if (!expression || !/[+\-*/]/.test(expression)) return null;
  try {
    const result = Function(`"use strict"; return (${expression})`)();
    if (!Number.isFinite(result)) return null;
    const clean = Number.isInteger(result) ? String(result) : String(Number(result.toFixed(4)));
    return `Cevap: ${clean}.\n\nKısa işlem: ${expression} = ${clean}.`;
  } catch {
    return null;
  }
}

function isGreeting(question) {
  return /^(selam|selamlar|merhaba|mrb|sa|hey|hi|hello)[!. ]*$/i.test(String(question || '').trim());
}

function buildBrainAnswer(question, student = {}) {
  const mathAnswer = solveSimpleMath(question);
  if (mathAnswer) return { answer: mathAnswer, matches: [] };
  if (isGreeting(question)) {
    return {
      answer: 'Selam, ben Mento Koç. Bana bir soru yazabilir, konu anlatımı isteyebilir veya “bugün 90 dakikalık plan çıkar” diyebilirsin.',
      matches: []
    };
  }
  const items = readBrainItems();
  const exam = String(student.exam || '').trim();
  const lesson = String(student.lesson || '').trim();
  const ranked = items
    .map(item => ({ item, score: scoreBrainItem(item, question, exam, lesson) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score >= 4 ? ranked[0].item : null;

  if (!best) {
    return {
      answer: 'Mento Brain bu soruyu genel çalışma koçu mantığıyla ele aldı: önce konuyu belirle, verilenleri tek tek yaz, senden isteneni ayır ve çözümü 3 adıma böl. Soru metnini biraz daha net yazarsan veri tabanındaki en yakın konuya bağlayabilirim.',
      matches: []
    };
  }

  const answer = [
    `${best.exam} ${best.lesson} - ${best.topic}`,
    `Soru tipi: ${best.type}.`,
    `Çözüm mantığı: ${best.solution}`,
    `Sık hata: ${best.mistake}`,
    `Koç önerisi: ${best.coach}`
  ].join('\n\n');

  return {
    answer,
    matches: ranked.slice(0, 3).filter(row => row.score > 0).map(row => ({
      id: row.item.id,
      exam: row.item.exam,
      lesson: row.item.lesson,
      topic: row.item.topic,
      score: row.score
    }))
  };
}

function extractOpenAIText(data) {
  return data.output_text || data.output?.flatMap(item => item.content || []).map(part => part.text || '').join('\n').trim();
}

function hasValidOpenAIKey() {
  return /^sk-[A-Za-z0-9_-]{40,}$/.test(String(process.env.OPENAI_API_KEY || '').trim());
}

async function askOpenAI({ question, student = {}, brainContext = null, maxOutputTokens = 650 }) {
  if (!hasValidOpenAIKey()) return null;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      max_output_tokens: maxOutputTokens,
      input: [
        {
          role: 'system',
          content: [
            'Sen Mento AI adında Türkçe konuşan bir TYT, AYT ve LGS çalışma koçusun.',
            'Cevapların doğru, kısa, net, uygulanabilir ve öğrenci dilinde olsun.',
            'Öğrenci basit bir işlem sorarsa önce işlemin doğrudan sonucunu ver; alakasız sınav konusuna bağlama.',
            'Öğrenci belirli bir soru sorarsa genel çalışma planı verme, soruyu çöz.',
            'Emin olmadığın yerde uydurma; gerekli bilgiyi sor.',
            'Sınav garantisi verme. Tıbbi, hukuki veya resmi garanti dili kullanma.',
            'Çözümde önce kısa cevap, sonra 3-5 adımlık açıklama, en sona 1 cümlelik koç önerisi ekle.',
            'Mento Brain bağlamı yalnızca soru ile gerçekten ilgiliyse kullan; ilgisizse görmezden gel.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Öğrenci bilgisi: ${JSON.stringify(student)}`,
            brainContext ? `Mento Brain bağlamı: ${JSON.stringify(brainContext)}` : '',
            `Öğrencinin sorusu: ${question}`
          ].filter(Boolean).join('\n')
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || 'OpenAI isteği başarısız oldu.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return extractOpenAIText(data);
}

function handleAuthDebug(req, res) {
  const adminEmail = normalizeEmail(firstEnv('ADMIN_USER_EMAIL', 'ADMIN_EMAIL', 'MENTO_ADMIN_EMAIL'));
  const adminPassword = String(firstEnv('ADMIN_USER_PASSWORD', 'ADMIN_PASSWORD', 'MENTO_ADMIN_PASSWORD')).trim();
  sendJson(res, 200, {
    ok: true,
    version: APP_VERSION,
    adminEmailSet: Boolean(adminEmail),
    adminEmailPreview: adminEmail ? `${adminEmail.slice(0, 3)}***@${adminEmail.split('@')[1] || 'mail'}` : '',
    adminPasswordSet: Boolean(adminPassword),
    adminPasswordLength: adminPassword.length,
    resendSet: Boolean(process.env.RESEND_API_KEY),
    fromEmailSet: Boolean(process.env.FROM_EMAIL),
    openAISet: Boolean(process.env.OPENAI_API_KEY),
    openAIKeyLooksValid: hasValidOpenAIKey(),
    openAIReady: hasValidOpenAIKey(),
    openAIModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini'
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return '';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const candidate = hashPassword(password, user.passwordSalt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function normalizeAdminPassword(value) {
  return String(value || '')
    .trim()
    .replaceAll('ç', 'c')
    .replaceAll('Ç', 'C')
    .replaceAll('ğ', 'g')
    .replaceAll('Ğ', 'G')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'I')
    .replaceAll('ö', 'o')
    .replaceAll('Ö', 'O')
    .replaceAll('ş', 's')
    .replaceAll('Ş', 'S')
    .replaceAll('ü', 'u')
    .replaceAll('Ü', 'U');
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable eksik.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'Mento AI <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    throw new Error(data.message || data.error || 'E-posta gönderilemedi.');
  }
  return data;
}

async function handleRegister(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const name = String(body.name || '').trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const exam = String(body.exam || 'TYT').trim();
    const birthYear = Number(body.birthYear || 0);
    const gender = String(body.gender || '').trim();
    const goal = String(body.goal || '').trim();

    if (!name || !email || !password) {
      sendJson(res, 400, { error: 'Ad, e-posta ve şifre zorunlu.' });
      return;
    }
    if (!['TYT', 'AYT', 'LGS'].includes(exam)) {
      sendJson(res, 400, { error: 'Sınav seçimi geçersiz.' });
      return;
    }
    if (!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear()) {
      sendJson(res, 400, { error: 'Doğum yılı 1900 ile bu yıl arasında olmalı.' });
      return;
    }
    if (!gender) {
      sendJson(res, 400, { error: 'Cinsiyet seçimi zorunlu.' });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
      return;
    }

    const users = readUsers();
    const existing = users.find(u => u.email === email);
    if (existing && existing.verified) {
      sendJson(res, 409, { error: 'Bu e-posta ile kayıtlı kullanıcı var.' });
      return;
    }

    const { salt, hash } = hashPassword(password);
    const code = generateCode();
    const codeExpiresAt = Date.now() + 10 * 60 * 1000;

    const user = {
      id: existing?.id || crypto.randomUUID(),
      name,
      email,
      exam,
      birthYear,
      gender,
      goal,
      passwordSalt: salt,
      passwordHash: hash,
      verified: false,
      verificationCodeHash: hashPassword(code).hash,
      verificationCodeSalt: hashPassword(code).salt,
      codeExpiresAt,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Fix code hash with same salt.
    const codeHash = hashPassword(code);
    user.verificationCodeSalt = codeHash.salt;
    user.verificationCodeHash = codeHash.hash;

    const nextUsers = existing ? users.map(u => u.email === email ? user : u) : [...users, user];
    writeUsers(nextUsers);

    await sendEmail({
      to: email,
      subject: 'Mento AI doğrulama kodun',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0E1A2B">
          <h2>Mento AI'a hoş geldin, ${name}</h2>
          <p>Hesabını doğrulamak için kodun:</p>
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;background:#F2F4F7;padding:16px;border-radius:10px;display:inline-block">${code}</div>
          <p>Bu kod 10 dakika geçerlidir.</p>
        </div>
      `
    });

    sendJson(res, 200, { ok: true, message: 'Doğrulama kodu e-postana gönderildi.', email });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Kayıt hatası.' });
  }
}

async function handleVerify(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
      sendJson(res, 404, { error: 'Kullanıcı bulunamadı.' });
      return;
    }
    if (!code || Date.now() > Number(user.codeExpiresAt || 0)) {
      sendJson(res, 400, { error: 'Kod geçersiz veya süresi dolmuş.' });
      return;
    }

    const candidate = hashPassword(code, user.verificationCodeSalt).hash;
    const ok = crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.verificationCodeHash, 'hex'));
    if (!ok) {
      sendJson(res, 400, { error: 'Kod hatalı.' });
      return;
    }

    user.verified = true;
    user.verificationCodeHash = null;
    user.verificationCodeSalt = null;
    user.codeExpiresAt = null;
    user.updatedAt = new Date().toISOString();
    writeUsers(users);

    sendJson(res, 200, { ok: true, user: publicUser(user) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Doğrulama hatası.' });
  }
}

async function handleLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const email = normalizeEmail(body.email);
    const password = String(body.password || '').trim();

    const adminEmail = normalizeEmail(firstEnv('ADMIN_USER_EMAIL', 'ADMIN_EMAIL', 'MENTO_ADMIN_EMAIL'));
    const adminPassword = String(firstEnv('ADMIN_USER_PASSWORD', 'ADMIN_PASSWORD', 'MENTO_ADMIN_PASSWORD')).trim();
    const isAdminEmail = adminEmail && email === adminEmail;
    if (
      isAdminEmail &&
      adminPassword &&
      (password === adminPassword || normalizeAdminPassword(password) === normalizeAdminPassword(adminPassword))
    ) {
      sendJson(res, 200, {
        ok: true,
        user: {
          id: 'student-local',
          name: 'Mento Öğrencisi',
          email,
          exam: 'LGS',
          goal: 'Kişisel çalışma planı',
          verified: true
        }
      });
      return;
    }

    if (isAdminEmail) {
      sendJson(res, 401, {
        error: adminPassword
          ? 'Admin şifresi Render değerindeki ADMIN_USER_PASSWORD ile eşleşmedi.'
          : 'ADMIN_USER_PASSWORD Render Environment içinde yok.'
      });
      return;
    }

    const user = readUsers().find(u => u.email === email);

    if (!user || !verifyPassword(password, user)) {
      sendJson(res, 401, { error: 'E-posta veya şifre hatalı.' });
      return;
    }
    if (!user.verified) {
      sendJson(res, 403, { error: 'Önce e-posta doğrulama kodunu girmen gerekiyor.', needsVerification: true, email });
      return;
    }

    sendJson(res, 200, { ok: true, user: publicUser(user) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Giriş hatası.' });
  }
}

async function handleRequestPasswordReset(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const email = normalizeEmail(body.email);
    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!email) {
      sendJson(res, 400, { error: 'E-posta gerekli.' });
      return;
    }

    const adminEmail = normalizeEmail(firstEnv('ADMIN_USER_EMAIL', 'ADMIN_EMAIL', 'MENTO_ADMIN_EMAIL'));
    if (adminEmail && email === adminEmail) {
      sendJson(res, 400, { error: 'Bu hesap için şifre Render ortam değişkeninden yönetilir.' });
      return;
    }

    if (!user) {
      sendJson(res, 200, { ok: true, message: 'E-posta kayıtlıysa kod gönderildi.' });
      return;
    }

    const code = generateCode();
    const codeHash = hashPassword(code);
    user.resetCodeSalt = codeHash.salt;
    user.resetCodeHash = codeHash.hash;
    user.resetCodeExpiresAt = Date.now() + 10 * 60 * 1000;
    user.updatedAt = new Date().toISOString();
    writeUsers(users);

    await sendEmail({
      to: email,
      subject: 'Mento AI şifre sıfırlama kodun',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0E1A2B">
          <h2>Mento AI şifre sıfırlama</h2>
          <p>Şifreni yenilemek için Mento AI giriş ekranındaki <b>Şifremi unuttum</b> alanına bu 6 haneli kodu gir:</p>
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;background:#F2F4F7;padding:16px;border-radius:10px;display:inline-block">${code}</div>
          <p>Bu kod 10 dakika geçerlidir. Kodu ve yeni şifreni girince hesabın açılır.</p>
        </div>
      `
    });

    sendJson(res, 200, { ok: true, message: 'Şifre sıfırlama kodu e-postana gönderildi.' });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Şifre sıfırlama kodu gönderilemedi.' });
  }
}

async function handleResetPassword(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    const users = readUsers();
    const user = users.find(u => u.email === email);

    if (!user || !code || !password) {
      sendJson(res, 400, { error: 'E-posta, kod ve yeni şifre gerekli.' });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: 'Şifre en az 6 karakter olmalı.' });
      return;
    }
    if (!user.resetCodeHash || Date.now() > Number(user.resetCodeExpiresAt || 0)) {
      sendJson(res, 400, { error: 'Kod geçersiz veya süresi dolmuş.' });
      return;
    }

    const candidate = hashPassword(code, user.resetCodeSalt).hash;
    const ok = crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.resetCodeHash, 'hex'));
    if (!ok) {
      sendJson(res, 400, { error: 'Kod hatalı.' });
      return;
    }

    const nextPassword = hashPassword(password);
    user.passwordSalt = nextPassword.salt;
    user.passwordHash = nextPassword.hash;
    user.resetCodeSalt = null;
    user.resetCodeHash = null;
    user.resetCodeExpiresAt = null;
    user.verified = true;
    user.updatedAt = new Date().toISOString();
    writeUsers(users);

    sendJson(res, 200, { ok: true, user: publicUser(user) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Şifre yenilenemedi.' });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    exam: user.exam,
    birthYear: user.birthYear,
    gender: user.gender,
    goal: user.goal,
    verified: user.verified
  };
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webmanifest': 'application/manifest+json; charset=utf-8'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }
  if (!path.extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
      sendFile(res, htmlPath);
      return;
    }
  }
  const appRoutes = [
    '/home',
    '/giris',
    '/kayit',
    '/plan',
    '/plan/sinav',
    '/plan/netler',
    '/plan/hedef',
    '/plan/hesap',
    '/panel',
    '/panel/bugunku-plan',
    '/panel/soru-coz',
    '/panel/konu-anlatimi',
    '/panel/ezber-kartlari',
    '/panel/oyunlarla-ogren',
    '/panel/mini-testler',
    '/panel/hedef-takibi'
  ];
  if (appRoutes.includes(urlPath)) {
    sendFile(res, path.join(ROOT, 'index.html'));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

async function handleCoach(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const question = String(body.question || '').trim();
    const student = body.student || {};
    if (!question) {
      sendJson(res, 400, { error: 'Soru boş olamaz.' });
      return;
    }
    const fallback = buildBrainAnswer(question, student);
    const answer = await askOpenAI({ question, student, brainContext: fallback.matches, maxOutputTokens: 900 }) || fallback.answer;
    sendJson(res, 200, { ok: true, source: hasValidOpenAIKey() ? 'openai' : 'mento-brain', answer, matches: fallback.matches });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Sunucu hatası.' });
  }
}

async function handleBrainAnswer(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const question = String(body.question || '').trim();
    const student = body.student || {};

    if (!question) {
      sendJson(res, 400, { error: 'Soru boş olamaz.' });
      return;
    }

    const local = buildBrainAnswer(question, student);
    if (!hasValidOpenAIKey()) {
      sendJson(res, 200, { ok: true, source: 'mento-brain', ...local });
      return;
    }

    try {
      const answer = await askOpenAI({
        question,
        student,
        brainContext: {
          localAnswer: local.answer,
          matches: local.matches
        },
        maxOutputTokens: 900
      });
      sendJson(res, 200, { ok: true, source: 'openai+mento-brain', answer: answer || local.answer, matches: local.matches });
    } catch (error) {
      sendJson(res, 200, { ok: true, source: 'mento-brain-fallback', ...local, openAIError: error.message });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Mento Brain hatası.' });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/auth-debug') {
    handleAuthDebug(req, res);
    return;
  }
  if (req.method === 'GET' && req.url === '/api/brain/questions') {
    sendJson(res, 200, { ok: true, count: readBrainItems().length, items: readBrainItems() });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/register') {
    handleRegister(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/verify-code') {
    handleVerify(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/login') {
    handleLogin(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/request-password-reset') {
    handleRequestPasswordReset(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/reset-password') {
    handleResetPassword(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/coach') {
    handleCoach(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/brain/answer') {
    handleBrainAnswer(req, res);
    return;
  }
  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Mento AI hazır: http://localhost:${PORT}`);
});
