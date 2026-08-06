const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const USERS_FILE = path.join(ROOT, 'users.json');
const BRAIN_DATA_FILE = path.join(ROOT, 'data', 'mento-brain-questions.json');
const APP_VERSION = 'mixed-orange-yellow-text-2026-07-25-0011';

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

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function extractJsonBlock(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function askOpenAIVision({ imageDataUrl, instruction, student = {}, maxOutputTokens = 900 }) {
  if (!hasValidOpenAIKey()) {
    const error = new Error('OPENAI_API_KEY tanımlı değil.');
    error.status = 500;
    throw error;
  }

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
            'Öğrenci sana bir soru fotoğrafı gönderiyor. Görseldeki soruyu dikkatle oku.',
            'Görsel bulanık veya okunaksızsa bunu belirt ve öğrenciden daha net bir fotoğraf iste.',
            'Sınav garantisi verme; tıbbi, hukuki veya resmi garanti dili kullanma.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `Öğrenci bilgisi: ${JSON.stringify(student)}\n${instruction}` },
            { type: 'input_image', image_url: imageDataUrl }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || 'OpenAI görsel isteği başarısız oldu.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return extractOpenAIText(data);
}

async function askOpenAIQuizFromText({ topic, exam, lesson, variant = 1, questionCount = 20, maxOutputTokens = 4500 }) {
  if (!hasValidOpenAIKey()) {
    const error = new Error('OPENAI_API_KEY tanımlı değil.');
    error.status = 500;
    throw error;
  }

  const variantLabel = ['I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(4, Number(variant) - 1))] || 'I';
  const variantNote = Number(variant) > 1
    ? ` Bu Test ${variantLabel}. Öğrenci bu konudan önceki testleri de çözmüş olabilir; önceki testlerden tamamen farklı, benzer zorlukta yeni sorular üret.`
    : ` Bu Test ${variantLabel}.`;

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
            'Sen Mento AI adında Türkçe bir TYT, AYT ve LGS quiz üretme motorusun.',
            'Sadece geçerli JSON döndür, başka hiçbir açıklama, markdown veya metin ekleme.',
            'JSON şeması: {"title": string, "questions": [{"question": string, "options": [string,string,string,string], "correctIndex": number (0-3), "explanation": string}]}.',
            `Tam olarak ${questionCount} soru üret. Sorular verilen sınav seviyesine uygun, birbirinden farklı, net ve tek doğru cevaplı olsun. Kolay-orta-zor karışımı olacak şekilde dağıt.${variantNote}`
          ].join(' ')
        },
        {
          role: 'user',
          content: `Sınav: ${exam || 'TYT'}\nDers: ${lesson || ''}\nKonu / kaynak metin: ${topic}`
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || 'OpenAI quiz isteği başarısız oldu.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const quiz = extractJsonBlock(extractOpenAIText(data));
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    const error = new Error('Quiz üretilemedi, tekrar dene.');
    error.status = 502;
    throw error;
  }
  return quiz;
}

async function askOpenAIQuizFromImage({ imageDataUrl, exam, lesson, questionCount = 20, maxOutputTokens = 4500 }) {
  if (!hasValidOpenAIKey()) {
    const error = new Error('OPENAI_API_KEY tanımlı değil.');
    error.status = 500;
    throw error;
  }

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
            'Sen Mento AI adında Türkçe bir TYT, AYT ve LGS quiz üretme motorusun.',
            'Öğrenci bir ders notu veya soru fotoğrafı gönderiyor. Görseldeki konuyu temel alarak yeni bir quiz üret.',
            'Sadece geçerli JSON döndür, başka hiçbir açıklama, markdown veya metin ekleme.',
            'JSON şeması: {"title": string, "questions": [{"question": string, "options": [string,string,string,string], "correctIndex": number (0-3), "explanation": string}]}.',
            `Tam olarak ${questionCount} soru üret. Kolay-orta-zor karışımı olacak şekilde dağıt.`
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `Sınav: ${exam || 'TYT'}\nDers: ${lesson || ''}\nBu görseldeki konu/soru tipini temel alan yeni bir quiz üret.` },
            { type: 'input_image', image_url: imageDataUrl }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || 'OpenAI quiz isteği başarısız oldu.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const quiz = extractJsonBlock(extractOpenAIText(data));
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    const error = new Error('Quiz üretilemedi, tekrar dene.');
    error.status = 502;
    throw error;
  }
  return quiz;
}

async function handleVisionSolve(req, res) {
  try {
    const body = JSON.parse(await readBody(req, 15_000_000) || '{}');
    const imageDataUrl = String(body.image || '').trim();
    const question = String(body.question || '').trim();
    const student = body.student || {};

    if (!imageDataUrl.startsWith('data:image/')) {
      sendJson(res, 400, { error: 'Geçerli bir fotoğraf gerekli.' });
      return;
    }

    const instruction = question
      ? `Öğrencinin notu: ${question}\nGörseldeki soruyu çöz. Önce kısa cevap, sonra 3-5 adımlık açıklama, en sona 1 cümlelik koç önerisi ekle.`
      : 'Görseldeki soruyu çöz. Önce kısa cevap, sonra 3-5 adımlık açıklama, en sona 1 cümlelik koç önerisi ekle.';

    const answer = await askOpenAIVision({ imageDataUrl, instruction, student });
    sendJson(res, 200, { ok: true, answer: answer || 'Görsel okunamadı, tekrar dener misin?' });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Görsel işlenemedi.' });
  }
}

async function handleGenerateQuiz(req, res) {
  try {
    const body = JSON.parse(await readBody(req, 15_000_000) || '{}');
    const imageDataUrl = body.image ? String(body.image).trim() : '';
    const topic = String(body.topic || '').trim();
    const exam = String(body.exam || '').trim();
    const lesson = String(body.lesson || '').trim();
    const variant = Number(body.variant || 1);
    const questionCount = Math.min(30, Math.max(5, Number(body.questionCount || 20)));

    if (!imageDataUrl && !topic) {
      sendJson(res, 400, { error: 'Bir fotoğraf ya da konu bilgisi gerekli.' });
      return;
    }

    const quiz = imageDataUrl
      ? await askOpenAIQuizFromImage({ imageDataUrl, exam, lesson, questionCount })
      : await askOpenAIQuizFromText({ topic, exam, lesson, variant, questionCount });

    sendJson(res, 200, { ok: true, quiz: { ...quiz, exam, lesson, topic: topic || quiz.title, variant } });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Quiz üretilemedi.' });
  }
}

async function askOpenAITopicLecture({ exam, lesson, topic, weakPoints = [], maxOutputTokens = 1400 }) {
  if (!hasValidOpenAIKey()) {
    const error = new Error('OPENAI_API_KEY tanımlı değil.');
    error.status = 500;
    throw error;
  }

  const hasWeakPoints = Array.isArray(weakPoints) && weakPoints.length > 0;
  const weakPointsText = hasWeakPoints
    ? `\nÖğrencinin bu konudaki son testte yanlış yaptığı sorular:\n${weakPoints.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
    : '';

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
            'Sen Mento AI adında Türkçe konuşan bir TYT, AYT ve LGS konu anlatım öğretmenisin.',
            'Sadece geçerli JSON döndür, başka hiçbir açıklama, markdown veya metin ekleme.',
            'JSON şeması: {"summary": string, "sections": [{"heading": string, "body": string}], "example": {"question": string, "solution": string}, "tip": string}.',
            'summary 1-2 cümlelik kısa özet olsun. sections 3-5 adet, her biri konunun bir alt başlığını 3-6 cümleyle net anlatsın.',
            'example alanında konuyla ilgili örnek bir soru ve adım adım çözümü olsun. tip alanında sınavda işe yarayacak kısa bir pratik ipucu olsun.',
            hasWeakPoints
              ? 'Öğrenci bu konudan bir test çözdü ve bazı sorularda hata yaptı. Anlatımı genel geçmeyip özellikle öğrencinin yanlış yaptığı soru tiplerindeki kavram eksikliğine odakla; sections bu eksiklere göre seçilsin, example de mümkünse benzer bir soru tipinden olsun.'
              : '',
            'Türkçe, sınav öğrencisinin anlayacağı sade bir dil kullan.'
          ].filter(Boolean).join(' ')
        },
        {
          role: 'user',
          content: `Sınav: ${exam || 'TYT'}\nDers: ${lesson || ''}\nKonu: ${topic}${weakPointsText}`
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || 'OpenAI konu anlatımı isteği başarısız oldu.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const lecture = extractJsonBlock(extractOpenAIText(data));
  if (!lecture || !Array.isArray(lecture.sections) || !lecture.sections.length) {
    const error = new Error('Konu anlatımı üretilemedi, tekrar dene.');
    error.status = 502;
    throw error;
  }
  return lecture;
}

async function handleTopicLecture(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const topic = String(body.topic || '').trim();
    const exam = String(body.exam || '').trim();
    const lesson = String(body.lesson || '').trim();
    const weakPoints = Array.isArray(body.weakPoints) ? body.weakPoints.map(String).slice(0, 15) : [];

    if (!topic) {
      sendJson(res, 400, { error: 'Konu bilgisi gerekli.' });
      return;
    }

    const lecture = await askOpenAITopicLecture({ exam, lesson, topic, weakPoints });
    sendJson(res, 200, { ok: true, lecture });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || 'Konu anlatımı üretilemedi.' });
  }
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
    if (!exam || exam.length > 40) {
      sendJson(res, 400, { error: 'Sınav bilgisi geçersiz.' });
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

    if (user && user.googleAuth && !user.passwordHash) {
      sendJson(res, 401, { error: 'Bu hesap Google ile oluşturulmuş. Lütfen Google ile devam et butonunu kullan.' });
      return;
    }
    if (!user || !user.passwordHash || !verifyPassword(password, user)) {
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

async function handleGoogleLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const idToken = String(body.id_token || body.idToken || '').trim();
    if (!idToken) {
      sendJson(res, 400, { error: 'Google kimlik doğrulama verisi eksik.' });
      return;
    }

    const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const payload = await verifyResponse.json().catch(() => ({}));

    if (!verifyResponse.ok || payload.error) {
      sendJson(res, 401, { error: 'Google kimlik doğrulaması geçersiz veya süresi dolmuş.' });
      return;
    }

    const allowedClientIds = [
      firstEnv('GOOGLE_IOS_CLIENT_ID'),
      firstEnv('GOOGLE_WEB_CLIENT_ID'),
      firstEnv('GOOGLE_ANDROID_CLIENT_ID')
    ].filter(Boolean);
    if (allowedClientIds.length && !allowedClientIds.includes(payload.aud)) {
      sendJson(res, 401, { error: 'Google istemci kimliği tanınmıyor.' });
      return;
    }
    if (payload.email_verified !== 'true' && payload.email_verified !== true) {
      sendJson(res, 401, { error: 'Google e-postan doğrulanmamış.' });
      return;
    }

    const email = normalizeEmail(payload.email);
    if (!email) {
      sendJson(res, 401, { error: 'Google hesabından e-posta alınamadı.' });
      return;
    }

    const users = readUsers();
    let user = users.find(u => u.email === email);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = {
        id: crypto.randomUUID(),
        name: payload.name || email.split('@')[0],
        email,
        exam: '',
        birthYear: null,
        gender: '',
        goal: '',
        passwordSalt: null,
        passwordHash: null,
        googleAuth: true,
        verified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      writeUsers([...users, user]);
    } else if (!user.verified) {
      user.verified = true;
      user.updatedAt = new Date().toISOString();
      writeUsers(users);
    }

    sendJson(res, 200, { ok: true, isNewUser, user: publicUser(user) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Google girişi başarısız oldu.' });
  }
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

let appleKeysCache = null;
let appleKeysCacheAt = 0;

async function fetchApplePublicKeys() {
  if (appleKeysCache && Date.now() - appleKeysCacheAt < 60 * 60 * 1000) return appleKeysCache;
  const response = await fetch('https://appleid.apple.com/auth/keys');
  const data = await response.json();
  appleKeysCache = data.keys || [];
  appleKeysCacheAt = Date.now();
  return appleKeysCache;
}

async function verifyAppleIdentityToken(identityToken) {
  const parts = String(identityToken || '').split('.');
  if (parts.length !== 3) throw new Error('Geçersiz Apple kimlik verisi.');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));

  const keys = await fetchApplePublicKeys();
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw new Error('Apple imza anahtarı bulunamadı.');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const verified = crypto.verify('sha256', Buffer.from(`${headerB64}.${payloadB64}`), publicKey, base64UrlDecode(signatureB64));
  if (!verified) throw new Error('Apple token imzası doğrulanamadı.');

  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Apple token issuer geçersiz.');
  const allowedAudiences = [firstEnv('APPLE_BUNDLE_ID') || 'com.ataberksalar.mentoai'];
  if (!allowedAudiences.includes(payload.aud)) throw new Error('Apple token audience uyuşmuyor.');
  if (payload.exp && Date.now() / 1000 > Number(payload.exp)) throw new Error('Apple token süresi dolmuş.');

  return payload;
}

async function handleAppleLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const identityToken = String(body.identity_token || body.identityToken || '').trim();
    const fullName = body.fullName || {};
    if (!identityToken) {
      sendJson(res, 400, { error: 'Apple kimlik doğrulama verisi eksik.' });
      return;
    }

    const payload = await verifyAppleIdentityToken(identityToken);
    const email = normalizeEmail(payload.email);
    if (!email) {
      sendJson(res, 401, { error: 'Apple hesabından e-posta alınamadı.' });
      return;
    }

    const users = readUsers();
    let user = users.find(u => u.email === email);
    let isNewUser = false;
    const nameFromApple = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ').trim();

    if (!user) {
      isNewUser = true;
      user = {
        id: crypto.randomUUID(),
        name: nameFromApple || email.split('@')[0],
        email,
        exam: '',
        birthYear: null,
        gender: '',
        goal: '',
        passwordSalt: null,
        passwordHash: null,
        appleAuth: true,
        verified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      writeUsers([...users, user]);
    } else {
      let changed = false;
      if (!user.verified) { user.verified = true; changed = true; }
      if (nameFromApple && (!user.name || user.name === email.split('@')[0])) { user.name = nameFromApple; changed = true; }
      if (changed) { user.updatedAt = new Date().toISOString(); writeUsers(users); }
    }

    sendJson(res, 200, { ok: true, isNewUser, user: publicUser(user) });
  } catch (error) {
    sendJson(res, error.status || 401, { error: error.message || 'Apple girişi başarısız oldu.' });
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
  if (req.method === 'POST' && req.url === '/api/google-login') {
    handleGoogleLogin(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/apple-login') {
    handleAppleLogin(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/topic-lecture') {
    handleTopicLecture(req, res);
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
  if (req.method === 'POST' && req.url === '/api/vision-solve') {
    handleVisionSolve(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/generate-quiz') {
    handleGenerateQuiz(req, res);
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
