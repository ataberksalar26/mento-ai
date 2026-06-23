const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, 'users.json');

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
    const goal = String(body.goal || '').trim();

    if (!name || !email || !password) {
      sendJson(res, 400, { error: 'Ad, e-posta ve şifre zorunlu.' });
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

    if (process.env.ADMIN_EMAIL) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: 'Mento AI yeni kullanıcı kaydı',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0E1A2B">
            <h2>Yeni kullanıcı üye oldu</h2>
            <p><b>Ad:</b> ${name}</p>
            <p><b>E-posta:</b> ${email}</p>
            <p><b>Sınav:</b> ${exam}</p>
            <p><b>Hedef:</b> ${goal || '-'}</p>
          </div>
        `
      });
    }

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
    const password = String(body.password || '');
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

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    exam: user.exam,
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
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

async function handleCoach(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, { error: 'OPENAI_API_KEY .env dosyasında yok.' });
    return;
  }
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const question = String(body.question || '').trim();
    const student = body.student || {};
    if (!question) {
      sendJson(res, 400, { error: 'Soru boş olamaz.' });
      return;
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        max_output_tokens: 450,
        input: [
          { role: 'system', content: 'Sen Mento AI adında Türkçe konuşan bir TYT, AYT ve LGS çalışma koçusun. Kısa, net, uygulanabilir cevap ver. Öğrenciyi motive et ama boş moral cümleleri kurma. Yanlış analizi, günlük plan, konu önceliği ve deneme yorumu yapabilirsin. Tıbbi, hukuki veya resmi sınav garantisi verme.' },
          { role: 'user', content: `Öğrenci bilgisi: ${JSON.stringify(student)}\nÖğrencinin sorusu: ${question}` }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, { error: data.error?.message || 'OpenAI isteği başarısız oldu.' });
      return;
    }
    const answer = data.output_text || data.output?.flatMap(item => item.content || []).map(part => part.text || '').join('\n').trim();
    sendJson(res, 200, { answer: answer || 'Cevap üretilemedi.' });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Sunucu hatası.' });
  }
}

const server = http.createServer((req, res) => {
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
  if (req.method === 'POST' && req.url === '/api/coach') {
    handleCoach(req, res);
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
