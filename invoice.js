(async function () {
  const sheet = $('#sheet');
  const token = location.pathname.split('/').pop();
  try {
    const r = await fetch('/api/invoice/' + encodeURIComponent(token));
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Invoice not found');
    const { invoice: v, salon: s } = d;
    document.title = 'Invoice ' + v.no + ', ' + s.salonName;
    const disc = v.discountAmt > 0 ? (v.discount.type === 'percent' ? `Discount (${v.discount.value}%)` : 'Discount') : null;
    sheet.replaceChildren(
      h('div', { class: 'inv-top' },
        h('div', { class: 'inv-brand' },
          h('img', { src: '/assets/logo-plum.png', alt: '' }),
          h('div', {}, h('strong', { text: s.salonName }), h('span', { text: s.address }),
            s.phone ? h('span', { text: s.phone }) : null)),
        h('div', { class: 'inv-title' }, h('h1', { text: 'Invoice' }), h('p', { text: v.no }))),
      h('dl', { class: 'inv-meta' },
        h('div', {}, h('dt', { text: 'Billed to' }), h('dd', { text: v.client.name }),
          v.client.phone ? h('dd', { text: v.client.phone }) : null),
        h('div', {}, h('dt', { text: 'Date' }), h('dd', { text: fmtDate(v.date, { day: 'numeric', month: 'long', year: 'numeric' }) }),
          v.servedBy ? [h('dt', { text: 'Served by' }), h('dd', { text: v.servedBy })] : null)),
      h('table', { class: 'inv-table' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Service' }), h('th', { class: 'n', text: 'Qty' }), h('th', { class: 'n', text: 'Rate' }), h('th', { class: 'n', text: 'Amount' }))),
        h('tbody', {}, v.items.map(i => h('tr', {}, h('td', { text: i.name }), h('td', { class: 'n', text: i.qty }), h('td', { class: 'n', text: inr(i.price) }), h('td', { class: 'n', text: inr(i.qty * i.price) }))))),
      h('div', { class: 'inv-totals' },
        h('div', {}, h('span', { text: 'Subtotal' }), h('span', { text: inr(v.subtotal) })),
        disc ? h('div', {}, h('span', { text: disc }), h('span', { text: '-' + inr(v.discountAmt) })) : null,
        h('div', { class: 'grand' }, h('span', { text: 'Total' }), h('span', { text: inr(v.total) }))),
      v.note ? h('p', { class: 'inv-note', text: v.note }) : null,
      h('div', { class: 'inv-foot' }, h('span', { text: s.invoiceFooter }), s.instagram ? h('span', { text: '@' + s.instagram }) : null),
      doodle('sparkle', 'no-print'));
    $('#actions').hidden = false;
    $('#printBtn').addEventListener('click', () => window.print());
  } catch (e) {
    sheet.replaceChildren(h('p', { class: 'inv-loading', text: e.message }));
  }
})();
