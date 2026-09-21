(async function () {
  let site;
  try {
    const r = await fetch('/api/site');
    if (!r.ok) throw 0;
    site = await r.json();
  } catch {
    document.body.prepend(h('p', { style: 'padding:24px;text-align:center' }, 'The site could not load. Please refresh the page.'));
    return;
  }
  const { settings: S, content: C } = site;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text || ''; };

  /* ---------- header + full-screen nav ---------- */
  set('brandName', S.salonName);
  document.title = S.salonName + ', ' + (S.address || 'Jodhpur');

  /* ---------- structured data for search engines ---------- */
  (function () {
    const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const openDays = DAYS_FULL.filter((_, i) => !(S.closedDays || []).includes(i));
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'HairSalon',
      name: S.salonName,
      image: location.origin + '/assets/og-image.jpg',
      url: location.origin,
      address: { '@type': 'PostalAddress', streetAddress: S.address || '', addressCountry: 'IN' }
    };
    if (S.phone) ld.telephone = S.phone;
    if (openDays.length && S.open && S.close) {
      ld.openingHoursSpecification = openDays.map(day => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: day, opens: S.open, closes: S.close }));
    }
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  })();
  const menuBtn = $('#menuBtn'), navOverlay = $('#navOverlay'), nav = $('#nav');
  $('#menuBtnIco').replaceChildren(icon('shears', 'ico-open'), icon('close', 'ico-close'));
  let navScrollY = 0;
  const setMenu = open => {
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navOverlay.classList.toggle('open', open);
    navOverlay.setAttribute('aria-hidden', String(!open));
    document.documentElement.classList.toggle('nav-open', open);
    /* html{overflow:hidden} alone still lets iOS Safari rubber-band the page behind
       a fixed overlay, so pin the body in place too while the menu is open. */
    if (open) {
      navScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = -navScrollY + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
    } else {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo({ top: navScrollY, behavior: 'instant' });
    }
  };
  setMenu(false);
  menuBtn.addEventListener('click', () => setMenu(!navOverlay.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  navOverlay.addEventListener('click', e => { if (e.target === navOverlay) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && navOverlay.classList.contains('open')) setMenu(false); });
  $('#navOverlayClose').replaceChildren(icon('close'));
  $('#navOverlayClose').addEventListener('click', () => setMenu(false));

  const hdr = $('#hdr');
  const scrollProgress = $('#scrollProgress');
  const syncHdrScroll = () => {
    hdr.classList.toggle('is-scrolled', scrollY > 8);
    const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    scrollProgress.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0) + ')';
  };
  syncHdrScroll();
  addEventListener('scroll', syncHdrScroll, { passive: true });

  set('navAddress', S.address);
  const navEmail = $('#navEmail');
  if (S.email) { navEmail.href = 'mailto:' + S.email; navEmail.textContent = 'Email us'; }
  else navEmail.hidden = true;
  set('navCopyright', '© ' + new Date().getFullYear() + ' ' + S.salonName);
  const navInsta = $('#navInsta');
  if (S.instagram) { navInsta.href = 'https://instagram.com/' + S.instagram; navInsta.textContent = '@' + S.instagram; }
  else navInsta.hidden = true;

  /* ---------- hero + facts ---------- */
  set('heroEyebrow', S.tagline);
  set('heroTitle', C.heroTitle);
  set('heroText', C.heroText);

  const heroMedia = $('#heroMedia');
  if (site.gallery && site.gallery.length) {
    heroMedia.replaceChildren(h('img', { src: site.gallery[0].src, alt: '', fetchpriority: 'high', decoding: 'async' }));
  } else if (S.heroLogo) {
    heroMedia.replaceChildren(h('div', { class: 'hero-media-fallback' },
      h('img', { src: S.heroLogo, alt: '', width: 900, height: 900, fetchpriority: 'high', decoding: 'async' })));
  } else {
    heroMedia.replaceChildren(h('img', { src: '/assets/hero-photo.jpg', alt: '', fetchpriority: 'high', decoding: 'async' }));
  }

  const heroTel = $('#heroTel');
  if (S.phone) { heroTel.href = 'tel:' + S.phone.replace(/[^\d+]/g, ''); heroTel.textContent = S.phone; }
  else if (S.whatsapp) { heroTel.href = waLink(S.whatsapp, 'Hi ' + S.salonName); heroTel.target = '_blank'; heroTel.rel = 'noopener'; heroTel.textContent = 'Message us'; }
  else { heroTel.hidden = true; }

  const closed = (S.closedDays || []).map(d => DAYS[d]);
  const hoursText = fmt12(S.open) + ' to ' + fmt12(S.close);
  const facts = [
    ['Open', hoursText + (closed.length ? '. Closed on ' + closed.join(' and ') + '.' : ', every day.')],
    ['Find us', S.mapUrl ? h('a', { href: S.mapUrl, target: '_blank', rel: 'noopener' }, S.address) : S.address],
    S.phone ? ['Call', h('a', { href: 'tel:' + S.phone.replace(/[^\d+]/g, '') }, S.phone)] : (S.whatsapp ? ['WhatsApp', h('a', { href: waLink(S.whatsapp, 'Hi ' + S.salonName), target: '_blank', rel: 'noopener' }, 'Message us')] : null),
    S.instagram ? ['Instagram', h('a', { href: 'https://instagram.com/' + S.instagram, target: '_blank', rel: 'noopener' }, '@' + S.instagram)] : null
  ].filter(f => f && f[1]);
  $('#facts').replaceChildren(...facts.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', {}, v))));

  /* ---------- section text + head doodles ---------- */
  set('servicesText', C.servicesText); set('galleryText', C.galleryText);
  set('stylistsText', C.stylistsText); set('aboutTitle', C.aboutTitle); set('bookText', C.bookText);
  const headDoodles = { services: ['comb', ''], menu: ['sparkle', ''], gallery: ['mirror', ''], stylists: ['chair', ''] };
  for (const [id, [d, cls]] of Object.entries(headDoodles)) $('#' + id + ' .sec-head').append(doodle(d, cls));
  $('.about').append(doodle('wave'));
  $('.book-copy').append(doodle('polish'));

  /* ---------- helpers ---------- */
  const who = g => g === 'female' ? 'Women' : g === 'male' ? 'Men' : 'Women and men';
  const maxPrice = c => Math.max(...c.items.flatMap(i => [i.price, i.price2]).filter(v => v != null));

  /* ---------- services summary ---------- */
  function renderServices() {
    const catCount = site.menu.length;
    const itemCount = site.menu.reduce((a, c) => a + c.items.length, 0);
    const highest = Math.max(...site.menu.map(maxPrice));
    $('#svcStats').replaceChildren(
      h('div', {}, h('dt', { text: catCount === 1 ? 'Category' : 'Categories' }), h('dd', { text: catCount })),
      h('div', {}, h('dt', { text: 'Treatments' }), h('dd', { text: itemCount + '+' })),
      h('div', {}, h('dt', { text: 'Ends at' }), h('dd', { text: inr(highest) })));
    const names = site.menu.map(c => c.name);
    $('#svcTicker').replaceChildren(h('div', { class: 'svc-ticker-track' }, [...names, ...names].map(n => h('span', { text: n }))));
  }

  /* ---------- gallery + lightbox ---------- */
  const lb = $('#lightbox'); let li = 0;
  $('#lbClose').replaceChildren(icon('close')); $('#lbPrev').replaceChildren(icon('arrow-l')); $('#lbNext').replaceChildren(icon('arrow-r'));
  function showLb(i) {
    li = (i + site.gallery.length) % site.gallery.length;
    const g = site.gallery[li];
    $('#lbImg').src = g.src; $('#lbImg').alt = g.caption || 'Gallery image'; $('#lbCap').textContent = g.caption || '';
  }
  function renderGallery() {
    const grid = $('#galGrid');
    if (!site.gallery.length) {
      const tiles = [['a', 'scissors'], ['b', 'comb'], ['c', 'mirror'], ['d', 'spray'], ['b', 'polish'], ['a', 'razor']];
      grid.replaceChildren(...tiles.map(([k, d]) => h('div', { class: 'ph-tile ' + k, 'aria-hidden': 'true' }, doodle(d))));
      return;
    }
    grid.replaceChildren(...site.gallery.map((g, i) => h('button', { type: 'button', 'aria-label': 'Open image' + (g.caption ? ': ' + g.caption : ''), onclick: () => { showLb(i); lb.showModal(); } },
      h('img', { src: g.src, alt: g.caption || '', loading: 'lazy', decoding: 'async' }))));
  }
  $('#lbClose').addEventListener('click', () => lb.close());
  $('#lbPrev').addEventListener('click', () => showLb(li - 1));
  $('#lbNext').addEventListener('click', () => showLb(li + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') showLb(li - 1); if (e.key === 'ArrowRight') showLb(li + 1); });

  /* ---------- team + about ---------- */
  $('#team').replaceChildren(...site.stylists.map(s => h('article', { class: 'person' },
    h('div', { class: 'pic' }, s.photo ? h('img', { src: s.photo, alt: s.name, loading: 'lazy', decoding: 'async' }) : doodle('scissors')),
    h('h3', { text: s.name }),
    s.role ? h('p', { class: 'role', text: s.role }) : null,
    s.bio ? h('p', { class: 'bio', text: s.bio }) : null)));
  if (!site.stylists.length) { $('#stylists').hidden = true; $('a[href="#stylists"]', nav).hidden = true; }
  $('#aboutBody').replaceChildren(...(C.aboutText || '').split(/\n+/).filter(Boolean).map(t => h('p', { text: t })));

  /* ---------- footer ---------- */
  $('#footContact').replaceChildren(
    h('p', {}, h('strong', { text: S.salonName }), h('br'), S.address,
      S.phone ? [h('br'), h('a', { href: 'tel:' + S.phone.replace(/[^\d+]/g, '') }, S.phone)] : null,
      S.email ? [h('br'), h('a', { href: 'mailto:' + S.email }, S.email)] : null,
      S.instagram ? [h('br'), h('a', { href: 'https://instagram.com/' + S.instagram, target: '_blank', rel: 'noopener' }, '@' + S.instagram)] : null));
  $('#footHours').replaceChildren(h('p', {}, h('span', { class: 'k', text: 'Hours' }), h('br'), hoursText, closed.length ? [h('br'), 'Closed on ' + closed.join(' and ')] : null));

  /* ---------- booking ---------- */
  const form = $('#bookForm'), picked = new Set(), idxItems = new Map(site.menu.flatMap(c => c.items.map(i => [i.id, i])));
  const dateEl = $('#bDate');
  const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
  dateEl.min = site.today; dateEl.max = addDays(site.today, S.advanceDays);

  $('#pickList').replaceChildren(...site.menu.flatMap(c => [
    h('div', { class: 'pick-group' }, c.name, ' ', h('small', { text: who(c.gender) })),
    ...c.items.map(i => h('label', { class: 'pick' },
      h('input', { type: 'checkbox', value: i.id, onchange: e => { e.target.checked ? picked.add(i.id) : picked.delete(i.id); syncPick(); } }),
      i.name, h('span', { class: 'p', text: inr(i.price) + (i.price2 != null ? '+' : '') })))
  ]));
  function syncPick() {
    $('#pickSummary').textContent = picked.size ? picked.size + ' selected' : 'Choose services';
    $('#pickChips').replaceChildren(...[...picked].map(id => h('span', { class: 'chip', text: idxItems.get(id).name })));
  }

  /* ---------- picks carried over from the menu page ---------- */
  (function () {
    const PICK_KEY = 'ss_menu_picks';
    let ids;
    try { ids = JSON.parse(sessionStorage.getItem(PICK_KEY) || 'null'); } catch { ids = null; }
    if (!ids || !ids.length) return;
    try { sessionStorage.removeItem(PICK_KEY); } catch {}
    ids.forEach(id => { if (idxItems.has(id)) picked.add(id); });
    if (!picked.size) return;
    $$('#pickList input[type=checkbox]').forEach(cb => { cb.checked = picked.has(cb.value); });
    syncPick();
    requestAnimationFrame(() => $('#book').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  })();

  dateEl.addEventListener('change', loadSlots);
  async function loadSlots() {
    const box = $('#slots');
    if (!dateEl.value) return;
    box.replaceChildren(h('p', { class: 'hint', text: 'Checking times...' }));
    try {
      const r = await fetch('/api/slots?date=' + encodeURIComponent(dateEl.value));
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.closed) return box.replaceChildren(h('p', { class: 'hint', text: d.reason }));
      box.replaceChildren(...d.slots.map(s => h('label', { class: 'slot' },
        h('input', { type: 'radio', name: 'time', value: s.time, disabled: !s.free }),
        h('span', { text: fmt12(s.time) }))));
    } catch (e) { box.replaceChildren(h('p', { class: 'hint', text: e.message || 'Could not load times.' })); }
  }

  const err = m => { $('#bookError').textContent = m || ''; };
  form.addEventListener('submit', async e => {
    e.preventDefault(); err('');
    const fd = new FormData(form);
    const body = { name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email'), date: fd.get('date'), time: fd.get('time'), note: fd.get('note'), website: fd.get('website'), services: [...picked] };
    if (!body.name || body.name.trim().length < 2) return err('Enter your name.');
    if (String(body.phone || '').replace(/\D/g, '').length < 8) return err('Enter a valid phone number.');
    if (!body.date) return err('Choose a date.');
    if (!body.time) return err('Choose a time.');
    const btn = $('#bookBtn'); btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not send the request.');
      showDone(d.booking);
    } catch (ex) { err(ex.message); loadSlots(); }
    finally { btn.disabled = false; btn.textContent = 'Book appointment'; }
  });

  function showDone(b) {
    const done = $('#bookDone');
    const msg = `Hi ${S.salonName}, I requested an appointment. Reference ${b.ref}: ${fmtDate(b.date)} at ${fmt12(b.time)}. Name: ${b.name}.`;
    done.replaceChildren(
      h('h3', { text: 'Request sent' }),
      h('p', { text: 'We will confirm your slot. Keep your reference number handy.' }),
      h('dl', {},
        h('div', {}, h('dt', { text: 'Reference' }), h('dd', { text: b.ref })),
        h('div', {}, h('dt', { text: 'Date' }), h('dd', { text: fmtDate(b.date) })),
        h('div', {}, h('dt', { text: 'Time' }), h('dd', { text: fmt12(b.time) })),
        b.services.length ? h('div', {}, h('dt', { text: 'Services' }), h('dd', { text: b.services.map(s => s.name).join(', ') })) : null),
      h('div', { class: 'actions' },
        S.whatsapp ? h('a', { class: 'btn', href: waLink(S.whatsapp, msg), target: '_blank', rel: 'noopener' }, icon('whatsapp'), 'Message us on WhatsApp') : null,
        h('button', { class: 'btn btn-alt', type: 'button', onclick: () => { form.reset(); picked.clear(); syncPick(); $('#slots').replaceChildren(h('p', { class: 'hint', text: 'Choose a date to see available times.' })); done.hidden = true; form.hidden = false; } }, 'Book another')));
    form.hidden = true; done.hidden = false;
    $('#bookPanel').scrollIntoView({ block: 'center' });
  }

  renderServices(); renderGallery();

  /* ---------- scroll reveal + hero parallax ---------- */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const targets = $$('.sec-head, .gal > *, .team .person, .about-body, .panel, .facts > div, .svc-stats > div');
    targets.forEach(el => el.classList.add('sr'));
    $$('.gal > *').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 60, 300) + 'ms'; });
    $$('.team .person').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 80, 320) + 'ms'; });
    $$('.facts > div').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 60, 240) + 'ms'; });
    $$('.svc-stats > div').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 70, 210) + 'ms'; });

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('sr-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(el => io.observe(el));
  }

  /* ---------- first-visit booking popup ---------- */
  (function () {
    const SEEN_KEY = 'ss_promo_seen';
    const promo = $('#promo');
    if (!promo) return;
    $('.promo-in').prepend(doodle('spray'));

    let seen = true;
    try { seen = !!localStorage.getItem(SEEN_KEY); } catch {}

    const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch {} };

    const idx = new Map(site.menu.flatMap(c => c.items.map(i => [i.id, i])));
    $('#pmService').append(...site.menu.flatMap(c => c.items.map(i =>
      h('option', { value: i.id, text: i.name + (c.gender !== 'all' ? ' (' + who(c.gender) + ')' : '') }))));

    const pmDate = $('#pmDate'), pmTime = $('#pmTime');
    const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
    pmDate.min = site.today; pmDate.max = addDays(site.today, S.advanceDays);

    pmDate.addEventListener('change', async () => {
      pmTime.replaceChildren(h('option', { value: '', text: 'Loading...' }));
      try {
        const r = await fetch('/api/slots?date=' + encodeURIComponent(pmDate.value));
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (d.closed || !d.slots) return pmTime.replaceChildren(h('option', { value: '', text: d.reason || 'No times available' }));
        pmTime.replaceChildren(h('option', { value: '', text: 'Choose a time' }),
          ...d.slots.map(s => h('option', { value: s.time, text: fmt12(s.time) + (s.free ? '' : ' (full)'), disabled: !s.free })));
      } catch { pmTime.replaceChildren(h('option', { value: '', text: 'Could not load times' })); }
    });

    const promoErr = m => { $('#promoError').textContent = m || ''; };
    $('#promoForm').addEventListener('submit', async e => {
      e.preventDefault(); promoErr('');
      const fd = new FormData(e.target);
      const body = { name: fd.get('name'), phone: fd.get('phone'), date: fd.get('date'), time: fd.get('time'), services: [fd.get('service')] };
      if (!body.name || body.name.trim().length < 2) return promoErr('Enter your name.');
      if (String(body.phone || '').replace(/\D/g, '').length < 8) return promoErr('Enter a valid phone number.');
      if (!body.services[0]) return promoErr('Choose a service.');
      if (!body.date || !body.time) return promoErr('Choose a date and time.');
      const btn = $('#promoBtn'); btn.disabled = true; btn.textContent = 'Sending...';
      try {
        const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Could not send the request.');
        $('.promo-in').replaceChildren(
          h('h3', { text: 'Request sent' }),
          h('p', { text: 'Reference ' + d.booking.ref + '. We will confirm your slot at ' + fmt12(body.time) + '.' }),
          h('button', { class: 'btn btn-wide btn-pill', type: 'button', onclick: () => promo.close() }, 'Close'));
      } catch (ex) { promoErr(ex.message); }
      finally { btn.disabled = false; btn.textContent = 'Book now'; }
    });

    $('#promoClose').replaceChildren(icon('close'));
    $('#promoClose').addEventListener('click', () => { markSeen(); promo.close(); });
    promo.addEventListener('click', e => { if (e.target === promo) { markSeen(); promo.close(); } });
    promo.addEventListener('close', markSeen);

    if (!seen) setTimeout(() => { try { promo.showModal(); } catch {} }, 1800);
  })();

  /* ---------- background music ---------- */
  (function () {
    const M = S.bgMusic;
    if (!M) return;
    const mode = M.mode || (M.enabled ? 'upload' : 'off');

    if (mode === 'upload' && M.src) {
      const MUTE_KEY = 'ss_music_muted';
      let muted = true;
      try { muted = localStorage.getItem(MUTE_KEY) !== '0'; } catch {}
      const audioEl = h('audio', { src: M.src, loop: true, preload: 'auto' });
      audioEl.volume = Math.max(0, Math.min(1, (M.volume || 15) / 100));
      audioEl.muted = muted;
      const toggle = h('button', { class: 'bg-music-toggle', type: 'button' });
      const sync = () => { toggle.replaceChildren(icon(muted ? 'sound-off' : 'sound-on')); toggle.setAttribute('aria-label', muted ? 'Play background music' : 'Mute background music'); };
      sync();
      document.body.append(audioEl, toggle);
      audioEl.play().catch(() => {});
      toggle.addEventListener('click', () => {
        muted = !muted;
        audioEl.muted = muted;
        sync();
        try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
        audioEl.play().catch(() => {});
      });
    } else if (mode === 'spotify' && M.spotifyEmbed) {
      const OPEN_KEY = 'ss_music_open';
      let open = false;
      try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch {}
      const popover = h('div', { class: 'spotify-popover', hidden: !open });
      const toggle = h('button', { class: 'bg-music-toggle', type: 'button' });
      let loaded = false;
      const sync = () => {
        toggle.replaceChildren(icon(open ? 'sound-on' : 'sound-off'));
        toggle.setAttribute('aria-label', open ? 'Hide music player' : 'Show music player');
        popover.hidden = !open;
        if (open && !loaded) {
          loaded = true;
          popover.replaceChildren(h('iframe', { src: M.spotifyEmbed, width: '100%', height: '152', loading: 'lazy', allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' }));
        }
      };
      sync();
      document.body.append(toggle, popover);
      toggle.addEventListener('click', () => {
        open = !open;
        sync();
        try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch {}
      });
    }
  })();
})();
