/* ═══════════════════════════════════════════════════════════
   AangERP – Manufacturing System  |  app.js
   All data stored in localStorage. No server required.
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── Helpers ───────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function fmt(n) {
  if (n === undefined || n === null || n === '') return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

function badge(val) {
  const key = (val || '').toLowerCase().replace(/\s+/g, '-');
  return `<span class="badge b-${key}">${val}</span>`;
}

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => { t.className = 'toast hidden'; }, 3000);
}

/* ── LocalStorage DB ────────────────────────────────────── */
const DB = {
  get: key => JSON.parse(localStorage.getItem('erp_' + key) || '[]'),
  set: (key, val) => localStorage.setItem('erp_' + key, JSON.stringify(val)),
  getObj: key => JSON.parse(localStorage.getItem('erp_obj_' + key) || 'null'),
  setObj: (key, val) => localStorage.setItem('erp_obj_' + key, JSON.stringify(val)),
};

/* ── Auth ──────────────────────────────────────────────── */
let currentUser = null;

function getUsers() { return DB.getObj('users') || {}; }
function saveUsers(u) { DB.setObj('users', u); }

$('go-register').addEventListener('click', e => {
  e.preventDefault();
  $('login-screen').classList.add('hidden');
  $('register-screen').classList.remove('hidden');
});

$('go-login').addEventListener('click', e => {
  e.preventDefault();
  $('register-screen').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
});

$('btn-login').addEventListener('click', doLogin);
$('login-code').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  const code = $('login-code').value.trim().toUpperCase();
  const errEl = $('login-error');
  if (!code) { errEl.textContent = 'Please enter your user code.'; errEl.classList.remove('hidden'); return; }
  const users = getUsers();
  if (!users[code]) {
    errEl.textContent = 'User code not found. Please register first.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  currentUser = users[code];
  launchApp();
}

$('btn-register').addEventListener('click', doRegister);
$('reg-code').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

function doRegister() {
  const name = $('reg-name').value.trim();
  const code = $('reg-code').value.trim().toUpperCase();
  const role = $('reg-role').value;
  const errEl = $('reg-error');

  if (!name) { errEl.textContent = 'Full name is required.'; errEl.classList.remove('hidden'); return; }
  if (!code || !/^[A-Z0-9_-]{3,20}$/.test(code)) {
    errEl.textContent = 'User code must be 3–20 alphanumeric characters.';
    errEl.classList.remove('hidden');
    return;
  }
  const users = getUsers();
  if (users[code]) { errEl.textContent = 'That user code is already taken.'; errEl.classList.remove('hidden'); return; }

  users[code] = { name, code, role };
  saveUsers(users);
  errEl.classList.add('hidden');
  showToast('Account created! Please login.');
  $('register-screen').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  $('login-code').value = code;
}

$('btn-logout').addEventListener('click', () => {
  currentUser = null;
  $('app-screen').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  $('login-code').value = '';
  $('login-error').classList.add('hidden');
});

function launchApp() {
  $('login-screen').classList.add('hidden');
  $('register-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  $('su-name').textContent = currentUser.name;
  $('su-role').textContent = currentUser.role;
  $('tb-user').textContent = currentUser.name;
  updateClock();
  setInterval(updateClock, 1000);
  seedDemoData();
  switchModule('dashboard');
}

function updateClock() {
  const reportDate = new Date();
  $('tb-time').textContent = now.toLocaleString('id-ID', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

/* ── Navigation ────────────────────────────────────────── */
const moduleNames = {
  dashboard:   'Dashboard',
  ap:          'Accounts Payable',
  ar:          'Accounts Receivable',
  gl:          'General Ledger',
  tax:         'Tax',
  finance:     'Finance',
  procurement: 'Procurement',
  receiving:   'Receiving',
  delivery:    'Delivery',
  products:    'Product Inventory',
  inventory:   'Inventory Management',
  marketing:   'Marketing',
  hr:          'Human Resources',
  reports:     'Reports',
};

document.querySelectorAll('.nav-item').forEach(li => {
  li.addEventListener('click', () => switchModule(li.dataset.mod));
});

function switchModule(mod) {
  document.querySelectorAll('.nav-item').forEach(li => li.classList.remove('active'));
  const li = document.querySelector(`.nav-item[data-mod="${mod}"]`);
  if (li) li.classList.add('active');

  document.querySelectorAll('.panel').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  const panel = $('mod-' + mod);
  if (panel) {
    panel.classList.remove('hidden');
    panel.classList.add('active');
  }

  $('breadcrumb').textContent = moduleNames[mod] || mod;

  const renders = {
    dashboard:   renderDashboard,
    ap:          renderAP,
    ar:          renderAR,
    gl:          renderGL,
    tax:         renderTax,
    finance:     renderFin,
    procurement: renderPO,
    receiving:   renderRecv,
    delivery:    renderDel,
    products:    renderProducts,
    inventory:   renderInv,
    marketing:   renderMkt,
    hr:          renderHR,
  };
  if (renders[mod]) renders[mod]();
}

/* ── Modal helpers ─────────────────────────────────────── */
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});

document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});

/* ── Confirm delete ────────────────────────────────────── */
function confirmDelete(msg, onYes) {
  $('confirm-msg').textContent = msg;
  $('confirm-yes').onclick = () => { onYes(); closeModal('m-confirm'); };
  openModal('m-confirm');
}

/* ═══════════════════════════════════════════════════════════
   DEMO SEED DATA
═══════════════════════════════════════════════════════════ */
function seedDemoData() {
  if (DB.getObj('seeded')) return;

  DB.set('ap', [
    { id: uid(), no: 'INV-2024-001', vendor: 'PT. Bahan Baku Nusantara', date: '2024-01-05', due: '2024-02-05', amount: 15000000, status: 'paid',    desc: 'Raw material purchase' },
    { id: uid(), no: 'INV-2024-002', vendor: 'CV. Suku Cadang Jaya',     date: '2024-02-10', due: '2024-03-10', amount:  8500000, status: 'pending', desc: 'Spare parts order' },
    { id: uid(), no: 'INV-2024-003', vendor: 'PT. Logistik Maju',        date: '2024-01-20', due: '2024-01-30', amount:  3200000, status: 'overdue', desc: 'Freight charges' },
  ]);

  DB.set('ar', [
    { id: uid(), no: 'SINV-2024-001', customer: 'PT. Retail Abadi',    date: '2024-01-08', due: '2024-02-08', amount: 22000000, status: 'paid',    desc: 'Product sale batch #1' },
    { id: uid(), no: 'SINV-2024-002', customer: 'CV. Distribusi Prima', date: '2024-02-14', due: '2024-03-14', amount: 18500000, status: 'pending', desc: 'Monthly supply contract' },
    { id: uid(), no: 'SINV-2024-003', customer: 'Toko Serba Ada',       date: '2024-01-25', due: '2024-02-05', amount:  5700000, status: 'overdue', desc: 'Small retail order' },
  ]);

  DB.set('gl', [
    { id: uid(), no: 'JE-001', date: '2024-01-01', account: 'Cash & Bank',        desc: 'Opening balance',          type: 'credit', debit: 0,         credit: 50000000, ref: 'Opening' },
    { id: uid(), no: 'JE-002', date: '2024-01-05', account: 'Accounts Payable',   desc: 'Vendor invoice INV-001',   type: 'debit',  debit: 15000000,  credit: 0,        ref: 'INV-2024-001' },
    { id: uid(), no: 'JE-003', date: '2024-01-08', account: 'Accounts Receivable',desc: 'Sales SINV-001',           type: 'debit',  debit: 22000000,  credit: 0,        ref: 'SINV-2024-001' },
    { id: uid(), no: 'JE-004', date: '2024-02-01', account: 'Operating Expenses', desc: 'Office rent Feb',          type: 'debit',  debit: 5000000,   credit: 0,        ref: 'RENT-FEB' },
  ]);

  DB.set('tax', [
    { id: uid(), code: 'PPN-11',  desc: 'Pajak Pertambahan Nilai 11%',       rate: 11,   type: 'output' },
    { id: uid(), code: 'PPN-IN',  desc: 'Input Tax (VAT Paid to Vendors)',   rate: 11,   type: 'input' },
    { id: uid(), code: 'PPh-23',  desc: 'Withholding Tax Income Art. 23',    rate: 2,    type: 'withholding' },
    { id: uid(), code: 'PPh-21',  desc: 'Employee Income Tax Art. 21',       rate: 5,    type: 'withholding' },
  ]);

  DB.set('finance', [
    { id: uid(), date: '2024-01-08', type: 'income',  cat: 'sales',   desc: 'Product sales Jan batch',        amount: 22000000 },
    { id: uid(), date: '2024-01-20', type: 'income',  cat: 'service', desc: 'Maintenance service fee',        amount:  3500000 },
    { id: uid(), date: '2024-01-05', type: 'expense', cat: 'cogs',    desc: 'Raw material cost',              amount: 15000000 },
    { id: uid(), date: '2024-02-01', type: 'expense', cat: 'opex',    desc: 'Office rent February',           amount:  5000000 },
    { id: uid(), date: '2024-02-10', type: 'expense', cat: 'opex',    desc: 'Utilities electricity & water',  amount:  1200000 },
  ]);

  DB.set('po', [
    { id: uid(), no: 'PO-2024-001', vendor: 'PT. Bahan Baku Nusantara', date: '2024-01-03', items: '500 kg Aluminium Sheet',   total: 15000000, status: 'received',  notes: 'Urgent order' },
    { id: uid(), no: 'PO-2024-002', vendor: 'CV. Suku Cadang Jaya',     date: '2024-02-08', items: '10 pcs Bearing Set',       total:  8500000, status: 'approved',  notes: '' },
    { id: uid(), no: 'PO-2024-003', vendor: 'PT. Kemasan Mandiri',      date: '2024-02-20', items: '1000 pcs Packaging Box',   total:  2300000, status: 'draft',     notes: 'Monthly packaging' },
  ]);

  DB.set('recv', [
    { id: uid(), no: 'GR-2024-001', po: 'PO-2024-001', vendor: 'PT. Bahan Baku Nusantara', date: '2024-01-06', items: '500 kg Aluminium Sheet',  status: 'complete' },
    { id: uid(), no: 'GR-2024-002', po: 'PO-2024-002', vendor: 'CV. Suku Cadang Jaya',     date: '2024-02-12', items: '8 pcs Bearing Set',         status: 'partial' },
  ]);

  DB.set('del', [
    { id: uid(), no: 'SHP-2024-001', customer: 'PT. Retail Abadi',    ref: 'ORD-2024-001', date: '2024-01-09', dest: 'Jakarta',   status: 'delivered' },
    { id: uid(), no: 'SHP-2024-002', customer: 'CV. Distribusi Prima', ref: 'ORD-2024-002', date: '2024-02-15', dest: 'Surabaya',  status: 'in-transit' },
    { id: uid(), no: 'SHP-2024-003', customer: 'Toko Serba Ada',       ref: 'ORD-2024-003', date: '2024-02-22', dest: 'Bandung',   status: 'pending' },
  ]);

  DB.set('products', [
    { id: uid(), code: 'PRD-001', name: 'Aluminium Sheet 2mm',    cat: 'raw',      unit: 'kg',   price: 30000,  stock: 450,  reorder: 100, wh: 'Gudang A' },
    { id: uid(), code: 'PRD-002', name: 'Bearing Set SKF-6205',   cat: 'spare',    unit: 'pcs',  price: 850000, stock: 8,    reorder: 15,  wh: 'Gudang A' },
    { id: uid(), code: 'PRD-003', name: 'Widget Finished A',      cat: 'finished', unit: 'pcs',  price: 125000, stock: 230,  reorder: 50,  wh: 'Gudang B' },
    { id: uid(), code: 'PRD-004', name: 'Component WIP-X',        cat: 'wip',      unit: 'pcs',  price: 60000,  stock: 85,   reorder: 30,  wh: 'Gudang B' },
    { id: uid(), code: 'PRD-005', name: 'Packaging Box Medium',   cat: 'spare',    unit: 'pcs',  price: 2300,   stock: 900,  reorder: 200, wh: 'Gudang C' },
  ]);

  DB.set('inv', [
    { id: uid(), date: '2024-01-06', product: 'Aluminium Sheet 2mm',  wh: 'Gudang A', type: 'in',  qty: 500, ref: 'GR-2024-001' },
    { id: uid(), date: '2024-01-10', product: 'Widget Finished A',    wh: 'Gudang B', type: 'out', qty: 120, ref: 'SHP-2024-001' },
    { id: uid(), date: '2024-02-12', product: 'Bearing Set SKF-6205', wh: 'Gudang A', type: 'in',  qty: 8,   ref: 'GR-2024-002' },
    { id: uid(), date: '2024-02-18', product: 'Packaging Box Medium', wh: 'Gudang C', type: 'adjustment', qty: 900, ref: 'ADJ-001' },
  ]);

  DB.set('mkt', [
    { id: uid(), name: 'Promo Ramadan 2024',     type: 'digital', start: '2024-03-01', end: '2024-04-10', budget: 15000000, leads: 320, status: 'completed' },
    { id: uid(), name: 'Trade Expo Jakarta',      type: 'event',   start: '2024-04-15', end: '2024-04-17', budget: 30000000, leads: 150, status: 'planned' },
    { id: uid(), name: 'Social Media Q2',         type: 'social',  start: '2024-04-01', end: '2024-06-30', budget: 8000000,  leads: 200, status: 'active' },
  ]);

  DB.set('hr', [
    { id: uid(), empid: 'EMP-001', name: 'Budi Santoso',   dept: 'Finance',     pos: 'Finance Manager',    join: '2019-03-01', salary: 15000000, status: 'active' },
    { id: uid(), empid: 'EMP-002', name: 'Siti Rahayu',    dept: 'Operations',  pos: 'Production Supervisor', join: '2020-07-15', salary: 10000000, status: 'active' },
    { id: uid(), empid: 'EMP-003', name: 'Ahmad Fauzi',    dept: 'Marketing',   pos: 'Marketing Specialist',  join: '2021-01-10', salary: 8500000,  status: 'active' },
    { id: uid(), empid: 'EMP-004', name: 'Dewi Kartika',   dept: 'Procurement', pos: 'Procurement Officer',   join: '2022-05-20', salary: 7000000,  status: 'active' },
    { id: uid(), empid: 'EMP-005', name: 'Eko Prasetyo',   dept: 'Warehouse',   pos: 'Warehouse Staff',       join: '2023-02-01', salary: 5500000,  status: 'probation' },
  ]);

  DB.setObj('seeded', true);
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════ */
function renderDashboard() {
  $('dash-date').textContent = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const ap = DB.get('ap');
  const ar = DB.get('ar');
  const fin = DB.get('finance');
  const hr  = DB.get('hr');
  const prods = DB.get('products');

  const apPending = ap.filter(r => r.status === 'pending' || r.status === 'overdue').reduce((s, r) => s + Number(r.amount), 0);
  const arPending = ar.filter(r => r.status === 'pending' || r.status === 'overdue').reduce((s, r) => s + Number(r.amount), 0);
  const revenue   = fin.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
  const expenses  = fin.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0);

  const kpis = [
    { icon:'💸', val: fmt(apPending),         lbl: 'AP Outstanding',    trend: ap.filter(r=>r.status==='overdue').length + ' overdue', down: ap.some(r=>r.status==='overdue') },
    { icon:'💰', val: fmt(arPending),         lbl: 'AR Outstanding',    trend: ar.filter(r=>r.status==='overdue').length + ' overdue', down: ar.some(r=>r.status==='overdue') },
    { icon:'📊', val: fmt(revenue - expenses), lbl: 'Net Profit',       trend: 'Revenue: ' + fmt(revenue), down: revenue < expenses },
    { icon:'👥', val: hr.filter(r=>r.status==='active').length, lbl: 'Active Employees', trend: hr.length + ' total' },
  ];

  $('kpi-row').innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="ki">${k.icon}</div>
      <div class="kv">${k.val}</div>
      <div class="kl">${k.lbl}</div>
      <div class="kt${k.down ? ' down' : ''}">${k.trend}</div>
    </div>
  `).join('');

  // Recent transactions (last 5 from AP + AR combined)
  const recent = [
    ...ap.map(r => ({ date: r.date, mod: 'AP', desc: r.vendor + ' – ' + r.no, amount: r.amount, status: r.status })),
    ...ar.map(r => ({ date: r.date, mod: 'AR', desc: r.customer + ' – ' + r.no, amount: r.amount, status: r.status })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  $('dash-recent').innerHTML = recent.length ? recent.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.mod}</td>
      <td>${r.desc}</td>
      <td>${fmt(r.amount)}</td>
      <td>${badge(r.status)}</td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="5">No transactions yet.</td></tr>';

  // Module summary
  const summary = [
    { icon:'💸', mod:'Accounts Payable',   cnt: ap.length,            lbl: 'invoices' },
    { icon:'💰', mod:'Accounts Receivable',cnt: ar.length,            lbl: 'invoices' },
    { icon:'🛒', mod:'Procurement',        cnt: DB.get('po').length,  lbl: 'purchase orders' },
    { icon:'📦', mod:'Receiving',          cnt: DB.get('recv').length,lbl: 'receipts' },
    { icon:'🚚', mod:'Delivery',           cnt: DB.get('del').length, lbl: 'shipments' },
    { icon:'🏭', mod:'Products',           cnt: prods.length,         lbl: 'SKUs' },
    { icon:'📣', mod:'Marketing',          cnt: DB.get('mkt').length, lbl: 'campaigns' },
    { icon:'👥', mod:'HR',                 cnt: hr.length,            lbl: 'employees' },
  ];

  $('dash-summary').innerHTML = summary.map(s => `
    <div class="ai">
      <div class="ai-ic">${s.icon}</div>
      <div>
        <div class="ai-mod">${s.mod}</div>
        <div class="ai-cnt">${s.cnt} <span class="ai-lbl">${s.lbl}</span></div>
      </div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   ACCOUNTS PAYABLE
═══════════════════════════════════════════════════════════ */
function renderAP() {
  const q  = ($('ap-q')  || {value:''}).value.toLowerCase();
  const sf = ($('ap-sf') || {value:''}).value;
  const data = DB.get('ap').filter(r =>
    (!q  || r.no.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q)) &&
    (!sf || r.status === sf)
  );
  $('ap-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.vendor}</td>
      <td>${r.date}</td>
      <td>${fmt(r.amount)}</td>
      <td>${r.due}</td>
      <td>${badge(r.status)}</td>
      <td>
        ${r.status !== 'paid' ? `<button class="btn-xs btn-pay" onclick="markPaid('ap','${r.id}')">Pay</button> ` : ''}
        <button class="btn-xs btn-edit" onclick="editAP('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('ap','${r.id}',renderAP)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="7">No records found.</td></tr>';
}

function openAPForm(rec) {
  $('m-ap-title').textContent = rec ? 'Edit Vendor Invoice' : 'New Vendor Invoice';
  $('ap-no').value     = rec ? rec.no     : '';
  $('ap-vendor').value = rec ? rec.vendor : '';
  $('ap-date').value   = rec ? rec.date   : today();
  $('ap-due').value    = rec ? rec.due    : '';
  $('ap-amount').value = rec ? rec.amount : '';
  $('ap-status').value = rec ? rec.status : 'pending';
  $('ap-desc').value   = rec ? rec.desc   : '';
  $('ap-eid').value    = rec ? rec.id     : '';
  openModal('m-ap');
}

function saveAP() {
  const no     = $('ap-no').value.trim();
  const vendor = $('ap-vendor').value.trim();
  const amount = parseFloat($('ap-amount').value);
  if (!no || !vendor || isNaN(amount)) { showToast('Invoice #, vendor and amount are required.', 'error'); return; }

  const rec = {
    id:     $('ap-eid').value || uid(),
    no, vendor,
    date:   $('ap-date').value,
    due:    $('ap-due').value,
    amount,
    status: $('ap-status').value,
    desc:   $('ap-desc').value.trim(),
  };

  const data = DB.get('ap');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('ap', data);
  closeModal('m-ap');
  showToast(idx >= 0 ? 'Invoice updated.' : 'Invoice added.');
  renderAP();
}

function editAP(id) {
  const rec = DB.get('ap').find(r => r.id === id);
  if (rec) openAPForm(rec);
}

function markPaid(module, id) {
  const data = DB.get(module);
  const rec  = data.find(r => r.id === id);
  if (rec) { rec.status = 'paid'; DB.set(module, data); module === 'ap' ? renderAP() : renderAR(); showToast('Marked as paid.'); }
}

/* ═══════════════════════════════════════════════════════════
   ACCOUNTS RECEIVABLE
═══════════════════════════════════════════════════════════ */
function renderAR() {
  const q  = ($('ar-q')  || {value:''}).value.toLowerCase();
  const sf = ($('ar-sf') || {value:''}).value;
  const data = DB.get('ar').filter(r =>
    (!q  || r.no.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q)) &&
    (!sf || r.status === sf)
  );
  $('ar-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.customer}</td>
      <td>${r.date}</td>
      <td>${fmt(r.amount)}</td>
      <td>${r.due}</td>
      <td>${badge(r.status)}</td>
      <td>
        ${r.status !== 'paid' ? `<button class="btn-xs btn-pay" onclick="markPaid('ar','${r.id}')">Receive</button> ` : ''}
        <button class="btn-xs btn-edit" onclick="editAR('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('ar','${r.id}',renderAR)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="7">No records found.</td></tr>';
}

function openARForm(rec) {
  $('m-ar-title').textContent = rec ? 'Edit Customer Invoice' : 'New Customer Invoice';
  $('ar-no').value       = rec ? rec.no       : '';
  $('ar-customer').value = rec ? rec.customer : '';
  $('ar-date').value     = rec ? rec.date     : today();
  $('ar-due').value      = rec ? rec.due      : '';
  $('ar-amount').value   = rec ? rec.amount   : '';
  $('ar-status').value   = rec ? rec.status   : 'pending';
  $('ar-desc').value     = rec ? rec.desc     : '';
  $('ar-eid').value      = rec ? rec.id       : '';
  openModal('m-ar');
}

function saveAR() {
  const no       = $('ar-no').value.trim();
  const customer = $('ar-customer').value.trim();
  const amount   = parseFloat($('ar-amount').value);
  if (!no || !customer || isNaN(amount)) { showToast('Invoice #, customer and amount are required.', 'error'); return; }

  const rec = {
    id:       $('ar-eid').value || uid(),
    no, customer,
    date:     $('ar-date').value,
    due:      $('ar-due').value,
    amount,
    status:   $('ar-status').value,
    desc:     $('ar-desc').value.trim(),
  };

  const data = DB.get('ar');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('ar', data);
  closeModal('m-ar');
  showToast(idx >= 0 ? 'Invoice updated.' : 'Invoice added.');
  renderAR();
}

function editAR(id) {
  const rec = DB.get('ar').find(r => r.id === id);
  if (rec) openARForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   GENERAL LEDGER
═══════════════════════════════════════════════════════════ */
function renderGL() {
  const q  = ($('gl-q')  || {value:''}).value.toLowerCase();
  const tf = ($('gl-tf') || {value:''}).value;
  const data = DB.get('gl').filter(r =>
    (!q  || r.no.toLowerCase().includes(q) || r.account.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)) &&
    (!tf || r.type === tf)
  );
  $('gl-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.date}</td>
      <td>${r.account}</td>
      <td>${r.desc}</td>
      <td>${r.debit ? fmt(r.debit) : '—'}</td>
      <td>${r.credit ? fmt(r.credit) : '—'}</td>
      <td>${r.ref}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editGL('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('gl','${r.id}',renderGL)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="8">No entries found.</td></tr>';
}

function openGLForm(rec) {
  $('m-gl-title').textContent = rec ? 'Edit Journal Entry' : 'New Journal Entry';
  $('gl-no').value      = rec ? rec.no      : '';
  $('gl-date').value    = rec ? rec.date    : today();
  $('gl-account').value = rec ? rec.account : '';
  $('gl-type').value    = rec ? rec.type    : 'debit';
  $('gl-debit').value   = rec ? rec.debit   : 0;
  $('gl-credit').value  = rec ? rec.credit  : 0;
  $('gl-ref').value     = rec ? rec.ref     : '';
  $('gl-desc').value    = rec ? rec.desc    : '';
  $('gl-eid').value     = rec ? rec.id      : '';
  openModal('m-gl');
}

function saveGL() {
  const no      = $('gl-no').value.trim();
  const account = $('gl-account').value.trim();
  if (!no || !account) { showToast('Entry # and Account are required.', 'error'); return; }

  const rec = {
    id:      $('gl-eid').value || uid(),
    no, account,
    date:    $('gl-date').value,
    type:    $('gl-type').value,
    debit:   parseFloat($('gl-debit').value) || 0,
    credit:  parseFloat($('gl-credit').value) || 0,
    ref:     $('gl-ref').value.trim(),
    desc:    $('gl-desc').value.trim(),
  };

  const data = DB.get('gl');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('gl', data);
  closeModal('m-gl');
  showToast(idx >= 0 ? 'Entry updated.' : 'Entry added.');
  renderGL();
}

function editGL(id) {
  const rec = DB.get('gl').find(r => r.id === id);
  if (rec) openGLForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   TAX
═══════════════════════════════════════════════════════════ */
function renderTax() {
  const data = DB.get('tax');
  const ar   = DB.get('ar');
  const ap   = DB.get('ap');

  const totalAR  = ar.reduce((s, r) => s + Number(r.amount), 0);
  const totalAP  = ap.reduce((s, r) => s + Number(r.amount), 0);
  const outRate  = data.filter(t => t.type === 'output').reduce((s, t) => s + Number(t.rate), 0);
  const inpRate  = data.filter(t => t.type === 'input').reduce((s, t) => s + Number(t.rate), 0);
  const vatOut   = totalAR  * (outRate / 100);
  const vatIn    = totalAP  * (inpRate / 100);
  const net      = vatOut - vatIn;

  $('tax-vat').textContent   = fmt(vatOut);
  $('tax-input').textContent = fmt(vatIn);
  $('tax-net').textContent   = fmt(net);

  $('tax-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td><strong>${r.code}</strong></td>
      <td>${r.desc}</td>
      <td>${r.rate}%</td>
      <td>${badge(r.type)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editTax('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('tax','${r.id}',renderTax)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="5">No tax codes found.</td></tr>';
}

function openTaxForm(rec) {
  $('m-tax-title').textContent = rec ? 'Edit Tax Code' : 'New Tax Code';
  $('tax-code').value = rec ? rec.code : '';
  $('tax-desc').value = rec ? rec.desc : '';
  $('tax-rate').value = rec ? rec.rate : '';
  $('tax-type').value = rec ? rec.type : 'output';
  $('tax-eid').value  = rec ? rec.id   : '';
  openModal('m-tax');
}

function saveTax() {
  const code = $('tax-code').value.trim().toUpperCase();
  const rate = parseFloat($('tax-rate').value);
  if (!code || isNaN(rate)) { showToast('Code and rate are required.', 'error'); return; }

  const rec = {
    id:   $('tax-eid').value || uid(),
    code,
    desc: $('tax-desc').value.trim(),
    rate,
    type: $('tax-type').value,
  };

  const data = DB.get('tax');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.push(rec);
  DB.set('tax', data);
  closeModal('m-tax');
  showToast(idx >= 0 ? 'Tax code updated.' : 'Tax code added.');
  renderTax();
}

function editTax(id) {
  const rec = DB.get('tax').find(r => r.id === id);
  if (rec) openTaxForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   FINANCE
═══════════════════════════════════════════════════════════ */
const FIN_BUDGET = 100000000;

function renderFin() {
  const data    = DB.get('finance');
  const revenue = data.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
  const expense = data.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
  const profit  = revenue - expense;

  $('fin-rev').textContent    = fmt(revenue);
  $('fin-exp').textContent    = fmt(expense);
  $('fin-profit').textContent = fmt(profit);
  $('fin-budget').textContent = fmt(FIN_BUDGET - expense);

  $('fin-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.cat}</td>
      <td>${r.desc}</td>
      <td>${badge(r.type)}</td>
      <td>${fmt(r.amount)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editFin('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('finance','${r.id}',renderFin)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="6">No finance entries.</td></tr>';
}

function openFinForm(rec) {
  $('m-fin-title').textContent = rec ? 'Edit Finance Entry' : 'New Finance Entry';
  $('fin-date').value   = rec ? rec.date   : today();
  $('fin-type').value   = rec ? rec.type   : 'income';
  $('fin-cat').value    = rec ? rec.cat    : 'sales';
  $('fin-amount').value = rec ? rec.amount : '';
  $('fin-desc').value   = rec ? rec.desc   : '';
  $('fin-eid').value    = rec ? rec.id     : '';
  openModal('m-fin');
}

function saveFin() {
  const amount = parseFloat($('fin-amount').value);
  const desc   = $('fin-desc').value.trim();
  if (isNaN(amount) || !desc) { showToast('Amount and description are required.', 'error'); return; }

  const rec = {
    id:     $('fin-eid').value || uid(),
    date:   $('fin-date').value,
    type:   $('fin-type').value,
    cat:    $('fin-cat').value,
    amount, desc,
  };

  const data = DB.get('finance');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('finance', data);
  closeModal('m-fin');
  showToast(idx >= 0 ? 'Entry updated.' : 'Entry added.');
  renderFin();
}

function editFin(id) {
  const rec = DB.get('finance').find(r => r.id === id);
  if (rec) openFinForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   PROCUREMENT
═══════════════════════════════════════════════════════════ */
function renderPO() {
  const q  = ($('po-q')  || {value:''}).value.toLowerCase();
  const sf = ($('po-sf') || {value:''}).value;
  const data = DB.get('po').filter(r =>
    (!q  || r.no.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q)) &&
    (!sf || r.status === sf)
  );
  $('po-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.vendor}</td>
      <td>${r.date}</td>
      <td>${r.items}</td>
      <td>${fmt(r.total)}</td>
      <td>${badge(r.status)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editPO('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('po','${r.id}',renderPO)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="7">No purchase orders found.</td></tr>';
}

function openPOForm(rec) {
  $('m-po-title').textContent = rec ? 'Edit Purchase Order' : 'New Purchase Order';
  $('po-no').value     = rec ? rec.no     : '';
  $('po-vendor').value = rec ? rec.vendor : '';
  $('po-date').value   = rec ? rec.date   : today();
  $('po-status').value = rec ? rec.status : 'draft';
  $('po-items').value  = rec ? rec.items  : '';
  $('po-total').value  = rec ? rec.total  : '';
  $('po-notes').value  = rec ? rec.notes  : '';
  $('po-eid').value    = rec ? rec.id     : '';
  openModal('m-po');
}

function savePO() {
  const no     = $('po-no').value.trim();
  const vendor = $('po-vendor').value.trim();
  const total  = parseFloat($('po-total').value);
  if (!no || !vendor || isNaN(total)) { showToast('PO #, vendor and total are required.', 'error'); return; }

  const rec = {
    id:     $('po-eid').value || uid(),
    no, vendor,
    date:   $('po-date').value,
    status: $('po-status').value,
    items:  $('po-items').value.trim(),
    total,
    notes:  $('po-notes').value.trim(),
  };

  const data = DB.get('po');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('po', data);
  closeModal('m-po');
  showToast(idx >= 0 ? 'PO updated.' : 'PO added.');
  renderPO();
}

function editPO(id) {
  const rec = DB.get('po').find(r => r.id === id);
  if (rec) openPOForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   RECEIVING
═══════════════════════════════════════════════════════════ */
function renderRecv() {
  const data = DB.get('recv');
  $('recv-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.po}</td>
      <td>${r.vendor}</td>
      <td>${r.date}</td>
      <td>${r.items}</td>
      <td>${badge(r.status)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editRecv('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('recv','${r.id}',renderRecv)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="7">No receipts found.</td></tr>';
}

function openRecvForm(rec) {
  $('m-recv-title').textContent = rec ? 'Edit Goods Receipt' : 'New Goods Receipt';
  $('recv-no').value     = rec ? rec.no     : '';
  $('recv-po').value     = rec ? rec.po     : '';
  $('recv-vendor').value = rec ? rec.vendor : '';
  $('recv-date').value   = rec ? rec.date   : today();
  $('recv-status').value = rec ? rec.status : 'partial';
  $('recv-items').value  = rec ? rec.items  : '';
  $('recv-eid').value    = rec ? rec.id     : '';
  openModal('m-recv');
}

function saveRecv() {
  const no     = $('recv-no').value.trim();
  const vendor = $('recv-vendor').value.trim();
  if (!no || !vendor) { showToast('GR # and vendor are required.', 'error'); return; }

  const rec = {
    id:     $('recv-eid').value || uid(),
    no, vendor,
    po:     $('recv-po').value.trim(),
    date:   $('recv-date').value,
    status: $('recv-status').value,
    items:  $('recv-items').value.trim(),
  };

  const data = DB.get('recv');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('recv', data);
  closeModal('m-recv');
  showToast(idx >= 0 ? 'Receipt updated.' : 'Receipt added.');
  renderRecv();
}

function editRecv(id) {
  const rec = DB.get('recv').find(r => r.id === id);
  if (rec) openRecvForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   DELIVERY
═══════════════════════════════════════════════════════════ */
function renderDel() {
  const q  = ($('del-q')  || {value:''}).value.toLowerCase();
  const sf = ($('del-sf') || {value:''}).value;
  const data = DB.get('del').filter(r =>
    (!q  || r.no.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q)) &&
    (!sf || r.status === sf)
  );
  $('del-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.customer}</td>
      <td>${r.ref}</td>
      <td>${r.date}</td>
      <td>${r.dest}</td>
      <td>${badge(r.status)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editDel('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('del','${r.id}',renderDel)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="7">No shipments found.</td></tr>';
}

function openDelForm(rec) {
  $('m-del-title').textContent = rec ? 'Edit Shipment' : 'New Shipment';
  $('del-no').value       = rec ? rec.no       : '';
  $('del-customer').value = rec ? rec.customer : '';
  $('del-ref').value      = rec ? rec.ref      : '';
  $('del-date').value     = rec ? rec.date     : today();
  $('del-dest').value     = rec ? rec.dest     : '';
  $('del-status').value   = rec ? rec.status   : 'pending';
  $('del-eid').value      = rec ? rec.id       : '';
  openModal('m-del');
}

function saveDel() {
  const no       = $('del-no').value.trim();
  const customer = $('del-customer').value.trim();
  if (!no || !customer) { showToast('Shipment # and customer are required.', 'error'); return; }

  const rec = {
    id:       $('del-eid').value || uid(),
    no, customer,
    ref:      $('del-ref').value.trim(),
    date:     $('del-date').value,
    dest:     $('del-dest').value.trim(),
    status:   $('del-status').value,
  };

  const data = DB.get('del');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('del', data);
  closeModal('m-del');
  showToast(idx >= 0 ? 'Shipment updated.' : 'Shipment added.');
  renderDel();
}

function editDel(id) {
  const rec = DB.get('del').find(r => r.id === id);
  if (rec) openDelForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   PRODUCT INVENTORY
═══════════════════════════════════════════════════════════ */
function renderProducts() {
  const q  = ($('prod-q')  || {value:''}).value.toLowerCase();
  const cf = ($('prod-cf') || {value:''}).value;
  const data = DB.get('products').filter(r =>
    (!q  || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) &&
    (!cf || r.cat === cf)
  );
  $('prod-body').innerHTML = data.length ? data.map(r => {
    const low = Number(r.stock) <= Number(r.reorder);
    return `
      <tr>
        <td><strong>${r.code}</strong></td>
        <td>${r.name}</td>
        <td>${badge(r.cat)}</td>
        <td>${r.unit}</td>
        <td>${fmt(r.price)}</td>
        <td class="${low ? 'low-stock' : ''}">${r.stock}</td>
        <td>${r.reorder}</td>
        <td>
          <button class="btn-xs btn-edit" onclick="editProd('${r.id}')">Edit</button>
          <button class="btn-xs btn-del"  onclick="deleteRecord('products','${r.id}',renderProducts)">Del</button>
        </td>
      </tr>
    `;
  }).join('') : '<tr class="empty-row"><td colspan="8">No products found.</td></tr>';
}

function openProdForm(rec) {
  $('m-prod-title').textContent = rec ? 'Edit Product' : 'New Product';
  $('prod-code').value    = rec ? rec.code    : '';
  $('prod-name').value    = rec ? rec.name    : '';
  $('prod-cat').value     = rec ? rec.cat     : 'raw';
  $('prod-unit').value    = rec ? rec.unit    : '';
  $('prod-price').value   = rec ? rec.price   : '';
  $('prod-stock').value   = rec ? rec.stock   : '';
  $('prod-reorder').value = rec ? rec.reorder : '';
  $('prod-wh').value      = rec ? rec.wh      : '';
  $('prod-eid').value     = rec ? rec.id      : '';
  openModal('m-prod');
}

function saveProd() {
  const code  = $('prod-code').value.trim().toUpperCase();
  const name  = $('prod-name').value.trim();
  const price = parseFloat($('prod-price').value);
  if (!code || !name || isNaN(price)) { showToast('Code, name and price are required.', 'error'); return; }

  const rec = {
    id:      $('prod-eid').value || uid(),
    code, name,
    cat:     $('prod-cat').value,
    unit:    $('prod-unit').value.trim(),
    price,
    stock:   parseFloat($('prod-stock').value) || 0,
    reorder: parseFloat($('prod-reorder').value) || 0,
    wh:      $('prod-wh').value.trim(),
  };

  const data = DB.get('products');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.push(rec);
  DB.set('products', data);
  closeModal('m-prod');
  showToast(idx >= 0 ? 'Product updated.' : 'Product added.');
  renderProducts();
}

function editProd(id) {
  const rec = DB.get('products').find(r => r.id === id);
  if (rec) openProdForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   INVENTORY MANAGEMENT
═══════════════════════════════════════════════════════════ */
function renderInv() {
  const prods = DB.get('products');
  const data  = DB.get('inv');

  const totalVal = prods.reduce((s, p) => s + Number(p.price) * Number(p.stock), 0);
  const lowStock = prods.filter(p => Number(p.stock) <= Number(p.reorder)).length;

  $('inv-skus').textContent = prods.length;
  $('inv-val').textContent  = fmt(totalVal);
  $('inv-low').textContent  = lowStock;

  $('inv-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.product}</td>
      <td>${r.wh}</td>
      <td>${badge(r.type)}</td>
      <td>${r.qty}</td>
      <td>${r.ref}</td>
      <td>
        <button class="btn-xs btn-del" onclick="deleteRecord('inv','${r.id}',renderInv)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="7">No movements recorded.</td></tr>';
}

function openInvForm() {
  $('inv-date').value    = today();
  $('inv-product').value = '';
  $('inv-wh').value      = '';
  $('inv-type').value    = 'in';
  $('inv-qty').value     = '';
  $('inv-ref').value     = '';
  $('inv-eid').value     = '';
  openModal('m-inv');
}

function saveInv() {
  const product = $('inv-product').value.trim();
  const qty     = parseFloat($('inv-qty').value);
  if (!product || isNaN(qty)) { showToast('Product and quantity are required.', 'error'); return; }

  const rec = {
    id:      $('inv-eid').value || uid(),
    date:    $('inv-date').value,
    product,
    wh:      $('inv-wh').value.trim(),
    type:    $('inv-type').value,
    qty,
    ref:     $('inv-ref').value.trim(),
  };

  const data = DB.get('inv');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('inv', data);
  closeModal('m-inv');
  showToast('Movement recorded.');
  renderInv();
}

/* ═══════════════════════════════════════════════════════════
   MARKETING
═══════════════════════════════════════════════════════════ */
function renderMkt() {
  const data    = DB.get('mkt');
  const active  = data.filter(r => r.status === 'active').length;
  const leads   = data.reduce((s, r) => s + Number(r.leads), 0);
  const budget  = data.reduce((s, r) => s + Number(r.budget), 0);

  $('mkt-active').textContent = active;
  $('mkt-leads').textContent  = leads.toLocaleString('id-ID');
  $('mkt-budget').textContent = fmt(budget);

  $('mkt-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td><strong>${r.name}</strong></td>
      <td>${r.type}</td>
      <td>${r.start}</td>
      <td>${r.end}</td>
      <td>${fmt(r.budget)}</td>
      <td>${Number(r.leads).toLocaleString('id-ID')}</td>
      <td>${badge(r.status)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editMkt('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('mkt','${r.id}',renderMkt)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="8">No campaigns found.</td></tr>';
}

function openMktForm(rec) {
  $('m-mkt-title').textContent = rec ? 'Edit Campaign' : 'New Campaign';
  $('mkt-name').value       = rec ? rec.name   : '';
  $('mkt-type').value       = rec ? rec.type   : 'digital';
  $('mkt-start').value      = rec ? rec.start  : today();
  $('mkt-end').value        = rec ? rec.end    : '';
  $('mkt-budget-inp').value = rec ? rec.budget : '';
  $('mkt-leads-inp').value  = rec ? rec.leads  : '';
  $('mkt-status').value     = rec ? rec.status : 'planned';
  $('mkt-eid').value        = rec ? rec.id     : '';
  openModal('m-mkt');
}

function saveMkt() {
  const name   = $('mkt-name').value.trim();
  const budget = parseFloat($('mkt-budget-inp').value);
  if (!name || isNaN(budget)) { showToast('Campaign name and budget are required.', 'error'); return; }

  const rec = {
    id:     $('mkt-eid').value || uid(),
    name,
    type:   $('mkt-type').value,
    start:  $('mkt-start').value,
    end:    $('mkt-end').value,
    budget,
    leads:  parseFloat($('mkt-leads-inp').value) || 0,
    status: $('mkt-status').value,
  };

  const data = DB.get('mkt');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.unshift(rec);
  DB.set('mkt', data);
  closeModal('m-mkt');
  showToast(idx >= 0 ? 'Campaign updated.' : 'Campaign added.');
  renderMkt();
}

function editMkt(id) {
  const rec = DB.get('mkt').find(r => r.id === id);
  if (rec) openMktForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   HUMAN RESOURCES
═══════════════════════════════════════════════════════════ */
function renderHR() {
  const q  = ($('hr-q')  || {value:''}).value.toLowerCase();
  const df = ($('hr-df') || {value:''}).value;
  const data = DB.get('hr').filter(r =>
    (!q  || r.name.toLowerCase().includes(q) || r.dept.toLowerCase().includes(q) || r.empid.toLowerCase().includes(q)) &&
    (!df || r.dept === df)
  );
  $('hr-body').innerHTML = data.length ? data.map(r => `
    <tr>
      <td><strong>${r.empid}</strong></td>
      <td>${r.name}</td>
      <td>${r.dept}</td>
      <td>${r.pos}</td>
      <td>${r.join}</td>
      <td>${fmt(r.salary)}</td>
      <td>${badge(r.status)}</td>
      <td>
        <button class="btn-xs btn-edit" onclick="editHR('${r.id}')">Edit</button>
        <button class="btn-xs btn-del"  onclick="deleteRecord('hr','${r.id}',renderHR)">Del</button>
      </td>
    </tr>
  `).join('') : '<tr class="empty-row"><td colspan="8">No employees found.</td></tr>';
}

function openHRForm(rec) {
  $('m-hr-title').textContent = rec ? 'Edit Employee' : 'New Employee';
  $('hr-empid').value  = rec ? rec.empid  : '';
  $('hr-name').value   = rec ? rec.name   : '';
  $('hr-dept').value   = rec ? rec.dept   : 'Finance';
  $('hr-pos').value    = rec ? rec.pos    : '';
  $('hr-join').value   = rec ? rec.join   : today();
  $('hr-salary').value = rec ? rec.salary : '';
  $('hr-status').value = rec ? rec.status : 'active';
  $('hr-eid').value    = rec ? rec.id     : '';
  openModal('m-hr');
}

function saveHR() {
  const empid = $('hr-empid').value.trim().toUpperCase();
  const name  = $('hr-name').value.trim();
  const salary = parseFloat($('hr-salary').value);
  if (!empid || !name || isNaN(salary)) { showToast('Emp ID, name and salary are required.', 'error'); return; }

  const rec = {
    id:     $('hr-eid').value || uid(),
    empid, name,
    dept:   $('hr-dept').value,
    pos:    $('hr-pos').value.trim(),
    join:   $('hr-join').value,
    salary,
    status: $('hr-status').value,
  };

  const data = DB.get('hr');
  const idx  = data.findIndex(r => r.id === rec.id);
  if (idx >= 0) data[idx] = rec; else data.push(rec);
  DB.set('hr', data);
  closeModal('m-hr');
  showToast(idx >= 0 ? 'Employee updated.' : 'Employee added.');
  renderHR();
}

function editHR(id) {
  const rec = DB.get('hr').find(r => r.id === id);
  if (rec) openHRForm(rec);
}

/* ═══════════════════════════════════════════════════════════
   GENERIC DELETE
═══════════════════════════════════════════════════════════ */
function deleteRecord(store, id, renderFn) {
  confirmDelete('Are you sure you want to delete this record? This cannot be undone.', () => {
    const data = DB.get(store).filter(r => r.id !== id);
    DB.set(store, data);
    showToast('Record deleted.', 'error');
    renderFn();
  });
}

/* ═══════════════════════════════════════════════════════════
   REPORTS
═══════════════════════════════════════════════════════════ */
function genReport(type) {
  const out = $('report-out');
  const rc  = $('report-content');
  out.classList.remove('hidden');

  const ap     = DB.get('ap');
  const ar     = DB.get('ar');
  const fin    = DB.get('finance');
  const prods  = DB.get('products');
  const tax    = DB.get('tax');

  const revenue = fin.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0);
  const expense = fin.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
  const profit  = revenue - expense;

  const totalAP = ap.reduce((s, r) => s + Number(r.amount), 0);
  const totalAR = ar.reduce((s, r) => s + Number(r.amount), 0);
  const invVal  = prods.reduce((s, p) => s + Number(p.price) * Number(p.stock), 0);

  const outRate = tax.filter(t => t.type === 'output').reduce((s, t) => s + Number(t.rate), 0);
  const inpRate = tax.filter(t => t.type === 'input').reduce((s, t) => s + Number(t.rate), 0);
  const vatOut  = totalAR * (outRate / 100);
  const vatIn   = totalAP * (inpRate / 100);

  const reportDate = new Date().toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

  const reports = {
    'pl': `
      <h3>📊 Profit &amp; Loss Statement</h3>
      <p style="color:var(--muted);margin-bottom:14px">Generated: ${reportDate}</p>
      <table class="tbl"><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>
        <tr><td><strong>Total Revenue</strong></td><td>${fmt(revenue)}</td></tr>
        <tr><td><strong>Total Expenses</strong></td><td>${fmt(expense)}</td></tr>
        <tr style="background:#f0fdf4"><td><strong>Net Profit / Loss</strong></td><td><strong style="color:${profit>=0?'var(--suc)':'var(--dan)'}">${fmt(profit)}</strong></td></tr>
      </tbody></table>
    `,
    'bs': `
      <h3>⚖️ Balance Sheet (Simplified)</h3>
      <p style="color:var(--muted);margin-bottom:14px">Generated: ${reportDate}</p>
      <table class="tbl"><thead><tr><th>Account</th><th>Amount</th></tr></thead><tbody>
        <tr><td colspan="2"><strong>ASSETS</strong></td></tr>
        <tr><td>Accounts Receivable</td><td>${fmt(totalAR)}</td></tr>
        <tr><td>Inventory Value</td><td>${fmt(invVal)}</td></tr>
        <tr><td colspan="2"><strong>LIABILITIES</strong></td></tr>
        <tr><td>Accounts Payable</td><td>${fmt(totalAP)}</td></tr>
        <tr><td>Tax Payable</td><td>${fmt(vatOut - vatIn)}</td></tr>
        <tr style="background:#f0fdf4"><td><strong>Net Equity</strong></td><td><strong>${fmt(totalAR + invVal - totalAP - (vatOut - vatIn))}</strong></td></tr>
      </tbody></table>
    `,
    'ap-aging': `
      <h3>💸 AP Aging Report</h3>
      <p style="color:var(--muted);margin-bottom:14px">Generated: ${reportDate}</p>
      <table class="tbl"><thead><tr><th>Invoice #</th><th>Vendor</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        ${ap.map(r => `<tr><td>${r.no}</td><td>${r.vendor}</td><td>${r.due}</td><td>${fmt(r.amount)}</td><td>${badge(r.status)}</td></tr>`).join('')}
        <tr style="background:#f8fafc"><td colspan="3"><strong>Total Payable</strong></td><td><strong>${fmt(ap.filter(r=>r.status!=='paid').reduce((s,r)=>s+Number(r.amount),0))}</strong></td><td></td></tr>
      </tbody></table>
    `,
    'ar-aging': `
      <h3>💰 AR Aging Report</h3>
      <p style="color:var(--muted);margin-bottom:14px">Generated: ${reportDate}</p>
      <table class="tbl"><thead><tr><th>Invoice #</th><th>Customer</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        ${ar.map(r => `<tr><td>${r.no}</td><td>${r.customer}</td><td>${r.due}</td><td>${fmt(r.amount)}</td><td>${badge(r.status)}</td></tr>`).join('')}
        <tr style="background:#f8fafc"><td colspan="3"><strong>Total Receivable</strong></td><td><strong>${fmt(ar.filter(r=>r.status!=='paid').reduce((s,r)=>s+Number(r.amount),0))}</strong></td><td></td></tr>
      </tbody></table>
    `,
    'inv-val': `
      <h3>🏭 Inventory Valuation</h3>
      <p style="color:var(--muted);margin-bottom:14px">Generated: ${reportDate}</p>
      <table class="tbl"><thead><tr><th>Code</th><th>Product</th><th>Stock</th><th>Unit Price</th><th>Total Value</th></tr></thead><tbody>
        ${prods.map(p => `<tr><td>${p.code}</td><td>${p.name}</td><td>${p.stock}</td><td>${fmt(p.price)}</td><td><strong>${fmt(Number(p.price)*Number(p.stock))}</strong></td></tr>`).join('')}
        <tr style="background:#f8fafc"><td colspan="4"><strong>Grand Total</strong></td><td><strong>${fmt(invVal)}</strong></td></tr>
      </tbody></table>
    `,
    'tax-sum': `
      <h3>🧾 Tax Summary</h3>
      <p style="color:var(--muted);margin-bottom:14px">Generated: ${reportDate}</p>
      <table class="tbl"><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>
        <tr><td>Total AR (Revenue Base)</td><td>${fmt(totalAR)}</td></tr>
        <tr><td>Output VAT Collected (${outRate}%)</td><td>${fmt(vatOut)}</td></tr>
        <tr><td>Total AP (Purchase Base)</td><td>${fmt(totalAP)}</td></tr>
        <tr><td>Input Tax Paid (${inpRate}%)</td><td>${fmt(vatIn)}</td></tr>
        <tr style="background:#f0fdf4"><td><strong>Net Tax Payable</strong></td><td><strong style="color:${(vatOut-vatIn)>=0?'var(--dan)':'var(--suc)'}">${fmt(vatOut - vatIn)}</strong></td></tr>
      </tbody></table>
    `,
  };

  rc.innerHTML = reports[type] || '<p>Report not found.</p>';
  out.scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════
   WIRE UP "openModal" calls from HTML onclick attrs
   (these need to delegate to the correct form opener)
═══════════════════════════════════════════════════════════ */
// The modals already handle plain openModal() calls for new records.
// Edit functions call the specific form opener directly.
