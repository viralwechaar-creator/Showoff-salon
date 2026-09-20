'use strict';

const crypto = require('crypto');
const { Readable } = require('stream');
const { AsyncLocalStorage } = require('async_hooks');
const { makeSeed } = require('../seed');

let blobMod;
const blob = async () => blobMod || (blobMod = await import('@vercel/blob'));

const DB_KEY = 'salon/db.json';
const ADMIN_KEY = 'salon/admin.json';
const UPLOAD_PREFIX = 'salon/uploads/';

const als = new AsyncLocalStorage();

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  if (req._bodyPromise) return req._bodyPromise;

  req._bodyPromise = new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');

    req.on('data', chunk => {
      body += chunk;
      if (body.length > 15_000_000) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error('Invalid JSON.'), { status: 400 }));
      }
    });

    req.on('error', reject);
  });

  return req._bodyPromise;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) fail(500, 'Server is not configured.');
  return s;
}

function sign(value) {
  return crypto
    .createHmac('sha256', secret())
    .update(value)
    .digest('base64url');
}

function makeSession(admin) {
  const payload = Buffer.from(JSON.stringify({
    admin: !!admin,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  })).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

function readSession(req) {
  const raw = String(req.headers.cookie || '');
  const match = raw.match(/(?:^|;\s*)salon_session=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;

  const expected = sign(payload);

  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());

    if (!data.admin || !data.exp || Date.now() > data.exp) return null;

    return data;
  } catch {
    return null;
  }
}

function isAdmin(req) {
  return !!readSession(req);
}

function setSession(res, admin) {
  res.setHeader(
    'Set-Cookie',
    `salon_session=${makeSession(admin)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
  );
}

function clearSession(res) {
  res.setHeader(
    'Set-Cookie',
    'salon_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
  );
}

async function readJsonBlob(key) {
  const { get } = await blob();

  const r = await get(key, {
    access: 'private',
    useCache: false
  });

  if (!r || !r.stream) return null;

  const text = await new Response(r.stream).text();

  return JSON.parse(text);
}

async function writeJsonBlob(key, data) {
  const { put } = await blob();

  await put(key, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

async function loadDb() {
  const found = await readJsonBlob(DB_KEY);

  if (found) return found;

  const db = makeSeed();

  await writeJsonBlob(DB_KEY, db);

  return db;
}

async function loadAdmin() {
  const found = await readJsonBlob(ADMIN_KEY);

  if (found) return found;

  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    fail(500, 'Admin password is not configured.');
  }

  const hash = crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');

  const data = {
    passwordHash: hash
  };

  await writeJsonBlob(ADMIN_KEY, data);

  return data;
}

async function getStore() {
  const existing = als.getStore();

  if (existing) return existing;

  const db = await loadDb();
  const admin = await loadAdmin();

  return { db, admin };
}

function ctx() {
  const c = als.getStore();

  if (!c) {
    throw new Error('Request context unavailable.');
  }

  return c;
}

async function save() {
  const c = ctx();

  await writeJsonBlob(DB_KEY, c.db);
}

async function saveAdmin() {
  const c = ctx();

  await writeJsonBlob(ADMIN_KEY, c.admin);
}

const SALON_TIMEZONE = 'Asia/Kolkata';

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SALON_TIMEZONE }).format(new Date());
}

function publicSite() {
  const { db } = ctx();

  return {
    settings: db.settings,
    menu: db.menu,
    content: db.content,
    stylists: (db.stylists || []).filter(
      s => s.visible && s.name !== 'Add name'
    ),
    gallery: (db.gallery || []).filter(g => g.visible),
    today: todayStr()
  };
}

function computeSlots(date) {
  const { db } = ctx();
  const S = db.settings;

  if (!validDate(date)) fail(400, 'Invalid date.');

  const day = new Date(date + 'T00:00:00Z').getUTCDay();

  if ((S.closedDays || []).includes(day)) {
    return { closed: true, reason: 'Closed that day.', slots: [] };
  }

  const [openH, openM] = S.open.split(':').map(Number);
  const [closeH, closeM] = S.close.split(':').map(Number);
  const openMin = openH * 60 + openM;
  const closeMin = closeH * 60 + closeM;
  const step = S.slotMinutes || 30;
  const capacity = S.capacity || 1;

  const bookedCounts = {};

  for (const b of db.bookings || []) {
    if (b.date === date && b.status !== 'cancelled') {
      bookedCounts[b.time] = (bookedCounts[b.time] || 0) + 1;
    }
  }

  const slots = [];

  for (let m = openMin; m < closeMin; m += step) {
    const time =
      String(Math.floor(m / 60)).padStart(2, '0') +
      ':' +
      String(m % 60).padStart(2, '0');

    slots.push({
      time,
      free: (bookedCounts[time] || 0) < capacity
    });
  }

  return { closed: false, slots };
}

function cleanPhone(value) {
  return String(value || '')
    .replace(/[^\d+]/g, '')
    .slice(0, 20);
}

function cleanString(value, max = 200) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value) {
  return /^\d{2}:\d{2}$/.test(value);
}

async function makeBooking(body, isAdminBooking = false) {
  const { db } = ctx();

  const name = cleanString(body.name, 100);
  const phone = cleanPhone(body.phone);
  const email = cleanString(body.email, 120);
  const date = cleanString(body.date, 10);
  const time = cleanString(body.time, 5);
  const note = cleanString(body.note, 300);
  const serviceIds = Array.isArray(body.services)
    ? body.services.map(x => cleanString(x, 100)).filter(Boolean)
    : [];

  if (!name) fail(400, 'Name is required.');
  if (!phone) fail(400, 'Phone number is required.');
  if (!validDate(date)) fail(400, 'Invalid date.');
  if (!validTime(time)) fail(400, 'Invalid time.');
  if (!serviceIds.length) fail(400, 'Choose at least one service.');

  if (!db.bookings) db.bookings = [];

  if (
    db.bookings.some(
      x =>
        x.phone === phone &&
        x.date === date &&
        x.time === time &&
        x.status !== 'cancelled'
    )
  ) {
    fail(
      409,
      'A booking already exists for this phone number at that time.'
    );
  }

  const allItems = (db.menu || []).flatMap(c => c.items || []);

  const services = serviceIds
    .map(id => allItems.find(i => String(i.id) === id))
    .filter(Boolean)
    .map(i => ({ id: i.id, name: i.name, price: i.price }));

  if (!services.length) fail(400, 'Selected services were not found.');

  const price = services.reduce(
    (sum, s) => sum + (Number(s.price) || 0),
    0
  );

  const id = crypto.randomUUID();

  const rec = {
    id,
    ref: id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    name,
    phone,
    email,
    date,
    time,
    note,
    services,
    price,
    status: isAdminBooking ? 'confirmed' : 'pending',
    createdAt: new Date().toISOString()
  };

  db.bookings.push(rec);

  await save();

  return rec;
}

function clientsList() {
  const { db } = ctx();
  const map = new Map();

  const get = (phone, name, email) => {
    if (!phone) return null;

    if (!map.has(phone)) {
      map.set(phone, {
        phone,
        name,
        email: email || '',
        bookings: 0,
        visits: 0,
        billed: 0,
        last: ''
      });
    }

    const c = map.get(phone);

    if (name) c.name = name;
    if (email && !c.email) c.email = email;

    return c;
  };

  (db.bookings || []).forEach(b => {
    const c = get(b.phone, b.name, b.email);
    if (c) {
      c.bookings++;
      c.last = c.last > b.date ? c.last : b.date;
    }
  });

  (db.invoices || [])
    .filter(i => !i.void)
    .forEach(i => {
      const c = get(i.client.phone, i.client.name, i.client.email);
      if (c) {
        c.visits++;
        c.billed = Math.round((c.billed + i.total) * 100) / 100;
        c.last = c.last > i.date ? c.last : i.date;
      }
    });

  return [...map.values()].sort((a, b) => (b.last || '').localeCompare(a.last || ''));
}

async function makeInvoice(body) {
  const { db } = ctx();

  const client = body.client || {};
  const name = cleanString(client.name, 80);

  if (name.length < 2) fail(400, 'Enter the client name.');

  const phone = client.phone ? cleanPhone(client.phone) : '';

  if (client.phone && !phone) fail(400, 'Enter a valid phone number.');

  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, 40)
    .map(i => ({
      name: cleanString(i.name, 120),
      qty: Math.max(1, Math.min(99, Math.round(Number(i.qty) || 1))),
      price: Math.round((Number(i.price) || 0) * 100) / 100
    }))
    .filter(i => i.name);

  if (!items.length) fail(400, 'Add at least one service.');

  const subtotal = Math.round(
    items.reduce((sum, i) => sum + i.qty * i.price, 0) * 100
  ) / 100;

  const discountType = body.discount && body.discount.type === 'percent' ? 'percent' : 'flat';
  const discountValueMax = discountType === 'percent' ? 100 : 1e6;
  const discountValue = Math.max(
    0,
    Math.min(discountValueMax, Number(body.discount && body.discount.value) || 0)
  );

  const discountAmt = Math.min(
    subtotal,
    discountType === 'percent'
      ? Math.round((subtotal * discountValue / 100) * 100) / 100
      : Math.round(discountValue * 100) / 100
  );

  if (!db.invoices) db.invoices = [];
  if (!db.counters) db.counters = { booking: 0, invoice: 0 };

  const inv = {
    id: crypto.randomUUID(),
    token: crypto.randomBytes(16).toString('hex'),
    no: 'SS-' + String(++db.counters.invoice).padStart(4, '0'),
    date: validDate(body.date) ? cleanString(body.date, 10) : todayStr(),
    client: { name, phone, email: cleanString(client.email, 120) },
    items,
    subtotal,
    discount: { type: discountType, value: discountValue },
    discountAmt,
    total: Math.round((subtotal - discountAmt) * 100) / 100,
    servedBy: cleanString(body.servedBy, 80),
    note: cleanString(body.note, 300),
    bookingId: cleanString(body.bookingId, 40),
    void: false,
    createdAt: new Date().toISOString()
  };

  db.invoices.push(inv);

  const linkedBooking = (db.bookings || []).find(b => b.id === inv.bookingId);
  if (linkedBooking) linkedBooking.status = 'completed';

  await save();

  return inv;
}

const EXPENSE_CATEGORIES = ['rent', 'salary', 'bills', 'purchase', 'other'];

async function makeExpense(body) {
  const { db } = ctx();

  const amount = Math.round((Number(body.amount) || 0) * 100) / 100;

  if (amount <= 0) fail(400, 'Enter an amount greater than zero.');

  if (!db.expenses) db.expenses = [];

  const exp = {
    id: crypto.randomUUID(),
    date: validDate(body.date) ? cleanString(body.date, 10) : todayStr(),
    category: EXPENSE_CATEGORIES.includes(body.category) ? body.category : 'other',
    note: cleanString(body.note, 200),
    amount,
    createdAt: new Date().toISOString()
  };

  db.expenses.push(exp);

  await save();

  return exp;
}

async function handle(req, res) {
  const method = String(req.method || 'GET').toUpperCase();

  let pathname = String(req.url || '/').split('?')[0];

  if (pathname.startsWith('/api')) {
    pathname = pathname.slice(4) || '/';
  }

  const query = new URL(req.url || '/', 'http://x').searchParams;

  const body =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH'
      ? await readBody(req)
      : {};

  if (method === 'GET' && pathname === '/site') {
    return json(res, 200, publicSite());
  }

  if (method === 'GET' && pathname === '/slots') {
    return json(res, 200, computeSlots(String(query.get('date') || '')));
  }

  if (method === 'GET' && pathname === '/admin/me') {
    return json(res, 200, {
      admin: isAdmin(req)
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/login'
  ) {
    const password = String(body.password || '');

    if (!password) {
      fail(400, 'Password is required.');
    }

    const admin = ctx().admin;

    const hash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    if (
      !admin ||
      !admin.passwordHash ||
      hash !== admin.passwordHash
    ) {
      fail(401, 'Invalid password.');
    }

    setSession(res, true);

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/logout'
  ) {
    clearSession(res);

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'POST' &&
    pathname === '/bookings'
  ) {
    const booking = await makeBooking(body);

    return json(res, 201, {
      ok: true,
      booking
    });
  }

  if (
    method === 'GET' &&
    pathname === '/bookings'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    return json(res, 200, {
      bookings: ctx().db.bookings || []
    });
  }

  if (
    method === 'GET' &&
    pathname === '/admin/data'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const { db } = ctx();

    return json(res, 200, {
      settings: db.settings,
      menu: db.menu,
      content: db.content,
      stylists: db.stylists || [],
      gallery: db.gallery || [],
      bookings: db.bookings || [],
      invoices: db.invoices || [],
      expenses: db.expenses || [],
      clients: clientsList(),
      today: todayStr()
    });
  }

  if (
    method === 'PUT' &&
    pathname === '/admin/settings'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    ctx().db.settings = body;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'PUT' &&
    pathname === '/admin/menu'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    if (!Array.isArray(body)) {
      fail(400, 'Menu must be an array.');
    }

    ctx().db.menu = body;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'PUT' &&
    pathname === '/admin/content'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      fail(400, 'Content must be an object.');
    }

    ctx().db.content = body;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'PUT' &&
    pathname === '/admin/stylists'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    if (!Array.isArray(body)) {
      fail(400, 'Stylists must be an array.');
    }

    ctx().db.stylists = body;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'PUT' &&
    pathname === '/admin/gallery'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    if (!Array.isArray(body)) {
      fail(400, 'Gallery must be an array.');
    }

    ctx().db.gallery = body;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'PATCH' &&
    pathname.startsWith('/admin/bookings/')
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const id = decodeURIComponent(
      pathname.slice('/admin/bookings/'.length)
    );

    const booking = (ctx().db.bookings || []).find(
      x => String(x.id) === id
    );

    if (!booking) {
      fail(404, 'Booking not found.');
    }

    if (body.status !== undefined) {
      const allowed = [
        'pending',
        'confirmed',
        'completed',
        'cancelled'
      ];

      if (!allowed.includes(body.status)) {
        fail(400, 'Invalid booking status.');
      }

      booking.status = body.status;
    }

    await save();

    return json(res, 200, {
      ok: true,
      booking
    });
  }

  if (
    method === 'DELETE' &&
    pathname.startsWith('/admin/bookings/')
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const id = decodeURIComponent(
      pathname.slice('/admin/bookings/'.length)
    );

    const before = ctx().db.bookings || [];

    ctx().db.bookings = before.filter(
      x => String(x.id) !== id
    );

    if (ctx().db.bookings.length === before.length) {
      fail(404, 'Booking not found.');
    }

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/bookings'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const booking = await makeBooking(body, true);

    return json(res, 201, {
      ok: true,
      booking
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/invoices'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const invoice = await makeInvoice(body);

    return json(res, 201, {
      ok: true,
      invoice
    });
  }

  if (
    method === 'DELETE' &&
    pathname.startsWith('/admin/invoices/')
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const id = decodeURIComponent(
      pathname.slice('/admin/invoices/'.length)
    );

    const invoice = (ctx().db.invoices || []).find(
      x => String(x.id) === id
    );

    if (!invoice) {
      fail(404, 'Invoice not found.');
    }

    invoice.void = true;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/expenses'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const expense = await makeExpense(body);

    return json(res, 201, {
      ok: true,
      expense
    });
  }

  if (
    method === 'PATCH' &&
    pathname.startsWith('/admin/expenses/')
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const id = decodeURIComponent(
      pathname.slice('/admin/expenses/'.length)
    );

    const expense = (ctx().db.expenses || []).find(
      x => String(x.id) === id
    );

    if (!expense) {
      fail(404, 'Expense not found.');
    }

    if (body.date !== undefined) {
      expense.date = validDate(body.date) ? cleanString(body.date, 10) : expense.date;
    }

    if (body.category !== undefined) {
      expense.category = EXPENSE_CATEGORIES.includes(body.category) ? body.category : expense.category;
    }

    if (body.note !== undefined) {
      expense.note = cleanString(body.note, 200);
    }

    if (body.amount !== undefined) {
      const amount = Math.round((Number(body.amount) || 0) * 100) / 100;

      if (amount <= 0) fail(400, 'Enter an amount greater than zero.');

      expense.amount = amount;
    }

    await save();

    return json(res, 200, {
      ok: true,
      expense
    });
  }

  if (
    method === 'DELETE' &&
    pathname.startsWith('/admin/expenses/')
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const id = decodeURIComponent(
      pathname.slice('/admin/expenses/'.length)
    );

    const before = ctx().db.expenses || [];

    ctx().db.expenses = before.filter(
      x => String(x.id) !== id
    );

    if (ctx().db.expenses.length === before.length) {
      fail(404, 'Expense not found.');
    }

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'GET' &&
    /^\/invoice\/[a-f0-9]{32}$/.test(pathname)
  ) {
    const token = pathname.slice('/invoice/'.length);

    const invoice = (ctx().db.invoices || []).find(
      x => x.token === token && !x.void
    );

    if (!invoice) {
      fail(404, 'Invoice not found.');
    }

    const { settings } = ctx().db;

    return json(res, 200, {
      invoice,
      salon: {
        salonName: settings.salonName,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        instagram: settings.instagram,
        invoiceFooter: settings.invoiceFooter
      }
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/upload'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const match = String(body.dataUrl || '').match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/
    );

    if (!match) {
      fail(400, 'Upload a JPG, PNG or WebP image.');
    }

    const buf = Buffer.from(match[2], 'base64');

    if (buf.length > 4 * 1024 * 1024) {
      fail(413, 'Image is larger than 4 MB.');
    }

    const magic = buf.subarray(0, 12);

    const validMagic =
      (match[1] === 'jpeg' && magic[0] === 0xff && magic[1] === 0xd8) ||
      (match[1] === 'png' && magic.subarray(1, 4).toString() === 'PNG') ||
      (match[1] === 'webp' &&
        magic.subarray(0, 4).toString() === 'RIFF' &&
        magic.subarray(8, 12).toString() === 'WEBP');

    if (!validMagic) {
      fail(400, 'That file is not a valid image.');
    }

    const name =
      crypto.randomBytes(8).toString('hex') +
      '.' +
      (match[1] === 'jpeg' ? 'jpg' : match[1]);

    const { put } = await blob();

    await put(`${UPLOAD_PREFIX}${name}`, buf, {
      access: 'private',
      contentType: `image/${match[1]}`,
      addRandomSuffix: false,
      allowOverwrite: false
    });

    return json(res, 201, {
      ok: true,
      src: `/uploads/${name}`
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/upload-audio'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const match = String(body.dataUrl || '').match(
      /^data:audio\/mpeg;base64,([A-Za-z0-9+/=]+)$/
    );

    if (!match) {
      fail(400, 'Upload an MP3 file.');
    }

    const buf = Buffer.from(match[1], 'base64');

    if (buf.length > 8 * 1024 * 1024) {
      fail(413, 'Audio is larger than 8 MB.');
    }

    const magic = buf.subarray(0, 3);

    const validMagic =
      (magic[0] === 0x49 && magic[1] === 0x44 && magic[2] === 0x33) ||
      (magic[0] === 0xff && (magic[1] & 0xe0) === 0xe0);

    if (!validMagic) {
      fail(400, 'That file is not a valid MP3.');
    }

    const name = crypto.randomBytes(8).toString('hex') + '.mp3';

    const { put } = await blob();

    await put(`${UPLOAD_PREFIX}${name}`, buf, {
      access: 'private',
      contentType: 'audio/mpeg',
      addRandomSuffix: false,
      allowOverwrite: false
    });

    return json(res, 201, {
      ok: true,
      src: `/uploads/${name}`
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/password'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const current = String(body.current || '');
    const next = String(body.next || '');

    const admin = ctx().admin;

    const currentHash = crypto
      .createHash('sha256')
      .update(current)
      .digest('hex');

    if (!admin || !admin.passwordHash || currentHash !== admin.passwordHash) {
      fail(400, 'Current password is wrong.');
    }

    if (next.length < 8) {
      fail(400, 'New password must be at least 8 characters.');
    }

    admin.passwordHash = crypto
      .createHash('sha256')
      .update(next)
      .digest('hex');

    await saveAdmin();

    setSession(res, true);

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'GET' &&
    pathname === '/admin/export'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    return json(res, 200, ctx().db);
  }

  if (
    method === 'POST' &&
    pathname === '/admin/clear-history'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const { db } = ctx();

    db.bookings = [];
    db.invoices = [];
    db.expenses = [];
    db.counters = { booking: 0, invoice: 0 };

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'POST' &&
    pathname === '/admin/reset'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const fresh = makeSeed();

    const c = ctx();
    c.db = fresh;

    await save();

    return json(res, 200, {
      ok: true
    });
  }

  if (
    method === 'GET' &&
    pathname.startsWith('/uploads/')
  ) {
    const name = pathname.slice('/uploads/'.length);

    if (!name || name.includes('..')) {
      fail(400, 'Invalid upload name.');
    }

    const { get } = await blob();

    const r = await get(
      `${UPLOAD_PREFIX}${name}`,
      {
        access: 'private',
        useCache: false
      }
    );

    if (!r || !r.stream) {
      fail(404, 'Upload not found.');
    }

    if (r.contentType) {
      res.setHeader('Content-Type', r.contentType);
    }

    if (r.contentLength) {
      res.setHeader('Content-Length', String(r.contentLength));
    }

    return Readable.fromWeb(r.stream).pipe(res);
  }

  fail(404, 'Not found.');
}

module.exports = async function handler(req, res) {
  try {
    const store = await getStore();

    return await als.run(store, () => handle(req, res));
  } catch (e) {
    const status = Number(e?.status) || 500;

    if (res.headersSent) {
      res.end();
      return;
    }

    return json(res, status, {
      error:
        status >= 500
          ? 'Something went wrong. Please try again.'
          : String(e.message || 'Request failed.')
    });
  }
};
