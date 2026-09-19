'use strict';
/*
 * Showoff Salon: Vercel edition.
 * The website and admin pages are static files in /public.
 * This one function serves /api/* and /uploads/*.
 * Data lives in a private Vercel Blob store:
 *   salon/db.json (bookings, invoices, menu, settings), salon/admin.json (password hash), salon/uploads/* (photos).
 * Environment: ADMIN_PASSWORD (first run only), SESSION_SECRET, plus the Blob store variables Vercel adds.
 */
const crypto = require('crypto');
const { Readable } = require('stream');
const { AsyncLocalStorage } = require('async_hooks');
const { makeSeed } = require('../seed');

const DB_KEY = 'salon/db.json', ADMIN_KEY = 'salon/admin.json', UPL_PREFIX = 'salon/uploads/';

/* Per-request state, so concurrent requests on one instance never share data. */
const als = new AsyncLocalStorage();
const ctx = () => als.getStore();
const db = new Proxy({}, { get: (_, k) => ctx().db[k], set: (_, k, v) => { ctx().db[k] = v; return true; } });

/* ---------- storage (Vercel Blob) ---------- */
let blobMod;
const blob = async () => blobMod || (blobMod = await import('@vercel/blob'));
const isConflict = e => !!e && /Precondition|AlreadyExists/i.test(String(e.name || '') + ' ' + String((e.constructor && e.constructor.name) || ''));
const conflictErr = () => Object.assign(new Error('Conflict'), { conflict: true });

async function readJsonBlob(key) {
  const { get } = await blob();
  const r = await get(key, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
}
async function writeJsonBlob(key, data, etag, forceOverwrite = false) {
  const { put } = await blob();
  try {
    await put(key, JSON.stringify(data), Object.assign(
      { access: 'private', contentType: 'application/json', addRandomSuffix: false },
      forceOverwrite ? { allowOverwrite: true } : (forceOverwrite ? { allowOverwrite: true } : (etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }))
    ));
  } catch (e) { if (isConflict(e)) throw conflictErr(); throw e; }
}
async function loadDb() {
  for (let i = 0; i < 3; i++) {
    const r = await readJsonBlob(DB_KEY);
    if (r) return r;
    try { await writeJsonBlob(DB_KEY, makeSeed(), null); } catch (e) { if (!e.conflict) throw e; }
  }
  throw new Error('Storage unavailable');
}
async function loadAdmin() {
  for (let i = 0; i < 3; i++) {
    const r = await readJsonBlob(ADMIN_KEY);
    if (r) return r;
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) fail(500, 'Admin password is not configured.');
    try { await writeJsonBlob(ADMIN_KEY, { hash: hashPw(pw) }, null); } catch (e) { if (!e.conflict) throw e; }
  }
  throw new Error('Storage unavailable');
}
async function save() { const c = ctx(); await writeJsonBlob(DB_KEY, c.db, c.etag, true); }

/* ---------- admin password + sessions (stateless signed cookie) ---------- */
function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const SESSION_MS = 12 * 3600 * 1000;
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 16) fail(500, 'Server is not configured.'); return s; };
const sign = exp => crypto.createHmac('sha256', secret()).update(exp + '.' + ctx().admin.hash.slice(-24)).digest('hex');
const makeSession = () => { const exp = String(Date.now() + SESSION_MS); return exp + '.' + sign(exp); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';')
  .map(s => s.trim().split('=')).filter(a => a[0]).map(a => [a[0], decodeURIComponent(a.slice(1).join('='))]));
function isAdmin(req) {
  const t = cookies(req).sid; if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || !(+exp > Date.now())) return false;
  const good = Buffer.from(sign(exp), 'hex'), got = Buffer.from(sig, 'hex');
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}
function requireAdmin(req) { if (!isAdmin(req)) fail(401, 'Please sign in again'); }
const sessionCookie = (req, t, maxAge) =>
  `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;

/* ---------- helpers ---------- */
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
const uid = () => crypto.randomBytes(5).toString('hex');
const hits = new Map();
function limit(key, max, ms) {
  const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms);
  if (a.length >= max) { hits.set(key, a); fail(429, 'Too many attempts. Please try again later.'); }
  a.push(now); hits.set(key, a);
}
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

const S = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const N = (v, min, max, def = 0) => { v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def; };
const r2 = n => Math.round(n * 100) / 100;
const IMG = v => /^\/uploads\/[a-f0-9]{16}\.(jpg|png|webp)$/.test(v) ? v : '';
const ID = v => /^[\w-]{1,40}$/.test(v || '') ? v : uid();
const TIME = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
const DATE = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3);
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
function httpUrl(v) { try { const u = new URL(String(v)); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 300) : ''; } catch { return ''; } }
function tzOk(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }
function nowLocal(tz) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length >= 8 && d.length <= 15 ? d : '';
}
const waNum = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; };

/* ---------- sanitizers for admin saves ---------- */
function cleanSettings(x) {
  x = x || {};
  const o = {
    salonName: S(x.salonName, 80) || 'Showoff Salon',
    tagline: S(x.tagline, 120),
    phone: S(x.phone, 30),
    whatsapp: waNum(S(x.whatsapp, 20)),
    email: S(x.email, 120),
    address: S(x.address, 200),
    mapUrl: httpUrl(x.mapUrl),
    instagram: S(x.instagram, 60).replace(/^@/, '').replace(/[^\w.]/g, ''),
    timezone: tzOk(x.timezone) ? x.timezone : 'Asia/Kolkata',
    open: TIME(x.open) || '10:00',
    close: TIME(x.close) || '20:00',
    slotMinutes: [15, 20, 30, 45, 60, 90, 120].includes(+x.slotMinutes) ? +x.slotMinutes : 30,
    capacity: N(x.capacity, 1, 50, 2) | 0,
    closedDays: [...new Set((Array.isArray(x.closedDays) ? x.closedDays : []).map(Number).filter(d => d >= 0 && d <= 6))],
    advanceDays: N(x.advanceDays, 1, 365, 60) | 0,
    invoiceFooter: S(x.invoiceFooter, 200)
  };
  if (toMin(o.close) <= toMin(o.open)) fail(400, 'Closing time must be after opening time');
  return o;
}
function cleanContent(x) {
  x = x || {};
  const keys = { heroTitle: 160, heroText: 400, servicesText: 300, menuText: 300, galleryText: 300, stylistsText: 300, aboutTitle: 160, aboutText: 3000, bookText: 300 };
  const o = {};
  for (const k in keys) o[k] = S(x[k], keys[k]);
  return o;
}
function cleanMenu(arr) {
  if (!Array.isArray(arr)) fail(400, 'Invalid menu');
  return arr.slice(0, 40).map(c => ({
    id: ID(c.id),
    name: S(c.name, 80) || 'Untitled',
    gender: ['all', 'female', 'male'].includes(c.gender) ? c.gender : 'all',
    note: S(c.note, 160),
    priceLabels: (Array.isArray(c.priceLabels) ? c.priceLabels : []).slice(0, 2).map(p => S(p, 20)).filter(Boolean),
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 80).map(i => ({
      id: ID(i.id),
      name: S(i.name, 100) || 'Untitled',
      desc: S(i.desc, 240),
      price: N(i.price, 0, 1e6, 0),
      price2: i.price2 === '' || i.price2 == null ? null : N(i.price2, 0, 1e6, 0),
      popular: !!i.popular,
      active: i.active !== false
    }))
  }));
}
function cleanStylists(arr) {
  if (!Array.isArray(arr)) fail(400, 'Invalid list');
  return arr.slice(0, 30).map(s => ({ id: ID(s.id), name: S(s.name, 80) || 'Add name', role: S(s.role, 80), bio: S(s.bio, 400), photo: IMG(s.photo), visible: s.visible !== false }));
}
function cleanGallery(arr) {
  if (!Array.isArray(arr)) fail(400, 'Invalid list');
  return arr.slice(0, 80).map(g => ({ id: ID(g.id), src: IMG(g.src), caption: S(g.caption, 120), visible: g.visible !== false })).filter(g => g.src);
}
const SECTIONS = { settings: cleanSettings, content: cleanContent, menu: cleanMenu, stylists: cleanStylists, gallery: cleanGallery };

/* ---------- availability + bookings ---------- */
function allSlots() {
  const s = db.settings, out = [];
  for (let m = toMin(s.open); m < toMin(s.close); m += s.slotMinutes) out.push(hhmm(m));
  return out;
}
function availability(date) {
  const s = db.settings, n = nowLocal(s.timezone);
  if (!DATE(date)) fail(400, 'Choose a valid date');
  if (date < n.date) return { closed: true, reason: 'This date has passed.', slots: [] };
  if (date > addDays(n.date, s.advanceDays)) return { closed: true, reason: `Bookings open up to ${s.advanceDays} days ahead.`, slots: [] };
  if (s.closedDays.includes(dow(date))) return { closed: true, reason: 'The salon is closed on this day.', slots: [] };
  const taken = {};
  db.bookings.forEach(b => { if (b.date === date && b.status !== 'cancelled') taken[b.time] = (taken[b.time] || 0) + 1; });
  return {
    closed: false,
    slots: allSlots().map(t => ({ time: t, free: !(date === n.date && toMin(t) <= n.min) && (taken[t] || 0) < s.capacity }))
  };
}
const itemIndex = () => new Map(db.menu.flatMap(c => c.items).map(i => [i.id, i]));

async function makeBooking(b, isAdmin = false) {
  const name = S(b.name, 80);
  if (name.length < 2) fail(400, 'Enter your name.');
  const phone = normPhone(b.phone);
  if (!phone) fail(400, 'Enter a valid phone number.');
  const email = S(b.email, 120);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Enter a valid email address or leave it blank.');
  const date = S(b.date, 10), time = S(b.time, 5);
  const av = availability(date);
  if (av.closed) fail(400, av.reason);
  const slot = av.slots.find(x => x.time === time);
  if (!slot) fail(400, 'Choose a time.');
  if (!isAdmin && !slot.free) fail(409, 'That time is full. Please choose another.');
  if (db.bookings.some(x => x.phone === phone && x.date === date && x.time === time && x.status !== 'cancelled'))
    fail(409, 'A booking already exists for this phone number at that time.');
  const idx = itemIndex();
  const services = (Array.isArray(b.services) ? b.services.slice(0, 30) : []).map(id => idx.get(id)).filter(Boolean).map(i => ({ id: i.id, name: i.name }));
  const rec = {
    id: uid(), ref: 'SB-' + (1001 + db.counters.booking++), name, phone, email, services, date, time,
    note: S(b.note, 300), status: isAdmin ? 'confirmed' : 'pending', adminNote: '',
    source: isAdmin ? 'admin' : 'web', createdAt: new Date().toISOString()
  };
  db.bookings.push(rec);
  await save();
  return rec;
}

/* ---------- invoices ---------- */
async function makeInvoice(b) {
  const c = b.client || {};
  const name = S(c.name, 80);
  if (name.length < 2) fail(400, 'Enter the client name.');
  const phone = c.phone ? normPhone(c.phone) : '';
  if (c.phone && !phone) fail(400, 'Enter a valid phone number.');
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 40)
    .map(i => ({ name: S(i.name, 120), qty: Math.round(N(i.qty, 1, 99, 1)), price: r2(N(i.price, 0, 1e6, 0)) }))
    .filter(i => i.name);
  if (!items.length) fail(400, 'Add at least one service.');
  const subtotal = r2(items.reduce((a, i) => a + i.qty * i.price, 0));
  const dtype = b.discount && b.discount.type === 'percent' ? 'percent' : 'flat';
  const dval = N(b.discount && b.discount.value, 0, dtype === 'percent' ? 100 : 1e6, 0);
  const discountAmt = Math.min(subtotal, dtype === 'percent' ? r2(subtotal * dval / 100) : r2(dval));
  const inv = {
    id: uid(),
    token: crypto.randomBytes(16).toString('hex'),
    no: 'SS-' + String(++db.counters.invoice).padStart(4, '0'),
    date: DATE(b.date) || nowLocal(db.settings.timezone).date,
    client: { name, phone, email: S(c.email, 120) },
    items, subtotal,
    discount: { type: dtype, value: dval }, discountAmt,
    total: r2(subtotal - discountAmt),
    servedBy: S(b.servedBy, 80),
    note: S(b.note, 300),
    bookingId: S(b.bookingId, 40),
    void: false,
    createdAt: new Date().toISOString()
  };
  db.invoices.push(inv);
  const bk = db.bookings.find(x => x.id === inv.bookingId);
  if (bk) bk.status = 'completed';
  await save();
  return inv;
}

function clientsList() {
  const m = new Map();
  const get = (phone, name, email) => {
    if (!phone) return null;
    if (!m.has(phone)) m.set(phone, { phone, name, email: email || '', bookings: 0, visits: 0, billed: 0, last: '' });
    const c = m.get(phone);
    if (name) c.name = name;
    if (email && !c.email) c.email = email;
    return c;
  };
  db.bookings.forEach(b => { const c = get(b.phone, b.name, b.email); if (c) { c.bookings++; c.last = c.last > b.date ? c.last : b.date; } });
  db.invoices.filter(i => !i.void).forEach(i => { const c = get(i.client.phone, i.client.name, i.client.email); if (c) { c.visits++; c.billed = r2(c.billed + i.total); c.last = c.last > i.date ? c.last : i.date; } });
  return [...m.values()].sort((a, b) => (b.last || '').localeCompare(a.last || ''));
}

/* ---------- http plumbing ---------- */
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"
};
function json(res, code, obj, extra = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...extra });
  res.end(JSON.stringify(obj));
}
function readJSON(req, maxBytes = 200 * 1024) {
  if (req._jsonP) return req._jsonP; // body is read once, so a retry after a save conflict can reuse it
  return req._jsonP = new Promise((resolve, reject) => {
    if (!/json/.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('Unsupported request'), { status: 415 }));
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > maxBytes) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('Invalid data'), { status: 400 })); } });
    req.on('error', reject);
  });
}
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

function publicSite() {
  return {
    settings: pick(db.settings, ['salonName', 'tagline', 'phone', 'whatsapp', 'email', 'address', 'mapUrl', 'instagram', 'open', 'close', 'slotMinutes', 'closedDays', 'advanceDays']),
    content: db.content,
    menu: db.menu.map(c => ({ ...c, items: c.items.filter(i => i.active) })).filter(c => c.items.length),
    stylists: db.stylists.filter(s => s.visible && s.name !== 'Add name'),
    gallery: db.gallery.filter(g => g.visible),
    today: nowLocal(db.settings.timezone).date
  };
}

async function serveUpload(res, rel) {
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(rel)) return json(res, 404, { error: 'Not found' });
  const { get } = await blob();
  const r = await get(UPL_PREFIX + rel, { access: 'private' });
  if (!r || r.statusCode !== 200) return json(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': r.blob.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable', ...SEC });
  Readable.fromWeb(r.stream).pipe(res);
}

/* ---------- routes ---------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname, m = req.method;
  let x;

  /* public API */
  if (m === 'GET' && p === '/api/site') return json(res, 200, publicSite());
  if (m === 'GET' && p === '/api/slots') return json(res, 200, availability(url.searchParams.get('date') || ''));
  if (m === 'POST' && p === '/api/bookings') {
    limit('book:' + ipOf(req), 8, 3600e3);
    const b = await readJSON(req);
    if (b.website) return json(res, 200, { ok: true }); // honeypot
    const r = await makeBooking(b);
    return json(res, 201, { ok: true, booking: { ref: r.ref, name: r.name, date: r.date, time: r.time, services: r.services.map(s => s.name) } });
  }
  if (m === 'GET' && (x = p.match(/^\/api\/invoice\/([a-f0-9]{32})$/))) {
    const inv = db.invoices.find(i => i.token === x[1] && !i.void);
    if (!inv) fail(404, 'Invoice not found');
    return json(res, 200, { invoice: inv, salon: pick(db.settings, ['salonName', 'address', 'phone', 'email', 'instagram', 'invoiceFooter']) });
  }

  /* admin auth */
  if (m === 'POST' && p === '/api/admin/login') {
    limit('login:' + ipOf(req), 6, 600e3);
    const b = await readJSON(req);
    if (!checkPw(String(b.password || ''), ctx().admin.hash)) fail(401, 'Wrong password.');
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, makeSession(), SESSION_MS / 1000) });
  }
  if (m === 'POST' && p === '/api/admin/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  if (m === 'GET' && p === '/api/admin/me') return json(res, 200, { admin: isAdmin(req) });

  /* admin API */
  if (p.startsWith('/api/admin/')) {
    requireAdmin(req);

    if (m === 'GET' && p === '/api/admin/data') {
      return json(res, 200, {
        settings: db.settings, content: db.content, menu: db.menu, stylists: db.stylists, gallery: db.gallery,
        bookings: db.bookings, invoices: db.invoices, clients: clientsList(), today: nowLocal(db.settings.timezone).date
      });
    }
    if (m === 'PUT' && (x = p.match(/^\/api\/admin\/(settings|content|menu|stylists|gallery)$/))) {
      const b = await readJSON(req, 1024 * 1024);
      db[x[1]] = SECTIONS[x[1]](b);
      await save();
      return json(res, 200, { ok: true, [x[1]]: db[x[1]] });
    }
    if (m === 'POST' && p === '/api/admin/bookings') return json(res, 201, { ok: true, booking: await makeBooking(await readJSON(req), true) });
    if ((m === 'PATCH' || m === 'DELETE') && (x = p.match(/^\/api\/admin\/bookings\/(\w+)$/))) {
      const i = db.bookings.findIndex(b => b.id === x[1]);
      if (i < 0) fail(404, 'Booking not found');
      if (m === 'DELETE') db.bookings.splice(i, 1);
      else {
        const b = await readJSON(req), bk = db.bookings[i];
        if (b.status !== undefined) { if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(b.status)) fail(400, 'Invalid status'); bk.status = b.status; }
        if (b.adminNote !== undefined) bk.adminNote = S(b.adminNote, 300);
      }
      await save();
      return json(res, 200, { ok: true, booking: db.bookings[i] || null });
    }
    if (m === 'POST' && p === '/api/admin/invoices') return json(res, 201, { ok: true, invoice: await makeInvoice(await readJSON(req)) });
    if (m === 'DELETE' && (x = p.match(/^\/api\/admin\/invoices\/(\w+)$/))) {
      const inv = db.invoices.find(i => i.id === x[1]);
      if (!inv) fail(404, 'Invoice not found');
      inv.void = true; await save();
      return json(res, 200, { ok: true });
    }
    if (m === 'POST' && p === '/api/admin/upload') {
      const b = await readJSON(req, 8 * 1024 * 1024);
      const mt = String(b.dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!mt) fail(400, 'Upload a JPG, PNG or WebP image.');
      const buf = Buffer.from(mt[2], 'base64');
      if (buf.length > 4 * 1024 * 1024) fail(413, 'Image is larger than 4 MB.');
      const magic = buf.subarray(0, 12);
      const ok = (mt[1] === 'jpeg' && magic[0] === 0xff && magic[1] === 0xd8) ||
        (mt[1] === 'png' && magic.subarray(1, 4).toString() === 'PNG') ||
        (mt[1] === 'webp' && magic.subarray(0, 4).toString() === 'RIFF' && magic.subarray(8, 12).toString() === 'WEBP');
      if (!ok) fail(400, 'That file is not a valid image.');
      const name = crypto.randomBytes(8).toString('hex') + '.' + (mt[1] === 'jpeg' ? 'jpg' : mt[1]);
      const { put } = await blob();
      await put(UPL_PREFIX + name, buf, { access: 'private', contentType: 'image/' + mt[1], addRandomSuffix: false, allowOverwrite: false });
      return json(res, 201, { ok: true, src: '/uploads/' + name });
    }
    if (m === 'POST' && p === '/api/admin/password') {
      const b = await readJSON(req);
      if (!checkPw(String(b.current || ''), ctx().admin.hash)) fail(400, 'Current password is wrong.');
      if (String(b.next || '').length < 8) fail(400, 'New password must be at least 8 characters.');
      ctx().admin.hash = hashPw(String(b.next));
      await writeJsonBlob(ADMIN_KEY, ctx().admin, ctx().adminEtag);
      return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, makeSession(), SESSION_MS / 1000) });
    }
  }
  fail(404, 'Not found');
}

/* Vercel entry point. Loads the data for this request, runs the route, retries if two saves collide. */
module.exports = async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    let up;
    if (req.method === 'GET' && (up = p.match(/^\/(?:api\/)?uploads\/([^/]+)$/))) return await serveUpload(res, up[1]);
    for (let attempt = 0; ; attempt++) {
      const store = { db: null, etag: null, admin: null, adminEtag: null };
      try {
        return await als.run(store, async () => {
          const d = await loadDb(); store.db = d.data; store.etag = d.etag;
          if (p.startsWith('/api/admin/')) { const a = await loadAdmin(); store.admin = a.data; store.adminEtag = a.etag; }
          await handle(req, res);
        });
      } catch (e) {
        if (e.conflict && attempt < 3) continue;
        throw e;
      }
    }
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch {} return; }
    if (e.conflict) return json(res, 409, { error: 'Someone else just saved changes. Please try again.' });
    if (e.status) return json(res, e.status, { error: e.message });
    console.error(e);
    json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
};
