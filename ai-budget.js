const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const context = new AsyncLocalStorage();
const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const failure = (status, message, retryAfter = 60) => Object.assign(new Error(message), { status, retryAfter });

function createAiBudget(options = {}) {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const transport = options.fetch || fetch;
  const file = options.file || env.AI_USAGE_FILE || path.join(__dirname, '.runtime', 'ai-usage.json');
  const limits = {
    daily: positive(env.AI_DAILY_IP_LIMIT, 20),
    global: positive(env.AI_DAILY_SITE_LIMIT, 300),
    minute: positive(env.AI_MINUTE_IP_LIMIT, 3),
    concurrent: positive(env.AI_CONCURRENT_LIMIT, 3),
    output: positive(env.AI_MAX_OUTPUT_TOKENS, 1800),
    dailyOutput: positive(env.AI_DAILY_OUTPUT_TOKENS, 300000)
  };
  let ledger;
  let busy = 0;
  const cache = new Map();
  const pending = new Map();
  const minute = new Map();

  function state() {
    const date = new Date(now()).toISOString().slice(0, 10);
    if (!ledger) {
      try {
        ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!ledger || typeof ledger.date !== 'string' || !ledger.clients || !Number.isSafeInteger(ledger.total) || !Number.isSafeInteger(ledger.output)) throw new Error('Invalid quota ledger');
      } catch (error) {
        if (error.code !== 'ENOENT') throw failure(503, 'Kullanım sayacı okunamadı. AI geçici olarak kapalı.');
      }
    }
    if (!ledger || ledger.date !== date) ledger = { date, total: 0, output: 0, clients: {} };
    return ledger;
  }
  function client(req) {
    let address = req.socket?.remoteAddress || 'unknown';
    // Trust only the last address appended by the configured reverse proxy.
    if (env.TRUST_PROXY === '1' || env.RENDER === 'true') {
      address = String(req.headers['x-forwarded-for'] || address).split(',').at(-1).trim();
    }
    address = address.replace(/^::ffff:/, '');
    if (address.includes(':')) address = address.split(':').slice(0, 4).join(':');
    return crypto.createHash('sha256').update(state().date + '|' + address).digest('hex');
  }
  function persist() {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(ledger), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
    } catch { throw failure(503, 'Kullanım sayacı kaydedilemedi. AI geçici olarak kapalı.'); }
  }
  function reserve(req, tokens) {
    const usage = state();
    const id = client(req);
    const reset = Math.ceil((Date.parse(usage.date) + 86400000 - now()) / 1000);
    if ((usage.clients[id] || 0) >= limits.daily) throw failure(429, 'Bu bağlantının günlük AI hakkı doldu. Hazır testleri kullanabilirsin.', reset);
    if (usage.total >= limits.global || usage.output + tokens > limits.dailyOutput) throw failure(429, 'Bugünkü AI kullanım sınırına ulaşıldı. Hazır testler kullanılabilir.', reset);
    for (const [key, value] of minute) if (value.expires <= now()) minute.delete(key);
    const window = minute.get(id) || { count: 0, expires: now() + 60000 };
    if (window.count >= limits.minute) throw failure(429, 'Çok hızlı istek gönderildi. Bir dakika sonra tekrar dene.');
    if (busy >= limits.concurrent) throw failure(429, 'Koç şu anda yoğun. Biraz sonra tekrar dene.', 15);
    window.count++;
    minute.set(id, window);
    usage.clients[id] = (usage.clients[id] || 0) + 1;
    usage.total++;
    usage.output += tokens;
    // Reserve before the upstream call; failed requests are not automatically retried.
    persist();
  }
  async function request(url, init) {
    const active = context.getStore();
    if (!active?.req) throw failure(503, 'AI isteği için oturum bağlamı bulunamadı.');
    const payload = JSON.parse(init.body);
    const input = JSON.stringify(payload.input);
    const textOnly = input.replace(/data:image\/[^"\s]+/g, '[image]');
    if (textOnly.length > 16000 || input.length > 8000000) throw failure(413, 'İstek çok uzun. Metni kısalt veya daha küçük bir görsel seç.');
    payload.max_output_tokens = Math.min(positive(payload.max_output_tokens, 900), limits.output);
    const body = JSON.stringify(payload);
    const cacheable = ['/api/topic-lecture', '/api/flashcards'].includes(active.req.url);
    const key = crypto.createHash('sha256').update(body).digest('hex');
    for (const [id, entry] of cache) if (entry.expires <= now()) cache.delete(id);
    const cached = cacheable && cache.get(key);
    if (cached) return new Response(cached.text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (cacheable && pending.has(key)) return (await pending.get(key)).clone();
    reserve(active.req, payload.max_output_tokens);
    const task = (async () => {
      busy++;
      try {
        const response = await transport(url, { ...init, body, signal: AbortSignal.timeout(45000) });
        const text = await response.text();
        if (cacheable && response.ok) {
          if (cache.size >= 100) cache.delete(cache.keys().next().value);
          cache.set(key, { text, expires: now() + 86400000 });
        }
        return new Response(text, { status: response.status, headers: { 'Content-Type': 'application/json' } });
      } finally { busy--; }
    })();
    if (cacheable) pending.set(key, task);
    try { return (await task).clone(); } finally { if (cacheable) pending.delete(key); }
  }
  function status(req) {
    const usage = state();
    return { dailyLimit: limits.daily, remaining: Math.max(0, limits.daily - (usage.clients[client(req)] || 0)), resetsAt: new Date(Date.parse(usage.date) + 86400000).toISOString() };
  }
  return { request, status, limits };
}
module.exports = { createAiBudget, context };
