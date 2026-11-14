// Plain browser JavaScript: no build step, nothing extra to scan or deploy.
'use strict';

const $ = (sel) => document.querySelector(sel);
const money = (v) => Number(v).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') node.addEventListener('click', v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(String(c ?? '')));
  return node;
}

function show(msg, kind = 'ok') {
  const m = $('#message');
  m.textContent = msg;
  m.className = kind;
  if (kind === 'ok') setTimeout(() => { if (m.textContent === msg) m.textContent = ''; }, 3000);
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([data.error, ...(data.details ?? [])].filter(Boolean).join(' - ') || res.statusText);
  return data;
}

const run = (fn) => (...args) => fn(...args).catch((err) => show(err.message, 'error'));

// ---------- Tabs ----------
const loaders = {};
document.querySelectorAll('nav button').forEach((btn) =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== btn.dataset.tab));
    run(loaders[btn.dataset.tab])();
  }),
);

// ---------- Dashboard ----------
loaders.dashboard = async () => {
  const d = await api('/dashboard');
  $('#stat-products').textContent = d.products;
  $('#stat-customers').textContent = d.customers;
  $('#stat-orders').textContent = d.orders;
  $('#stat-revenue').textContent = money(d.revenue);
  $('#low-stock').replaceChildren(
    ...(d.low_stock.length
      ? d.low_stock.map((p) => el('tr', { class: 'low' }, el('td', {}, p.sku), el('td', {}, p.name), el('td', {}, p.stock_qty), el('td', {}, p.reorder_level)))
      : [el('tr', {}, el('td', { colspan: '4' }, 'All products are above their reorder level.'))]),
  );
};

// ---------- Products ----------
loaders.products = async () => {
  const rows = await api('/products');
  $('#product-rows').replaceChildren(
    ...rows.map((p) =>
      el('tr', { class: p.stock_qty <= p.reorder_level ? 'low' : '' },
        el('td', {}, p.sku), el('td', {}, p.name), el('td', {}, money(p.unit_price)),
        el('td', {}, p.stock_qty), el('td', {}, p.reorder_level),
        el('td', {},
          el('button', { class: 'btn secondary', onclick: run(async () => {
            const qty = Number(prompt(`Add stock to ${p.sku} (units received):`, '10'));
            if (!Number.isInteger(qty) || qty <= 0) return;
            await api(`/products/${p.id}`, { method: 'PUT', body: { ...p, unit_price: Number(p.unit_price), stock_qty: p.stock_qty + qty } });
            show(`Received ${qty} x ${p.sku}`);
            await loaders.products();
          }) }, '+ Stock'),
          ' ',
          el('button', { class: 'btn danger', onclick: run(async () => {
            await api(`/products/${p.id}`, { method: 'DELETE' });
            show(`Deleted ${p.sku}`);
            await loaders.products();
          }) }, 'Delete'))),
    ),
  );
};

$('#product-form').addEventListener('submit', run(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api('/products', { method: 'POST', body: {
    sku: f.get('sku'), name: f.get('name'), unit_price: Number(f.get('unit_price')),
    stock_qty: Number(f.get('stock_qty')), reorder_level: Number(f.get('reorder_level')),
  } });
  e.target.reset();
  show('Product added');
  await loaders.products();
}));

// ---------- Customers ----------
loaders.customers = async () => {
  const rows = await api('/customers');
  $('#customer-rows').replaceChildren(
    ...rows.map((c) => el('tr', {}, el('td', {}, c.name), el('td', {}, c.email ?? ''), el('td', {}, c.phone ?? ''),
      el('td', {}, el('button', { class: 'btn danger', onclick: run(async () => {
        await api(`/customers/${c.id}`, { method: 'DELETE' });
        show(`Deleted ${c.name}`);
        await loaders.customers();
      }) }, 'Delete')))),
  );
};

$('#customer-form').addEventListener('submit', run(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api('/customers', { method: 'POST', body: {
    name: f.get('name'), email: f.get('email') || null, phone: f.get('phone') || null,
  } });
  e.target.reset();
  show('Customer added');
  await loaders.customers();
}));

// ---------- Orders ----------
loaders.orders = async () => {
  const [orders, customers, products] = await Promise.all([api('/orders'), api('/customers'), api('/products')]);
  $('#order-customer').replaceChildren(...customers.map((c) => el('option', { value: c.id }, c.name)));
  $('#order-product').replaceChildren(...products.map((p) => el('option', { value: p.id }, `${p.sku} - ${p.name} (${p.stock_qty} in stock)`)));

  const nextStatus = { NEW: 'CONFIRMED', CONFIRMED: 'SHIPPED' };
  $('#order-rows').replaceChildren(
    ...orders.map((o) => el('tr', {},
      el('td', {}, o.id), el('td', {}, o.customer_name), el('td', {}, o.line_count), el('td', {}, money(o.total_amount)),
      el('td', {}, el('span', { class: `badge ${o.status}` }, o.status)),
      el('td', {}, new Date(o.created_at).toLocaleString()),
      el('td', {},
        nextStatus[o.status] ? el('button', { class: 'btn secondary', onclick: run(async () => {
          await api(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: nextStatus[o.status] } });
          await loaders.orders();
        }) }, `Mark ${nextStatus[o.status].toLowerCase()}`) : '',
        ' ',
        ['NEW', 'CONFIRMED'].includes(o.status) ? el('button', { class: 'btn danger', onclick: run(async () => {
          await api(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: 'CANCELLED' } });
          show(`Order #${o.id} cancelled, stock returned`);
          await loaders.orders();
        }) }, 'Cancel') : ''))),
  );
};

$('#order-form').addEventListener('submit', run(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const order = await api('/orders', { method: 'POST', body: {
    customer_id: Number(f.get('customer_id')),
    items: [{ product_id: Number(f.get('product_id')), quantity: Number(f.get('quantity')) }],
  } });
  show(`Order #${order.id} created - total ${money(order.total_amount)}`);
  await loaders.orders();
}));

// ---------- Start ----------
fetch('/health').then((r) => r.json()).then((h) => { $('#version').textContent = `version ${h.version}`; }).catch(() => {});
run(loaders.dashboard)();
