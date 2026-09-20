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
  document.title = 'Treatment menu, ' + S.salonName;
  const menuBtn = $('#menuBtn'), navOverlay = $('#navOverlay'), nav = $('#nav');
  const setMenu = open => {
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navOverlay.classList.toggle('open', open);
    navOverlay.setAttribute('aria-hidden', String(!open));
    document.documentElement.classList.toggle('nav-open', open);
  };
  setMenu(false);
  menuBtn.addEventListener('click', () => setMenu(!navOverlay.classList.contains('open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  navOverlay.addEventListener('click', e => { if (e.target === navOverlay) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && navOverlay.classList.contains('open')) setMenu(false); });
  $('#navOverlayClose').replaceChildren(icon('close'));
  $('#navOverlayClose').addEventListener('click', () => setMenu(false));

  const hdr = $('#hdr');
  const syncHdrScroll = () => hdr.classList.toggle('is-scrolled', scrollY > 8);
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
  if (!site.stylists.length) $('a[href="/#stylists"]', nav).hidden = true;

  const closed = (S.closedDays || []).map(d => DAYS[d]);
  const hoursText = fmt12(S.open) + ' to ' + fmt12(S.close);

  /* ---------- footer ---------- */
  $('#footContact').replaceChildren(
    h('p', {}, h('strong', { text: S.salonName }), h('br'), S.address,
      S.phone ? [h('br'), h('a', { href: 'tel:' + S.phone.replace(/[^\d+]/g, '') }, S.phone)] : null,
      S.email ? [h('br'), h('a', { href: 'mailto:' + S.email }, S.email)] : null,
      S.instagram ? [h('br'), h('a', { href: 'https://instagram.com/' + S.instagram, target: '_blank', rel: 'noopener' }, '@' + S.instagram)] : null));
  $('#footHours').replaceChildren(h('p', {}, h('span', { class: 'k', text: 'Hours' }), h('br'), hoursText, closed.length ? [h('br'), 'Closed on ' + closed.join(' and ')] : null));

  set('menuText', C.menuText);
  $('#menu .sec-head').append(doodle('sparkle', 'gold'));

  /* ---------- helpers ---------- */
  const who = g => g === 'female' ? 'Women' : g === 'male' ? 'Men' : 'Women and men';
  const star = () => h('span', {}, icon('star'), h('span', { class: 'vh', text: 'Most popular' }));

  /* ---------- pick services + continue to book ---------- */
  const PICK_KEY = 'ss_menu_picks';
  const picked = new Set();
  const pickCount = h('span', { class: 'menu-pickbar-count' });
  const pickLink = h('a', { class: 'btn btn-pill', href: '/#book', onclick: () => { try { sessionStorage.setItem(PICK_KEY, JSON.stringify([...picked])); } catch {} } }, 'Continue to book');
  const pickBar = h('div', { class: 'menu-pickbar', hidden: true }, pickCount, pickLink);
  document.body.append(pickBar);
  function syncPickBar() {
    pickBar.hidden = picked.size === 0;
    pickCount.textContent = picked.size + (picked.size === 1 ? ' service selected' : ' services selected');
  }
  const pickBtn = it => h('button', {
    type: 'button', class: 'item-pick', 'aria-pressed': picked.has(it.id),
    onclick: e => {
      if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id);
      const on = picked.has(it.id);
      e.currentTarget.setAttribute('aria-pressed', on);
      e.currentTarget.textContent = on ? 'Added' : 'Add';
      syncPickBar();
    }
  }, picked.has(it.id) ? 'Added' : 'Add');

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
              h('span', { class: 'price', text: inr(it.price) }),
              two ? h('span', { class: 'price' + (it.price2 == null ? ' none' : ''), text: it.price2 == null ? 'n/a' : inr(it.price2) }) : null),
            pickBtn(it)))));
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

  renderMenu(false);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeight);

  const wantCat = new URLSearchParams(location.search).get('cat');
  if (wantCat) { const i = cats.findIndex(c => c.id === wantCat); if (i >= 0) goTo(i, false); }
})();
