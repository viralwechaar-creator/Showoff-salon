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

  /* ---------- header + mobile nav ---------- */
  set('brandName', S.salonName);
  document.title = S.salonName + ', ' + (S.address || 'Jodhpur');
  const burger = $('#burger'), nav = $('#nav');
  const setBurger = open => { burger.replaceChildren(icon(open ? 'close' : 'menu')); burger.setAttribute('aria-expanded', open); burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); nav.classList.toggle('open', open); };
  setBurger(false);
  burger.addEventListener('click', () => setBurger(!nav.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setBurger(false); });

  /* ---------- hero + facts ---------- */
  set('heroTitle', C.heroTitle);
  set('heroText', C.heroText);
  const mark = $('.hero-mark');
  mark.append(doodle('sparkle', 'gold hero-d1'), doodle('scissors', 'gold hero-d2'));
  if (S.heroLogo) $('.disc img').src = S.heroLogo;

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
  set('servicesText', C.servicesText); set('menuText', C.menuText); set('galleryText', C.galleryText);
  set('stylistsText', C.stylistsText); set('aboutTitle', C.aboutTitle); set('bookText', C.bookText);
  const headDoodles = { services: ['comb', ''], menu: ['sparkle', 'gold'], gallery: ['mirror', ''], stylists: ['scissors', ''] };
  for (const [id, [d, cls]] of Object.entries(headDoodles)) $('#' + id + ' .sec-head').append(doodle(d, cls));
  $('.about').append(doodle('wave', 'gold'));
  $('.book-copy').append(doodle('polish'));

  /* ---------- helpers ---------- */
  const who = g => g === 'female' ? 'Women' : g === 'male' ? 'Men' : 'Women and men';
  const minPrice = c => Math.min(...c.items.flatMap(i => [i.price, i.price2]).filter(v => v != null));
  const star = () => h('span', {}, icon('star'), h('span', { class: 'vh', text: 'Most popular' }));

  /* ---------- services list ---------- */
  function renderServices() {
    $('#svcList').replaceChildren(...site.menu.map(c => h('li', {},
      h('button', { class: 'svc', type: 'button', onclick: () => goToCategory(c.id), 'aria-label': `${c.name}, ${who(c.gender)}. Open in menu` },
        h('span', { class: 'svc-name', text: c.name }),
        h('span', { class: 'svc-who', text: who(c.gender) }),
        h('span', { class: 'svc-count', text: c.items.length + (c.items.length === 1 ? ' treatment' : ' treatments') }),
        h('span', { class: 'svc-from', text: 'from ' + inr(minPrice(c)) })))));
  }

  /* ---------- menu slider ---------- */
  let filter = 'all', idx = 0, cats = [];
  const slider = $('#slider'), tabs = $('#menuTabs'), prev = $('#prevSlide'), next = $('#nextSlide');
  prev.replaceChildren(icon('arrow-l')); next.replaceChildren(icon('arrow-r'));
  $('#legendStar').replaceChildren(icon('star'));

  function renderMenu(keepIdx) {
    cats = site.menu.filter(c => filter === 'all' || c.gender === 'all' || c.gender === filter);
    if (!keepIdx) idx = 0;
    idx = Math.min(idx, Math.max(0, cats.length - 1));
    tabs.replaceChildren(...cats.map((c, i) => h('button', {
      class: 'tab', role: 'tab', type: 'button', 'aria-selected': 'false', id: 'tab-' + c.id, onclick: () => goTo(i, true),
      text: c.name + (filter === 'all' && c.gender !== 'all' ? (c.gender === 'female' ? ' (women)' : ' (men)') : '')
    })));
    slider.replaceChildren(...cats.map((c, i) => {
      const two = c.priceLabels.length === 2;
      return h('article', { class: 'slide', 'aria-roledescription': 'slide', 'aria-label': `${c.name}, ${i + 1} of ${cats.length}` },
        h('div', { class: 'slide-head' }, h('h3', { text: c.name }), h('p', { text: who(c.gender) + (c.note ? '. ' + c.note + '.' : '') })),
        h('div', { class: 'slide-list' },
          c.priceLabels.length ? h('div', { class: 'ph', 'aria-hidden': 'true' }, c.priceLabels.map(l => h('span', { text: l }))) : null,
          c.items.map(it => h('div', { class: 'item' },
            h('div', { class: 'item-name' }, it.name, it.popular ? star() : null),
            it.desc ? h('div', { class: 'item-desc', text: it.desc }) : null,
            h('div', { class: 'prices' },
              h('span', { class: 'price' + (two ? '' : ''), text: inr(it.price) }),
              two ? h('span', { class: 'price' + (it.price2 == null ? ' none' : ''), text: it.price2 == null ? 'n/a' : inr(it.price2) }) : null)))));
    }));
    $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === filter));
    slider.scrollLeft = idx * slider.clientWidth;
    syncMenu();
  }
  function syncMenu() {
    $('#menuCount').textContent = cats.length ? `${idx + 1} of ${cats.length}` : '';
    $$('.tab', tabs).forEach((t, i) => { t.setAttribute('aria-selected', i === idx); if (i === idx && t.scrollIntoView) { const l = t.offsetLeft - 8; if (Math.abs(tabs.scrollLeft - l) > tabs.clientWidth * .6 || t.offsetLeft < tabs.scrollLeft || t.offsetLeft + t.offsetWidth > tabs.scrollLeft + tabs.clientWidth) tabs.scrollTo({ left: l, behavior: 'smooth' }); } });
    prev.disabled = idx <= 0; next.disabled = idx >= cats.length - 1;
    fitHeight();
  }
  function fitHeight() {
    const s = slider.children[idx];
    if (s) slider.style.height = s.offsetHeight + 'px';
  }
  function goTo(i, smooth) {
    idx = Math.max(0, Math.min(cats.length - 1, i));
    slider.scrollTo({ left: idx * slider.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    syncMenu();
  }
  let raf;
  slider.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { const i = Math.round(slider.scrollLeft / slider.clientWidth); if (i !== idx) { idx = i; syncMenu(); } });
  }, { passive: true });
  prev.addEventListener('click', () => goTo(idx - 1, true));
  next.addEventListener('click', () => goTo(idx + 1, true));
  slider.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1, true); } if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(idx - 1, true); } });
  window.addEventListener('resize', () => { slider.scrollLeft = idx * slider.clientWidth; fitHeight(); });
  $$('.seg button').forEach(b => b.addEventListener('click', () => { filter = b.dataset.g; renderMenu(false); }));
  function goToCategory(id) {
    let i = cats.findIndex(c => c.id === id);
    if (i < 0) { filter = 'all'; renderMenu(false); i = cats.findIndex(c => c.id === id); }
    $('#menu').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    goTo(i, false);
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
      const tiles = [['a', 'scissors'], ['b', 'comb'], ['c', 'mirror'], ['d', 'wave'], ['b', 'polish'], ['a', 'sparkle']];
      grid.replaceChildren(...tiles.map(([k, d]) => h('div', { class: 'ph-tile ' + k, 'aria-hidden': 'true' }, doodle(d))));
      return;
    }
    grid.replaceChildren(...site.gallery.map((g, i) => h('button', { type: 'button', 'aria-label': 'Open image' + (g.caption ? ': ' + g.caption : ''), onclick: () => { showLb(i); lb.showModal(); } },
      h('img', { src: g.src, alt: g.caption || '', loading: 'lazy' }))));
  }
  $('#lbClose').addEventListener('click', () => lb.close());
  $('#lbPrev').addEventListener('click', () => showLb(li - 1));
  $('#lbNext').addEventListener('click', () => showLb(li + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') showLb(li - 1); if (e.key === 'ArrowRight') showLb(li + 1); });

  /* ---------- team + about ---------- */
  $('#team').replaceChildren(...site.stylists.map(s => h('article', { class: 'person' },
    h('div', { class: 'pic' }, s.photo ? h('img', { src: s.photo, alt: s.name, loading: 'lazy' }) : doodle('scissors')),
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

  renderServices(); renderMenu(false); renderGallery();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeight);

  /* ---------- scroll reveal + hero parallax ---------- */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const targets = $$('.sec-head, .svc-list li, .gal > *, .team .person, .about-body, .panel, .facts > div');
    targets.forEach(el => el.classList.add('sr'));
    $$('.svc-list li').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 40, 400) + 'ms'; });
    $$('.gal > *').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 60, 300) + 'ms'; });
    $$('.team .person').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 80, 320) + 'ms'; });
    $$('.facts > div').forEach((el, i) => { el.style.transitionDelay = Math.min(i * 60, 240) + 'ms'; });

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('sr-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach(el => io.observe(el));

    const heroMark = $('.hero-mark');
    if (heroMark) {
      let ticking = false;
      addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          heroMark.style.transform = scrollY < 900 ? `translateY(${scrollY * 0.12}px)` : '';
          ticking = false;
        });
      }, { passive: true });
    }
  }
})();
