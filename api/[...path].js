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
      if (body.length > 2_000_000) {
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

function isConflict(e) {
  const name = String(e?.name || e?.constructor?.name || '');
  const msg = String(e?.message || '');

  return (
    /Precondition|AlreadyExists/i.test(name) ||
    /Precondition|AlreadyExists|condition|etag|ETag|conflict/i.test(msg)
  );
}

function conflictErr() {
  const e = new Error('Someone else just saved changes. Please try again.');
  e.status = 409;
  e.conflict = true;
  return e;
}

async function readJsonBlob(key) {
  const { get } = await blob();

  const r = await get(key, {
    access: 'private',
    useCache: false
  });

  if (!r || !r.stream) return null;

  const text = await new Response(r.stream).text();

  return {
    data: JSON.parse(text),
    etag: r.etag
  };
}

async function writeJsonBlob(key, data, etag, forceOverwrite = false) {
  const { put } = await blob();

  try {
    const options = {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false
    };

    if (forceOverwrite) {
      options.allowOverwrite = true;
    } else if (etag) {
      options.allowOverwrite = true;
      options.ifMatch = etag;
    } else {
      options.allowOverwrite = false;
    }

    await put(key, JSON.stringify(data), options);
  } catch (e) {
    if (isConflict(e)) throw conflictErr();
    throw e;
  }
}

async function loadDb() {
  const found = await readJsonBlob(DB_KEY);

  if (found) return found;

  const db = makeSeed();

  await writeJsonBlob(DB_KEY, db);

  const created = await readJsonBlob(DB_KEY);

  return created || { data: db, etag: null };
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

  const created = await readJsonBlob(ADMIN_KEY);

  return created || { data, etag: null };
}

async function getStore() {
  const existing = als.getStore();

  if (existing) return existing;

  const db = await loadDb();
  const admin = await loadAdmin();

  const store = {
    db: db.data,
    etag: db.etag,
    admin: admin.data,
    adminEtag: admin.etag
  };

  return store;
}

function ctx() {
  const c = als.getStore();

  if (!c) {
    throw new Error('Request context unavailable.');
  }

  return c;
}

async function save(forceOverwrite = false) {
  const c = ctx();

  await writeJsonBlob(
    DB_KEY,
    c.db,
    c.etag,
    forceOverwrite
  );
}

async function saveAdmin() {
  const c = ctx();

  await writeJsonBlob(
    ADMIN_KEY,
    c.admin,
    c.adminEtag
  );
}

function publicSite() {
  const { db } = ctx();

  return {
    settings: db.settings,
    menu: db.menu,
    categories: db.categories,
    stylists: db.stylists || [],
    gallery: db.gallery || [],
    today: new Date().toISOString().slice(0, 10)
  };
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

function makeBooking(body) {
  const { db } = ctx();

  const name = cleanString(body.name, 100);
  const phone = cleanPhone(body.phone);
  const date = cleanString(body.date, 10);
  const time = cleanString(body.time, 5);
  const serviceId = cleanString(body.serviceId, 100);
  const stylistId = cleanString(body.stylistId, 100);

  if (!name) fail(400, 'Name is required.');
  if (!phone) fail(400, 'Phone number is required.');
  if (!validDate(date)) fail(400, 'Invalid date.');
  if (!validTime(time)) fail(400, 'Invalid time.');
  if (!serviceId) fail(400, 'Service is required.');

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

  const service = (db.menu || []).find(
    x => String(x.id) === serviceId
  );

  if (!service) fail(400, 'Selected service was not found.');

  const stylist =
    stylistId &&
    (db.stylists || []).find(
      x => String(x.id) === stylistId
    );

  const rec = {
    id: crypto.randomUUID(),
    name,
    phone,
    date,
    time,
    serviceId,
    serviceName: service.name,
    price: service.price,
    stylistId: stylist ? stylist.id : null,
    stylistName: stylist ? stylist.name : null,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  db.bookings.push(rec);

  await save(true);

  return rec;
}

async function handle(req, res) {
  const method = String(req.method || 'GET').toUpperCase();

  let pathname = String(req.url || '/').split('?')[0];

  if (pathname.startsWith('/api')) {
    pathname = pathname.slice(4) || '/';
  }

  const body =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH'
      ? await readBody(req)
      : {};

  if (method === 'GET' && pathname === '/site') {
    return json(res, 200, publicSite());
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
    const booking = makeBooking(body);

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
      categories: db.categories,
      stylists: db.stylists || [],
      gallery: db.gallery || [],
      bookings: db.bookings || []
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
    pathname === '/admin/categories'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    if (!Array.isArray(body)) {
      fail(400, 'Categories must be an array.');
    }

    ctx().db.categories = body;

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
    pathname === '/admin/reset'
  ) {
    if (!isAdmin(req)) {
      fail(401, 'Unauthorized.');
    }

    const fresh = makeSeed();

    const c = ctx();
    c.db = fresh;

    await save(true);

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
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const store = await getStore();

      return await als.run(store, () =>
        handle(req, res)
      );
    } catch (e) {
      if (e && e.conflict && attempt < 3) {
        continue;
      }

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
  }

  if (!res.headersSent) {
    return json(res, 409, {
      error:
        'Someone else just saved changes. Please try again.'
    });
  }
};
