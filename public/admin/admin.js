(function () {
  'use strict';
  let D = null, current = 'dashboard', B = null;
  const view = () => $('#view');

  /* ---------- plumbing ---------- */
  async function api(method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401 && url !== '/api/admin/login') showLogin(); throw new Error(d.error || 'Something went wrong'); }
    return d;
  }
  let tt;
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'a-toast show' + (err ? ' err' : ''); clearTimeout(tt); tt = setTimeout(() => { t.className = 'a-toast'; }, 3400); }
  const fail = e => toast(e.message || 'Something went wrong', true);
  const load = async () => { D = await api('GET', '/api/admin/data'); if (!D.today) D.today = new Date().toLocaleDateString('en-CA'); renderNav(); };

  function modal(title, body, actions) {
    return new Promise(res => {
      const d = h('dialog', { class: 'a-dialog' }, h('h2', { text: title }), body,
        h('div', { class: 'a-dialog-actions' }, (actions || []).map(a => a.href
          ? h('a', { class: 'btn ' + (a.cls || ''), href: a.href, target: '_blank', rel: 'noopener' }, a.label)
          : h('button', { class: 'btn ' + (a.cls || ''), type: 'button', onclick: async () => { if (a.fn && (await a.fn()) === false) return; d.close(a.value || 'ok'); } }, a.label))));
      d.addEventListener('close', () => { d.remove(); res(d.returnValue); });
      document.body.append(d); d.showModal();
    });
  }
  const confirmBox = (msg, label) => modal('Are you sure?', h('p', { text: msg }), [{ label: 'Cancel', cls: 'btn-alt', value: 'no' }, { label, cls: 'btn-danger', value: 'yes' }]).then(v => v === 'yes');

  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const cmpWhen = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
  const menuIndex = () => new Map(D.menu.flatMap(c => c.items.map(i => [i.id, i])));
  const who = g => g === 'female' ? 'Women' : g === 'male' ? 'Men' : 'Women and men';

  /* field builders bound to an object */
  const inp = (o, k, a) => h('input', { type: 'text', value: o[k] == null ? '' : o[k], oninput: e => { o[k] = e.target.value; }, ...a });
  const area = (o, k, a) => h('textarea', { value: o[k] || '', oninput: e => { o[k] = e.target.value; }, ...a });
  const num = (o, k, a) => h('input', { type: 'number', min: 0, step: 'any', value: o[k] == null ? '' : o[k], oninput: e => { o[k] = e.target.value === '' ? null : +e.target.value; }, ...a });
  const chk = (o, k, label) => h('label', { class: 'a-check' }, h('input', { type: 'checkbox', checked: !!o[k], onchange: e => { o[k] = e.target.checked; } }), label);
  const fld = (label, control, id) => h('div', { class: 'field' }, h('label', { for: id }, label), control);
  const emptyNote = (text, d) => h('div', { class: 'a-empty' }, doodle(d || 'sparkle'), h('span', { text }));
  const setActions = (...els) => $('#viewActions').replaceChildren(...els.filter(Boolean));
  const btn = (label, fn, cls) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }, label);
  const sticky = (...els) => h('div', { class: 'a-sticky' }, ...els);

  /* ---------- login / boot ---------- */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#loginError').textContent = '';
    try { await api('POST', '/api/admin/login', { password: $('#pw').value }); $('#pw').value = ''; await boot(); }
    catch (ex) { $('#loginError').textContent = ex.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('POST', '/api/admin/logout', {}).catch(() => {}); D = null; showLogin(); });

  async function boot() {
    const me = await fetch('/api/admin/me').then(r => r.json()).catch(() => ({}));
    if (!me.admin) return showLogin();
    await load();
    $('#login').hidden = true; $('#app').hidden = false;
    go(location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'dashboard');
  }

  const TITLES = { dashboard: 'Today', bookings: 'Bookings', billing: 'Billing', clients: 'Clients', menu: 'Menu and prices', stylists: 'Hairstylists', gallery: 'Gallery', content: 'Website text', settings: 'Settings', expenses: 'Expenses', analytics: 'Analytics' };
  const ICONS = { dashboard: 'grid', bookings: 'calendar', billing: 'receipt', clients: 'users', menu: 'list', stylists: 'cut', gallery: 'pics', content: 'doc', settings: 'gear', expenses: 'wallet', analytics: 'chart' };
  const PRIMARY = ['dashboard', 'bookings', 'billing', 'clients'];
  const SECONDARY = Object.keys(TITLES).filter(k => !PRIMARY.includes(k));

  function renderNav() {
    const pending = D.bookings.filter(b => b.status === 'pending').length;
    const items = Object.entries(TITLES);
    $('#rail').replaceChildren(...items.map(([k, t]) => h('button', { type: 'button', title: t, 'aria-label': t, 'aria-current': k === current ? 'page' : null, onclick: () => go(k) }, icon(ICONS[k]))));
    $('#sideNav').replaceChildren(...items.map(([k, t]) => h('button', { type: 'button', 'aria-current': k === current ? 'page' : null, onclick: () => go(k) },
      icon(ICONS[k]), h('span', { class: 'a-nav-label', text: t }), k === 'bookings' && pending ? h('span', { class: 'badge', text: pending }) : null)));

    const inMore = SECONDARY.includes(current);
    $('#tabbar').replaceChildren(
      ...PRIMARY.map(k => h('button', { type: 'button', 'aria-current': k === current ? 'page' : null, onclick: () => go(k) },
        icon(ICONS[k]), h('span', { text: TITLES[k] }), k === 'bookings' && pending ? h('span', { class: 'a-tab-dot' }) : null)),
      h('button', { type: 'button', 'aria-current': inMore ? 'page' : null, onclick: openMore }, icon('dots'), h('span', { text: 'More' })));
  }

  function openMore() {
    const pending = D.bookings.filter(b => b.status === 'pending').length;
    const d = h('dialog', { class: 'a-dialog' },
      h('button', { type: 'button', class: 'a-dialog-close', 'aria-label': 'Close', onclick: () => d.close() }, icon('close')),
      h('h2', { text: 'More' }),
      h('div', { class: 'a-more-list' },
        SECONDARY.map(k => h('button', { type: 'button', 'aria-current': k === current ? 'page' : null, onclick: () => { d.close(); go(k); } },
          icon(ICONS[k]), TITLES[k], k === 'bookings' && pending ? h('span', { class: 'badge', text: pending }) : null)),
        h('div', { class: 'a-more-sep' }),
        h('a', { href: '/', target: '_blank', rel: 'noopener' }, icon('doc'), 'View website'),
        h('button', { type: 'button', onclick: () => { d.close(); $('#logout').click(); } }, icon('logout'), 'Sign out')));
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  }
  function go(v) {
    current = v; location.hash = v;
    renderNav(); $('#viewTitle').textContent = TITLES[v]; setActions();
    view().replaceChildren(); VIEWS[v](); window.scrollTo(0, 0);
  }
  const rerender = () => { const y = scrollY; go(current); scrollTo(0, y); };

  /* ---------- messages ---------- */
  function bookingMessage(b) {
    const svc = b.services.length ? ' Services: ' + b.services.map(s => s.name).join(', ') + '.' : '';
    return b.status === 'confirmed'
      ? `Hi ${b.name}, your appointment at ${D.settings.salonName} is confirmed for ${fmtDate(b.date)} at ${fmt12(b.time)}.${svc} See you soon.`
      : `Hi ${b.name}, we received your appointment request at ${D.settings.salonName} for ${fmtDate(b.date)} at ${fmt12(b.time)}.${svc} We will confirm shortly.`;
  }
  function invoiceMessage(inv) {
    const lines = inv.items.map(i => `✨ ${i.name}${i.qty > 1 ? ' x' + i.qty : ''}: ${inr(i.qty * i.price)}`);
    const feedback = D.settings.whatsapp ? waLink(D.settings.whatsapp, `Hi ${D.settings.salonName}, sharing my feedback on my recent visit: `) : null;
    return [
      `Hi ${inv.client.name}, thank you for visiting ${D.settings.salonName}! \u{1F49B}`, '',
      `\u{1F9FE} *Invoice ${inv.no}* · ${fmtDate(inv.date)}`, ...lines,
      inv.discountAmt > 0 ? `\u{1F3F7}️ Discount: -${inr(inv.discountAmt)}` : null,
      `\u{1F4B0} *Total: ${inr(inv.total)}*`, '',
      `\u{1F4C4} Invoice: ${location.origin}/i/${inv.token}`,
      feedback ? `⭐ Loved your visit? Tap to share feedback: ${feedback}` : null,
    ].filter(x => x !== null).join('\n');
  }
  const waBtn = (label, phone, text, cls) => phone
    ? h('a', { class: 'btn btn-sm btn-alt ' + (cls || ''), href: waLink(phone, text), target: '_blank', rel: 'noopener' }, label)
    : h('span', { class: 'muted', text: 'No phone' });

  /* ---------- bookings ---------- */
  const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
  const STATUS_LABEL = { pending: 'Waiting', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
  function bookingTable(list) {
    if (!list.length) return emptyNote('No bookings here yet.', 'mirror');
    return h('div', { class: 'a-scroll' }, h('table', { class: 'a-table' },
      h('thead', {}, h('tr', {}, ['When', 'Client', 'Services', 'Status', ''].map(t => h('th', { text: t })))),
      h('tbody', {}, list.map(b => h('tr', {},
        h('td', { 'data-label': 'When' }, h('span', {}, h('b', { text: fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' }) }), ' · ' + fmt12(b.time) + ' · ', h('span', { class: 'muted', text: b.ref }))),
        h('td', { 'data-label': 'Client' }, h('b', { text: b.name }), h('br'), h('span', { class: 'muted', text: b.phone + (b.email ? ' · ' + b.email : '') }), b.note ? [h('br'), h('span', { class: 'muted', text: 'Note: ' + b.note })] : null),
        h('td', { 'data-label': 'Services', text: b.services.map(s => s.name).join(', ') || 'Not chosen' }),
        h('td', { 'data-label': 'Status' }, h('select', { class: 'a-select', 'aria-label': 'Status for ' + b.name, onchange: async e => { try { await api('PATCH', '/api/admin/bookings/' + b.id, { status: e.target.value }); await load(); rerender(); toast('Status updated'); } catch (ex) { fail(ex); } } },
          STATUSES.map(s => h('option', { value: s, selected: s === b.status }, STATUS_LABEL[s])))),
        h('td', { class: 'a-td-actions' }, h('div', { class: 'a-row-actions' },
          waBtn('WhatsApp', b.phone, bookingMessage(b)),
          btn('Create bill', () => { B = billFromBooking(b); go('billing'); }, 'btn-sm btn-alt'),
          btn('Delete', async () => { if (await confirmBox('Delete booking ' + b.ref + ' for ' + b.name + '?', 'Delete')) { try { await api('DELETE', '/api/admin/bookings/' + b.id); await load(); rerender(); toast('Booking deleted'); } catch (ex) { fail(ex); } } }, 'btn-sm btn-danger')))))))
    );
  }

  function addBookingDialog() {
    const F = { name: '', phone: '', date: D.today, time: '', note: '' }, picked = new Set();
    const timeSel = h('select', { id: 'abTime', onchange: e => { F.time = e.target.value; } });
    async function slots() {
      timeSel.replaceChildren(h('option', { value: '', text: 'Loading...' }));
      try {
        const d = await fetch('/api/slots?date=' + F.date).then(r => r.json());
        if (d.closed || !d.slots) { timeSel.replaceChildren(h('option', { value: '', text: d.reason || d.error || 'No times' })); F.time = ''; return; }
        timeSel.replaceChildren(h('option', { value: '', text: 'Choose a time' }), ...d.slots.map(s => h('option', { value: s.time, text: fmt12(s.time) + (s.free ? '' : ' (full)') })));
      } catch { timeSel.replaceChildren(h('option', { value: '', text: 'Could not load' })); }
    }
    const list = h('div', { class: 'a-scroll', style: 'max-height:220px;border:1px solid var(--line);padding:8px 12px' },
      D.menu.flatMap(c => [h('div', { class: 'muted', style: 'font-size:13px;margin-top:8px', text: c.name + ' (' + who(c.gender) + ')' }),
        ...c.items.filter(i => i.active).map(i => h('label', { class: 'a-check', style: 'display:flex;padding:3px 0' }, h('input', { type: 'checkbox', onchange: e => { e.target.checked ? picked.add(i.id) : picked.delete(i.id); } }), i.name))]));
    const body = h('div', {}, fld('Client name', inp(F, 'name', { id: 'abName' }), 'abName'), fld('Phone', inp(F, 'phone', { id: 'abPhone', type: 'tel' }), 'abPhone'),
      fld('Date', h('input', { type: 'date', id: 'abDate', min: D.today, value: F.date, onchange: e => { F.date = e.target.value; slots(); } }), 'abDate'), fld('Time', timeSel, 'abTime'),
      h('div', { class: 'field' }, h('label', { text: 'Services' }), list), fld('Note', inp(F, 'note', { id: 'abNote' }), 'abNote'));
    slots();
    modal('Add booking', body, [{ label: 'Cancel', cls: 'btn-alt', value: 'no' }, {
      label: 'Save booking', fn: async () => { try { await api('POST', '/api/admin/bookings', { ...F, services: [...picked] }); await load(); rerender(); toast('Booking added'); } catch (ex) { fail(ex); return false; } }
    }]);
  }

  function viewBookings() {
    setActions(btn('Add booking', addBookingDialog));
    let f = 'upcoming';
    const box = h('div', {});
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter bookings', style: 'margin-bottom:20px' });
    const filters = { upcoming: 'Upcoming', pending: 'Waiting', past: 'Past', cancelled: 'Cancelled', all: 'All' };
    const draw = () => {
      seg.replaceChildren(...Object.entries(filters).map(([k, t]) => h('button', { type: 'button', 'aria-pressed': k === f, onclick: () => { f = k; draw(); } }, t)));
      const t = D.today; let l = D.bookings.slice();
      if (f === 'upcoming') l = l.filter(b => b.date >= t && b.status !== 'cancelled' && b.status !== 'completed').sort(cmpWhen);
      else if (f === 'pending') l = l.filter(b => b.status === 'pending').sort(cmpWhen);
      else if (f === 'past') l = l.filter(b => b.date < t && b.status !== 'cancelled').sort((a, b) => cmpWhen(b, a));
      else if (f === 'cancelled') l = l.filter(b => b.status === 'cancelled').sort((a, b) => cmpWhen(b, a));
      else l.sort((a, b) => cmpWhen(b, a));
      box.replaceChildren(bookingTable(l));
    };
    draw();
    view().replaceChildren(seg, box);
  }

  /* ---------- dashboard ---------- */
  function viewDashboard() {
    setActions(btn('New bill', () => { B = newBill(); go('billing'); }), btn('Add booking', addBookingDialog, 'btn-alt'));
    const t = D.today, live = D.bookings.filter(b => b.status !== 'cancelled');
    const invM = D.invoices.filter(i => !i.void && i.date.startsWith(t.slice(0, 7)));
    const stats = [[live.filter(b => b.date === t).length, 'Bookings today'], [D.bookings.filter(b => b.status === 'pending').length, 'Waiting for confirmation'],
      [invM.length, 'Bills this month'], [inr(invM.reduce((a, i) => a + i.total, 0)), 'Billed this month']];
    const up = live.filter(b => b.date >= t && b.status !== 'completed').sort(cmpWhen).slice(0, 12);
    view().replaceChildren(
      h('div', { class: 'a-stats' }, stats.map(([n, l]) => h('div', { class: 'a-stat' }, h('b', { text: n }), h('span', { text: l })))),
      h('div', { class: 'a-section' }, h('h2', { class: 'a-h2', text: 'Coming up' }), bookingTable(up)));
  }

  /* ---------- billing ---------- */
  const newBill = pre => ({ client: { name: '', phone: '', email: '' }, date: D.today, servedBy: '', items: [], discType: 'flat', discVal: 0, note: '', bookingId: '', ...pre });
  function billFromBooking(b) {
    const idx = menuIndex();
    return newBill({ client: { name: b.name, phone: b.phone, email: b.email || '' }, date: b.date < D.today ? D.today : b.date, bookingId: b.id,
      items: b.services.map(s => { const m = idx.get(s.id); return { name: s.name, qty: 1, price: m ? m.price : 0 }; }) });
  }
  const calc = b => {
    const sub = b.items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0);
    let d = b.discType === 'percent' ? sub * Math.min(100, +b.discVal || 0) / 100 : (+b.discVal || 0);
    d = Math.min(sub, Math.round(d * 100) / 100);
    return { sub, d, total: Math.round((sub - d) * 100) / 100 };
  };

  function viewBilling() {
    if (!B) B = newBill();
    const clientList = h('datalist', { id: 'clientList' }, D.clients.map(c => h('option', { value: c.phone, label: c.name })));
    const stylistList = h('datalist', { id: 'stylistList' }, D.stylists.filter(s => s.name !== 'Add name').map(s => h('option', { value: s.name })));
    const lines = h('tbody', {});
    const totals = h('div', { class: 'a-totals' });
    const drawTotals = () => {
      const c = calc(B);
      totals.replaceChildren(h('div', {}, h('span', { text: 'Subtotal' }), h('span', { text: inr(c.sub) })),
        c.d > 0 ? h('div', {}, h('span', { text: 'Discount' }), h('span', { text: '-' + inr(c.d) })) : null,
        h('div', { class: 'grand' }, h('span', { text: 'Total' }), h('span', { text: inr(c.total) })));
    };
    const drawLines = () => {
      if (!B.items.length) { lines.replaceChildren(h('tr', {}, h('td', { colspan: 5, class: 'muted', text: 'Add services from the list above.' }))); drawTotals(); return; }
      lines.replaceChildren(...B.items.map((it, i) => {
        const amt = h('td', { class: 'r', style: 'white-space:nowrap' }, inr(it.qty * it.price));
        const upd = () => { amt.textContent = inr((+it.qty || 0) * (+it.price || 0)); drawTotals(); };
        return h('tr', {}, h('td', {}, h('input', { type: 'text', value: it.name, 'aria-label': 'Service name', oninput: e => { it.name = e.target.value; } })),
          h('td', {}, h('input', { class: 'q', type: 'number', min: 1, max: 99, value: it.qty, 'aria-label': 'Quantity', oninput: e => { it.qty = +e.target.value; upd(); } })),
          h('td', {}, h('input', { class: 'p', type: 'number', min: 0, step: 'any', value: it.price, 'aria-label': 'Price', oninput: e => { it.price = +e.target.value; upd(); } })),
          amt, h('td', {}, btn('Remove', () => { B.items.splice(i, 1); drawLines(); }, 'btn-sm btn-alt')));
      }));
      drawTotals();
    };
    const addSel = h('select', { id: 'addSvc', onchange: e => {
      const it = menuIndex().get(e.target.value); if (it) { B.items.push({ name: it.name, qty: 1, price: it.price }); drawLines(); } e.target.value = '';
    } }, h('option', { value: '', text: 'Add a service...' }),
      D.menu.map(c => h('optgroup', { label: c.name + ' (' + who(c.gender) + ')' }, c.items.filter(i => i.active).map(i => h('option', { value: i.id, text: i.name + '  ' + inr(i.price) })))));
    const nameEl = inp(B.client, 'name', { id: 'bName', autocomplete: 'off' });
    const phoneEl = inp(B.client, 'phone', { id: 'bPhone', type: 'tel', list: 'clientList', autocomplete: 'off',
      onchange: e => { const c = D.clients.find(x => x.phone === e.target.value.replace(/\D/g, '').slice(-10)) || D.clients.find(x => x.phone === e.target.value); if (c) { B.client.name = c.name; B.client.email = c.email || ''; nameEl.value = c.name; emailEl.value = B.client.email; B.client.phone = c.phone; phoneEl.value = c.phone; } } });
    const emailEl = inp(B.client, 'email', { id: 'bEmail', type: 'email' });
    const discRow = h('div', { class: 'row2' },
      fld('Discount type', h('select', { id: 'bDT', onchange: e => { B.discType = e.target.value; drawTotals(); } }, h('option', { value: 'flat', selected: B.discType === 'flat', text: 'Amount (rupees)' }), h('option', { value: 'percent', selected: B.discType === 'percent', text: 'Percent' })), 'bDT'),
      fld('Discount', h('input', { id: 'bDV', type: 'number', min: 0, step: 'any', value: B.discVal, oninput: e => { B.discVal = +e.target.value; drawTotals(); } }), 'bDV'));
    const genBtn = btn('Generate invoice', async () => {
      genBtn.disabled = true;
      try {
        const r = await api('POST', '/api/admin/invoices', { client: B.client, date: B.date, servedBy: B.servedBy, items: B.items, discount: { type: B.discType, value: B.discVal }, note: B.note, bookingId: B.bookingId });
        await load(); B = newBill(); invoiceDialog(r.invoice); rerender();
      } catch (ex) { fail(ex); } finally { genBtn.disabled = false; }
    });

    const form = h('div', {},
      h('h2', { class: 'a-h2', text: 'New bill' }), clientList, stylistList,
      h('div', { class: 'row2' }, fld('Client phone', phoneEl, 'bPhone'), fld('Client name', nameEl, 'bName')),
      h('div', { class: 'row2' }, fld('Email (optional)', emailEl, 'bEmail'), fld('Bill date', h('input', { type: 'date', id: 'bDate', value: B.date, onchange: e => { B.date = e.target.value; } }), 'bDate')),
      fld('Served by (optional)', inp(B, 'servedBy', { id: 'bBy', list: 'stylistList' }), 'bBy'),
      fld('Services used', addSel, 'addSvc'),
      h('div', { class: 'a-scroll' }, h('table', { class: 'a-bill-lines' }, lines)),
      btn('Add custom item', () => { B.items.push({ name: '', qty: 1, price: 0 }); drawLines(); }, 'btn-sm btn-alt'),
      h('div', { style: 'height:20px' }), discRow, fld('Note on invoice (optional)', inp(B, 'note', { id: 'bNote' }), 'bNote'),
      totals, h('div', { style: 'margin-top:20px' }, genBtn),
      h('p', { class: 'a-note', text: 'Payment is taken at the counter by QR or cash. Invoices show what was billed only.' }));
    drawLines();

    /* history */
    const hist = h('div', {}), q = h('input', { class: 'a-search', type: 'search', placeholder: 'Search by name, phone or number', 'aria-label': 'Search invoices', oninput: drawHist });
    function drawHist() {
      const s = q.value.trim().toLowerCase();
      const l = D.invoices.slice().reverse().filter(i => !s || (i.client.name + i.client.phone + i.no).toLowerCase().includes(s)).slice(0, 60);
      hist.replaceChildren(l.length ? h('div', { class: 'a-scroll' }, h('table', { class: 'a-table' }, h('thead', {}, h('tr', {}, ['Invoice', 'Client', 'Total', ''].map(t => h('th', { text: t })))),
        h('tbody', {}, l.map(i => h('tr', { style: i.void ? 'opacity:.5' : '' },
          h('td', { 'data-label': 'Invoice' }, h('span', {}, h('b', { text: i.no }), ' · ', h('span', { class: 'muted', text: fmtDate(i.date, { day: 'numeric', month: 'short', year: 'numeric' }) }))),
          h('td', { 'data-label': 'Client' }, h('span', {}, i.client.name, ' · ', h('span', { class: 'muted', text: i.client.phone }))),
          h('td', { 'data-label': 'Total', text: i.void ? 'Void' : inr(i.total) }),
          h('td', { class: 'a-td-actions' }, i.void ? null : h('div', { class: 'a-row-actions' }, waBtn('Send', i.client.phone, invoiceMessage(i)),
            h('a', { class: 'btn btn-sm btn-alt', href: '/i/' + i.token, target: '_blank', rel: 'noopener' }, 'Open'),
            btn('Void', async () => { if (await confirmBox('Void invoice ' + i.no + '? The customer link will stop working.', 'Void invoice')) { try { await api('DELETE', '/api/admin/invoices/' + i.id); await load(); rerender(); toast('Invoice voided'); } catch (ex) { fail(ex); } } }, 'btn-sm btn-danger')))))))) : emptyNote('No invoices yet.', 'scissors'));
    }
    drawHist();
    view().replaceChildren(h('div', { class: 'a-cols' }, form, h('div', {}, h('h2', { class: 'a-h2', text: 'Invoices' }), q, h('div', { style: 'height:12px' }), hist)));
  }

  function invoiceDialog(inv) {
    const link = location.origin + '/i/' + inv.token;
    const body = h('div', {}, h('p', {}, h('b', { text: inv.no }), ' for ' + inv.client.name + ': ', h('b', { text: inr(inv.total) })),
      inv.client.phone ? h('p', { class: 'a-note', text: 'The WhatsApp message includes the itemised bill and a link to the invoice.' })
        : h('p', { class: 'a-note', text: 'No phone number on this bill, so WhatsApp is not available. You can copy the link instead.' }));
    modal('Invoice created', body, [
      inv.client.phone ? { label: 'Send on WhatsApp', href: waLink(inv.client.phone, invoiceMessage(inv)) } : null,
      { label: 'Open invoice', cls: 'btn-alt', href: '/i/' + inv.token },
      { label: 'Copy link', cls: 'btn-alt', value: 'copy', fn: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast(link); } return false; } },
      { label: 'Done', cls: 'btn-alt', value: 'done' }].filter(Boolean));
  }

  /* ---------- expenses ---------- */
  const EXPENSE_CATS = { rent: 'Rent', salary: 'Salary', bills: 'Bills', purchase: 'Product purchase', other: 'Other' };
  function expenseTable(list) {
    if (!list.length) return emptyNote('No expenses logged yet.', 'receipt');
    const total = list.reduce((a, e) => a + e.amount, 0);
    const table = h('table', { class: 'a-table' },
      h('thead', {}, h('tr', {}, ['Date', 'Category', 'Note', 'Amount', ''].map(t => h('th', { text: t })))),
      h('tbody', {}, list.map(e => h('tr', {},
        h('td', { 'data-label': 'Date', text: fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' }) }),
        h('td', { 'data-label': 'Category', text: EXPENSE_CATS[e.category] || 'Other' }),
        h('td', { 'data-label': 'Note', text: e.note || '' }),
        h('td', { class: 'r', 'data-label': 'Amount', text: inr(e.amount) }),
        h('td', { class: 'a-td-actions' }, btn('Delete', async () => { if (await confirmBox('Delete this expense of ' + inr(e.amount) + '?', 'Delete')) { try { await api('DELETE', '/api/admin/expenses/' + e.id); await load(); rerender(); toast('Expense deleted'); } catch (ex) { fail(ex); } } }, 'btn-sm btn-danger'))))));
    return h('div', {}, h('div', { class: 'a-scroll' }, table),
      h('p', { class: 'a-note', style: 'text-align:right;margin-top:8px', text: 'Total: ' + inr(total) }));
  }
  function addExpenseDialog() {
    const F = { date: D.today, category: 'other', note: '', amount: null };
    const body = h('div', {},
      fld('Date', h('input', { type: 'date', id: 'exDate', value: F.date, max: D.today, onchange: e => { F.date = e.target.value; } }), 'exDate'),
      fld('Category', h('select', { id: 'exCat', onchange: e => { F.category = e.target.value; } }, Object.entries(EXPENSE_CATS).map(([k, t]) => h('option', { value: k, selected: k === F.category, text: t }))), 'exCat'),
      fld('Note (optional)', inp(F, 'note', { id: 'exNote', placeholder: 'What was this for?' }), 'exNote'),
      fld('Amount', num(F, 'amount', { id: 'exAmt', min: 0 }), 'exAmt'));
    modal('Add expense', body, [{ label: 'Cancel', cls: 'btn-alt', value: 'no' }, {
      label: 'Save expense', fn: async () => {
        if (!F.amount || F.amount <= 0) { toast('Enter an amount', true); return false; }
        try { await api('POST', '/api/admin/expenses', F); await load(); rerender(); toast('Expense added'); } catch (ex) { fail(ex); return false; }
      }
    }]);
  }
  function viewExpenses() {
    setActions(btn('Add expense', addExpenseDialog));
    const t = D.today.slice(0, 7);
    const all = (D.expenses || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const monthTotal = all.filter(e => e.date.startsWith(t)).reduce((a, e) => a + e.amount, 0);
    const allTotal = all.reduce((a, e) => a + e.amount, 0);
    view().replaceChildren(
      h('div', { class: 'a-stats' }, [[inr(monthTotal), 'Spent this month'], [inr(allTotal), 'Spent all time'], [all.length, 'Expenses logged']].map(([n, l]) => h('div', { class: 'a-stat' }, h('b', { text: n }), h('span', { text: l })))),
      h('div', { class: 'a-section' }, expenseTable(all)));
  }

  /* ---------- analytics ---------- */
  function serviceStats() {
    const stats = new Map();
    for (const inv of D.invoices) {
      if (inv.void) continue;
      for (const it of inv.items) {
        const cur = stats.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
        cur.qty += it.qty; cur.revenue += it.qty * it.price;
        stats.set(it.name, cur);
      }
    }
    return [...stats.values()].sort((a, b) => b.qty - a.qty);
  }
  function barList(rows) {
    if (!rows.length) return emptyNote('Nothing billed yet. Analytics appear once you create invoices.', 'sparkle');
    const max = Math.max(...rows.map(r => r.qty), 1);
    return h('div', {}, rows.map(r => h('div', { class: 'a-bar-item' },
      h('div', { class: 'a-bar-top' }, h('span', { class: 'a-bar-name', text: r.name }), h('span', { class: 'a-bar-meta', text: r.qty + (r.qty === 1 ? ' time' : ' times') + '  ' + inr(r.revenue) })),
      h('div', { class: 'a-bar-track' }, h('div', { class: 'a-bar-fill', style: 'width:' + Math.round(r.qty / max * 100) + '%' })))));
  }
  function viewAnalytics() {
    const t = D.today.slice(0, 7);
    const revenue = D.invoices.filter(i => !i.void && i.date.startsWith(t)).reduce((a, i) => a + i.total, 0);
    const spent = (D.expenses || []).filter(e => e.date.startsWith(t)).reduce((a, e) => a + e.amount, 0);
    view().replaceChildren(
      h('div', { class: 'a-stats' }, [[inr(revenue), 'Billed this month'], [inr(spent), 'Spent this month'], [inr(revenue - spent), 'Net this month']].map(([n, l]) => h('div', { class: 'a-stat' }, h('b', { text: n }), h('span', { text: l })))),
      h('div', { class: 'a-section' }, h('h2', { class: 'a-h2', text: 'Most used services' }),
        h('p', { class: 'a-note', style: 'margin:0 0 16px', text: 'Ranked by how many times each service has been billed, all time.' }),
        barList(serviceStats())));
  }

  /* ---------- clients ---------- */
  function viewClients() {
    const q = h('input', { class: 'a-search', type: 'search', placeholder: 'Search by name or phone', 'aria-label': 'Search clients', oninput: draw }), box = h('div', {});
    function draw() {
      const s = q.value.trim().toLowerCase();
      const l = D.clients.filter(c => !s || (c.name + c.phone).toLowerCase().includes(s));
      box.replaceChildren(l.length ? h('div', { class: 'a-scroll' }, h('table', { class: 'a-table' },
        h('thead', {}, h('tr', {}, ['Client', 'Bookings', 'Bills', 'Billed', 'Last visit', ''].map(t => h('th', { text: t })))),
        h('tbody', {}, l.map(c => h('tr', {}, h('td', { 'data-label': 'Client' }, h('b', { text: c.name }), h('br'), h('span', { class: 'muted', text: c.phone + (c.email ? '  ' + c.email : '') })),
          h('td', { 'data-label': 'Bookings', text: c.bookings }), h('td', { 'data-label': 'Bills', text: c.visits }), h('td', { 'data-label': 'Billed', text: inr(c.billed) }), h('td', { 'data-label': 'Last visit', text: c.last ? fmtDate(c.last, { day: 'numeric', month: 'short', year: 'numeric' }) : '' }),
          h('td', { class: 'a-td-actions' }, h('div', { class: 'a-row-actions' }, btn('New bill', () => { B = newBill({ client: { name: c.name, phone: c.phone, email: c.email } }); go('billing'); }, 'btn-sm btn-alt'),
            waBtn('WhatsApp', c.phone, 'Hi ' + c.name + ', '))))))))
        : emptyNote('Clients appear here after their first booking or bill.', 'comb'));
    }
    draw(); view().replaceChildren(q, h('div', { style: 'height:16px' }), box);
  }

  /* ---------- uploads ---------- */
  async function uploadFile(file) {
    const dataUrl = await readImage(file);
    return (await api('POST', '/api/admin/upload', { dataUrl })).src;
  }
  async function uploadAudio(file) {
    if (file.type !== 'audio/mpeg') throw new Error('Choose an MP3 file.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Audio is larger than 8 MB.');
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('That file could not be read.'));
      r.readAsDataURL(file);
    });
    return (await api('POST', '/api/admin/upload-audio', { dataUrl })).src;
  }
  const saveSection = async (name, data, msg) => { try { const r = await api('PUT', '/api/admin/' + name, data); D[name] = r[name]; toast(msg || 'Saved'); return true; } catch (e) { fail(e); return false; } };

  /* ---------- menu editor ---------- */
  const openCats = new Set();
  function viewMenu() {
    const M = JSON.parse(JSON.stringify(D.menu));
    const root = h('div', {});
    const uid = () => 'n' + Math.random().toString(16).slice(2, 10);
    function draw() {
      const y = scrollY;
      root.replaceChildren(...M.map((c, ci) => h('details', { class: 'a-card', open: openCats.has(c.id), ontoggle: e => { e.target.open ? openCats.add(c.id) : openCats.delete(c.id); } },
        h('summary', {}, h('span', {}, c.name, ' ', h('small', { text: who(c.gender) + ', ' + c.items.length + ' items' })), h('span', { class: 'a-mini' })),
        h('div', { class: 'a-grid' }, fld('Group name', inp(c, 'name', { id: 'cn' + ci }), 'cn' + ci),
          fld('For', h('select', { id: 'cg' + ci, onchange: e => { c.gender = e.target.value; } }, [['all', 'Women and men'], ['female', 'Women'], ['male', 'Men']].map(([v, t]) => h('option', { value: v, selected: c.gender === v, text: t }))), 'cg' + ci),
          fld('Note (optional)', inp(c, 'note', { id: 'cno' + ci }), 'cno' + ci),
          fld('Two price columns? Names, comma separated', h('input', { type: 'text', id: 'cp' + ci, value: c.priceLabels.join(', '), placeholder: 'Normal, Rica', oninput: e => { c.priceLabels = e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 2); } }), 'cp' + ci)),
        c.items.map((it, ii) => h('div', { class: 'a-item' },
          inp(it, 'name', { 'aria-label': 'Service name', placeholder: 'Service name' }), inp(it, 'desc', { class: 'desc', 'aria-label': 'Description', placeholder: 'Short description' }),
          num(it, 'price', { 'aria-label': 'Price', placeholder: c.priceLabels[0] || 'Price' }), num(it, 'price2', { 'aria-label': 'Second price', placeholder: c.priceLabels[1] || 'Price 2' }),
          h('span', { class: 'a-mini' }, h('button', { type: 'button', 'aria-label': 'Move up', disabled: ii === 0, onclick: () => { move(c.items, ii, -1); draw(); } }, '\u2191'),
            h('button', { type: 'button', 'aria-label': 'Move down', disabled: ii === c.items.length - 1, onclick: () => { move(c.items, ii, 1); draw(); } }, '\u2193'),
            h('button', { type: 'button', 'aria-label': 'Delete service', onclick: () => { c.items.splice(ii, 1); draw(); } }, '\u00D7')),
          h('div', { class: 'flags' }, chk(it, 'popular', 'Most popular'), chk(it, 'active', 'Show on website')))),
        h('div', { class: 'a-dialog-actions' }, btn('Add service', () => { c.items.push({ id: uid(), name: '', desc: '', price: 0, price2: null, popular: false, active: true }); openCats.add(c.id); draw(); }, 'btn-sm btn-alt'),
          btn('Move group up', () => { move(M, ci, -1); draw(); }, 'btn-sm btn-alt'), btn('Move group down', () => { move(M, ci, 1); draw(); }, 'btn-sm btn-alt'),
          btn('Delete group', async () => { if (await confirmBox('Delete "' + c.name + '" and all its services from the menu?', 'Delete group')) { M.splice(ci, 1); draw(); } }, 'btn-sm btn-danger')))));
      scrollTo(0, y);
    }
    draw();
    setActions(btn('Add group', () => { const c = { id: uid(), name: 'New group', gender: 'all', note: '', priceLabels: [], items: [] }; M.push(c); openCats.add(c.id); draw(); }, 'btn-alt'));
    view().replaceChildren(h('p', { class: 'a-note', style: 'margin:0 0 16px', text: 'Open a group to edit its services. Changes go live on the website when you save. Bills use these prices as the starting point and you can change them per bill.' }), root,
      sticky(btn('Save menu', async () => { if (await saveSection('menu', M, 'Menu saved')) { await load(); } })));
  }

  /* ---------- hairstylists ---------- */
  function viewStylists() {
    const L = JSON.parse(JSON.stringify(D.stylists)), root = h('div', { class: 'a-thumbs' });
    const uid = () => 'n' + Math.random().toString(16).slice(2, 10);
    function draw() {
      root.replaceChildren(...L.map((s, i) => {
        const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'vh', id: 'sf' + i, onchange: async e => { const f = e.target.files[0]; if (!f) return; try { s.photo = await uploadFile(f); draw(); } catch (ex) { fail(ex); } } });
        return h('div', { class: 'a-thumb a-card' },
          h('div', { class: 'pic' }, s.photo ? h('img', { src: s.photo, alt: '' }) : doodle('scissors')),
          file, h('div', { style: 'margin-top:8px' }, h('label', { class: 'btn btn-sm btn-alt', for: 'sf' + i, tabindex: 0, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, s.photo ? 'Change photo' : 'Add photo'),
            s.photo ? [' ', btn('Remove photo', () => { s.photo = ''; draw(); }, 'btn-sm btn-alt')] : null),
          inp(s, 'name', { 'aria-label': 'Name', placeholder: 'Name' }), inp(s, 'role', { 'aria-label': 'Role', placeholder: 'Role, for example Senior hair stylist' }),
          area(s, 'bio', { rows: 3, 'aria-label': 'Short introduction', placeholder: 'Short introduction' }),
          h('div', { class: 'a-row-actions' }, chk(s, 'visible', 'Show on website'), h('span', { class: 'a-mini' },
            h('button', { type: 'button', 'aria-label': 'Move earlier', disabled: i === 0, onclick: () => { move(L, i, -1); draw(); } }, '\u2190'),
            h('button', { type: 'button', 'aria-label': 'Move later', disabled: i === L.length - 1, onclick: () => { move(L, i, 1); draw(); } }, '\u2192'),
            h('button', { type: 'button', 'aria-label': 'Delete', onclick: async () => { if (await confirmBox('Remove ' + s.name + ' from the team?', 'Remove')) { L.splice(i, 1); draw(); } } }, '\u00D7'))));
      }));
      if (!L.length) root.replaceChildren(emptyNote('No team members yet. Add the first one.', 'scissors'));
    }
    draw();
    setActions(btn('Add hairstylist', () => { L.push({ id: uid(), name: '', role: '', bio: '', photo: '', visible: true }); draw(); }, 'btn-alt'));
    view().replaceChildren(root, sticky(btn('Save hairstylists', async () => { if (await saveSection('stylists', L)) { await load(); rerender(); } })));
  }

  /* ---------- gallery ---------- */
  function viewGallery() {
    const L = JSON.parse(JSON.stringify(D.gallery)), root = h('div', { class: 'a-thumbs' });
    const uid = () => 'n' + Math.random().toString(16).slice(2, 10);
    function draw() {
      root.replaceChildren(...L.map((g, i) => h('div', { class: 'a-thumb a-card' }, h('img', { src: g.src, alt: g.caption || '' }), inp(g, 'caption', { 'aria-label': 'Caption', placeholder: 'Caption (optional)' }),
        h('div', { class: 'a-row-actions' }, chk(g, 'visible', 'Show'), h('span', { class: 'a-mini' },
          h('button', { type: 'button', 'aria-label': 'Move earlier', disabled: i === 0, onclick: () => { move(L, i, -1); draw(); } }, '\u2190'),
          h('button', { type: 'button', 'aria-label': 'Move later', disabled: i === L.length - 1, onclick: () => { move(L, i, 1); draw(); } }, '\u2192'),
          h('button', { type: 'button', 'aria-label': 'Delete image', onclick: () => { L.splice(i, 1); draw(); } }, '\u00D7'))))));
      if (!L.length) root.replaceChildren(emptyNote('No photos yet. Add some and the website will show them instead of the placeholders.', 'mirror'));
    }
    draw();
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, class: 'vh', id: 'gf', onchange: async e => {
      const files = [...e.target.files]; if (!files.length) return; toast('Uploading ' + files.length + (files.length > 1 ? ' photos...' : ' photo...'));
      for (const f of files) { try { L.push({ id: uid(), src: await uploadFile(f), caption: '', visible: true }); } catch (ex) { fail(ex); } }
      e.target.value = ''; draw(); toast('Photos added. Save to publish.');
    } });
    setActions(file, h('label', { class: 'btn btn-alt', for: 'gf', tabindex: 0, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, 'Add photos'));
    view().replaceChildren(root, sticky(btn('Save gallery', async () => { if (await saveSection('gallery', L)) { await load(); rerender(); } })));
  }

  /* ---------- website text ---------- */
  function viewContent() {
    const C = { ...D.content };
    const rows = [['heroTitle', 'Home page headline', 'i'], ['heroText', 'Home page intro', 't', 3], ['servicesText', 'Services intro', 't', 2], ['menuText', 'Menu intro', 't', 2],
      ['galleryText', 'Gallery intro', 't', 2], ['stylistsText', 'Hairstylists intro', 't', 2], ['aboutTitle', 'About us headline', 'i'], ['aboutText', 'About us text (one paragraph per line)', 't', 8], ['bookText', 'Booking intro', 't', 2]];
    view().replaceChildren(h('div', { style: 'max-width:720px' }, rows.map(([k, l, t, r]) => fld(l, t === 'i' ? inp(C, k, { id: 'c' + k }) : area(C, k, { id: 'c' + k, rows: r }), 'c' + k))),
      sticky(btn('Save website text', async () => { if (await saveSection('content', C)) await load(); })));
  }

  /* ---------- settings ---------- */
  function clearHistoryDialog() {
    const F = { text: '' };
    const body = h('div', {},
      h('p', { text: 'This permanently deletes every booking, bill and expense, and resets invoice numbering back to the start. Clients are rebuilt from bookings and bills, so they clear too. Your menu, prices, stylists, gallery, website text and settings are not touched.' }),
      h('p', { class: 'a-note', text: 'This cannot be undone. Download a backup first if you might need this data again.' }),
      fld('Type DELETE to confirm', inp(F, 'text', { id: 'clearConfirm', autocomplete: 'off' }), 'clearConfirm'));
    modal('Clear all bookings, bills and expenses', body, [{ label: 'Cancel', cls: 'btn-alt', value: 'no' }, {
      label: 'Delete everything', cls: 'btn-danger', fn: async () => {
        if (F.text.trim().toUpperCase() !== 'DELETE') { toast('Type DELETE to confirm', true); return false; }
        try { await api('POST', '/api/admin/clear-history', {}); await load(); go('dashboard'); toast('All history cleared'); } catch (ex) { fail(ex); return false; }
      }
    }]);
  }
  function viewSettings() {
    const S = JSON.parse(JSON.stringify(D.settings)), P = { current: '', next: '' };
    if (!S.bgMusic) S.bgMusic = { mode: 'off', src: '', volume: 15, spotifyUrl: '', spotifyEmbed: '' };
    if (!S.bgMusic.mode) S.bgMusic.mode = S.bgMusic.enabled ? 'upload' : 'off';
    const id = k => 's' + k;
    const days = h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' }, DAYS.map((d, i) => h('label', { class: 'a-check' }, h('input', { type: 'checkbox', checked: S.closedDays.includes(i), onchange: e => { S.closedDays = e.target.checked ? [...S.closedDays, i] : S.closedDays.filter(x => x !== i); } }), d)));
    const logoBox = h('div', { class: 'a-card', style: 'max-width:220px' });
    function drawLogo() {
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'vh', id: 'sHeroLogo', onchange: async e => {
        const f = e.target.files[0]; if (!f) return;
        try { S.heroLogo = await uploadFile(f); drawLogo(); } catch (ex) { fail(ex); }
      } });
      logoBox.replaceChildren(
        h('div', { class: 'pic', style: 'aspect-ratio:1' }, S.heroLogo ? h('img', { src: S.heroLogo, alt: '' }) : doodle('sparkle')),
        file,
        h('div', { style: 'margin-top:8px' },
          h('label', { class: 'btn btn-sm btn-alt', for: 'sHeroLogo', tabindex: 0, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, S.heroLogo ? 'Change logo' : 'Upload logo'),
          S.heroLogo ? [' ', btn('Remove logo', () => { S.heroLogo = ''; drawLogo(); }, 'btn-sm btn-alt')] : null));
    }
    drawLogo();

    const MUSIC_MODES = { off: 'Off', upload: 'Uploaded track', spotify: 'Spotify' };
    const spotifyEmbedUrl = url => {
      const m = String(url || '').match(/open\.spotify\.com\/(?:intl-\w+\/)?(playlist|track|album|artist)\/([a-zA-Z0-9]+)/);
      return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : '';
    };
    const musicBox = h('div', { class: 'a-card', style: 'max-width:420px' });
    function drawMusic() {
      const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Music source', style: 'margin-bottom:16px' },
        Object.entries(MUSIC_MODES).map(([m, t]) => h('button', { type: 'button', 'aria-pressed': S.bgMusic.mode === m, onclick: () => { S.bgMusic.mode = m; drawMusic(); } }, t)));

      const panel = [];

      if (S.bgMusic.mode === 'upload') {
        const file = h('input', { type: 'file', accept: 'audio/mpeg', class: 'vh', id: 'sMusicFile', onchange: async e => {
          const f = e.target.files[0]; if (!f) return;
          try { toast('Uploading track...'); S.bgMusic.src = await uploadAudio(f); drawMusic(); } catch (ex) { fail(ex); }
        } });
        const volLabel = h('span', { class: 'muted', text: S.bgMusic.volume + '%' });
        panel.push(
          S.bgMusic.src ? h('audio', { controls: true, src: S.bgMusic.src, style: 'width:100%' }) : h('p', { class: 'muted', text: 'No track uploaded yet.' }),
          file,
          h('div', { style: 'margin-top:8px' },
            h('label', { class: 'btn btn-sm btn-alt', for: 'sMusicFile', tabindex: 0, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } }, S.bgMusic.src ? 'Change track' : 'Upload track'),
            S.bgMusic.src ? [' ', btn('Remove track', () => { S.bgMusic.src = ''; drawMusic(); }, 'btn-sm btn-alt')] : null),
          h('div', { class: 'field', style: 'margin-top:14px;max-width:260px' },
            h('label', {}, 'Volume ', volLabel),
            h('input', { type: 'range', min: 0, max: 60, value: S.bgMusic.volume, oninput: e => { S.bgMusic.volume = +e.target.value; volLabel.textContent = S.bgMusic.volume + '%'; } })));
      } else if (S.bgMusic.mode === 'spotify') {
        const preview = h('div', { style: 'margin-top:10px' });
        const drawPreview = () => {
          const embed = spotifyEmbedUrl(S.bgMusic.spotifyUrl);
          S.bgMusic.spotifyEmbed = embed;
          preview.replaceChildren(embed
            ? h('iframe', { src: embed, width: '100%', height: '152', style: 'border:0;border-radius:12px', allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' })
            : S.bgMusic.spotifyUrl
              ? h('p', { class: 'a-note', style: 'color:#A3241F', text: "That doesn't look like a Spotify playlist, track, album or artist link." })
              : null);
        };
        panel.push(
          h('div', { class: 'field' },
            h('label', { for: 'sSpotifyUrl' }, 'Spotify playlist, track, album or artist link'),
            h('input', { type: 'url', id: 'sSpotifyUrl', placeholder: 'https://open.spotify.com/playlist/...', value: S.bgMusic.spotifyUrl || '', oninput: e => { S.bgMusic.spotifyUrl = e.target.value; drawPreview(); } })),
          h('p', { class: 'a-note', text: "Visitors see Spotify's own player and press play themselves - no login needed to hear a preview." }),
          preview);
        drawPreview();
      } else {
        panel.push(h('p', { class: 'muted', text: 'No music will play on the website.' }));
      }

      musicBox.replaceChildren(modeSeg, ...panel);
    }
    drawMusic();

    const qrUrl = location.origin + '/menu';
    const qrPic = h('div', { class: 'pic', style: 'aspect-ratio:1;background:#fff' });
    let qrCanvas = null;
    function drawQr() {
      const qr = qrcode(0, 'M');
      qr.addData(qrUrl);
      qr.make();
      const count = qr.getModuleCount(), margin = 2;
      const cell = Math.max(6, Math.round(480 / (count + margin * 2)));
      const size = (count + margin * 2) * cell;
      qrCanvas = h('canvas', { width: size, height: size, style: 'width:100%;height:100%' });
      const ctx = qrCanvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#391D21';
      for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
      qrPic.replaceChildren(qrCanvas);
    }
    drawQr();

    view().replaceChildren(h('div', { style: 'max-width:760px' },
      h('h2', { class: 'a-h2', text: 'Branding' }),
      h('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Shown in the home page hero in place of the salon photo. Leave empty to use the photo.' }),
      logoBox,
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Background music' }),
      h('p', { class: 'muted', style: 'margin-bottom:12px', text: "Pick at most one source. An uploaded track loops quietly and needs a visitor to tap the on-site button once before it makes sound (browsers block that automatically); only upload music you have the rights to play publicly. Spotify shows their own player instead." }),
      musicBox,
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Share your menu' }),
      h('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Print this at the counter or entrance. Scanning it opens your treatment menu, where clients can browse and pick services before booking.' }),
      h('div', { class: 'a-card', style: 'max-width:260px;text-align:center' },
        qrPic,
        h('p', { class: 'a-note', style: 'word-break:break-all', text: qrUrl }),
        h('div', { class: 'a-row-actions', style: 'justify-content:center;margin-top:10px' },
          btn('Copy link', async () => { try { await navigator.clipboard.writeText(qrUrl); toast('Link copied'); } catch { toast(qrUrl); } }, 'btn-sm btn-alt'),
          btn('Download QR', () => { const a = document.createElement('a'); a.href = qrCanvas.toDataURL('image/png'); a.download = 'showoff-salon-menu-qr.png'; a.click(); }, 'btn-sm btn-alt'))),
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Salon details' }),
      h('div', { class: 'a-grid' }, fld('Salon name', inp(S, 'salonName', { id: id('salonName') }), id('salonName')), fld('Phone', inp(S, 'phone', { id: id('phone'), type: 'tel' }), id('phone')),
        fld('WhatsApp number (for the Book form)', inp(S, 'whatsapp', { id: id('whatsapp'), type: 'tel', placeholder: '10 digit number' }), id('whatsapp')), fld('Email', inp(S, 'email', { id: id('email') }), id('email')),
        fld('Instagram handle', inp(S, 'instagram', { id: id('instagram') }), id('instagram')), fld('Google Maps link', inp(S, 'mapUrl', { id: id('mapUrl'), placeholder: 'https://maps.app.goo.gl/...' }), id('mapUrl'))),
      fld('Address', inp(S, 'address', { id: id('address') }), id('address')), fld('Line under the logo', inp(S, 'tagline', { id: id('tagline') }), id('tagline')),
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Hours and booking rules' }),
      h('div', { class: 'a-grid' }, fld('Opens', h('input', { type: 'time', id: id('open'), value: S.open, onchange: e => { S.open = e.target.value; } }), id('open')), fld('Closes', h('input', { type: 'time', id: id('close'), value: S.close, onchange: e => { S.close = e.target.value; } }), id('close')),
        fld('Time slot length', h('select', { id: id('slot'), onchange: e => { S.slotMinutes = +e.target.value; } }, [15, 20, 30, 45, 60, 90, 120].map(m => h('option', { value: m, selected: S.slotMinutes === m, text: m + ' minutes' }))), id('slot')),
        fld('Clients per slot (chairs)', num(S, 'capacity', { id: id('cap'), min: 1 }), id('cap')), fld('Bookings open how many days ahead', num(S, 'advanceDays', { id: id('adv'), min: 1 }), id('adv'))),
      h('div', { class: 'field' }, h('label', { text: 'Closed on' }), days),
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Invoice' }), fld('Footer line', inp(S, 'invoiceFooter', { id: id('foot') }), id('foot')),
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Change password' }),
      h('div', { class: 'a-grid' }, fld('Current password', h('input', { type: 'password', id: 'pcur', autocomplete: 'current-password', oninput: e => { P.current = e.target.value; } }), 'pcur'),
        fld('New password (8 or more characters)', h('input', { type: 'password', id: 'pnew', autocomplete: 'new-password', oninput: e => { P.next = e.target.value; } }), 'pnew')),
      btn('Change password', async () => { try { await api('POST', '/api/admin/password', P); P.current = P.next = ''; $('#pcur').value = $('#pnew').value = ''; toast('Password changed'); } catch (ex) { fail(ex); } }, 'btn-alt'),
      h('h2', { class: 'a-h2', style: 'margin-top:32px', text: 'Danger zone' }),
      h('p', { class: 'muted', style: 'margin-bottom:12px', text: 'Start fresh by permanently deleting all bookings, bills and expenses. Your menu, prices, stylists, gallery, website text and settings are not touched.' }),
      h('div', { class: 'a-row-actions' },
        h('a', { class: 'btn btn-alt', href: '/api/admin/export', download: 'showoff-salon-backup.json' }, 'Download backup first'),
        btn('Clear all bookings, bills and expenses', clearHistoryDialog, 'btn-danger'))),
      sticky(btn('Save settings', async () => { if (await saveSection('settings', S)) await load(); })));
  }

  const VIEWS = { dashboard: viewDashboard, bookings: viewBookings, billing: viewBilling, clients: viewClients, menu: viewMenu, stylists: viewStylists, gallery: viewGallery, content: viewContent, settings: viewSettings, expenses: viewExpenses, analytics: viewAnalytics };
  boot();
})();
