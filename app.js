'use strict';
/* =====================================================================
   MK Finances — simple accounting & business management
   Plain HTML + CSS + JavaScript, data saved in Supabase.

   YOUR SUPABASE CONNECTION — fixed here, so users never see a setup screen.
   Paste your Publishable key (starts with sb_publishable_) below.
   It is safe to put in the browser: Row Level Security protects the data.
   ===================================================================== */
const CONFIG = {
  SUPABASE_URL: 'https://uaimycrlimsaccsbsuhl.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_LdwkC4J_m8godouPxo4rYg_vVgG6gu1',
};
const cleanUrl = u => { const m = String(u || '').trim().match(/^https?:\/\/[^/\s]+/i); return m ? m[0] : ''; };
const cfgKey = () => (/^PASTE_/.test(CONFIG.SUPABASE_ANON_KEY) ? '' : CONFIG.SUPABASE_ANON_KEY.trim());
const fixedConnection = () => !!(cleanUrl(CONFIG.SUPABASE_URL) && cfgKey());

/* ===================== State ===================== */
let sb = null;
let user = null;
let chartRef = null;

const TABLES = ['accounts', 'journal_entries', 'journal_lines', 'contacts', 'products', 'warehouses',
  'stock_moves', 'documents', 'payments', 'expenses', 'employees', 'attendance', 'payroll', 'followups'];
const S = { business: null, entryById: new Map(), costings: [], team: [], patch: false };
TABLES.forEach(t => { S[t] = []; });

const UI = {
  role: 'owner',
  authMode: 'login', sales: 'invoice', purchases: 'bill', payments: 'in', contacts: 'customer',
  inventory: 'products', hr: 'employees', accounting: 'coa', report: 'pl',
  from: null, to: null, bankAcc: null, attDate: null, payMonth: null, rep: null,
};

/* ===================== Small helpers ===================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
const sum = (arr, f) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const localISO = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => localISO(new Date());
const addDays = (ds, n) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
const monthStart = ds => ds.slice(0, 8) + '01';
const shiftMonth = (ds, n) => { const d = new Date(ds.slice(0, 8) + '01T00:00:00'); d.setMonth(d.getMonth() + n); return localISO(d); };
const monthEnd = ds => addDays(shiftMonth(ds, 1), -1);
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const cur = () => S.business?.currency || 'PKR';
const fmtN = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const money = n => `${cur()} ${fmtN(n)}`;
const money0 = n => `${cur()} ${fmt0(n)}`;
const fmtDate = ds => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const monthLabel = ds => new Date(ds.slice(0, 7) + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const byId = (t, id) => S[t].find(x => x.id === id);
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const pct = (a, b) => b ? Math.round(((a - b) / Math.abs(b)) * 100) : null;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  receipt: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1M17 20.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13.5h2',
  dollar: 'M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  bank: 'M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  id: 'M4 5h16v14H4zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 16c.5-2 1.5-3 3-3s2.5 1 3 3M14 9h4M14 13h3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M12 12h.01',
  book: 'M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM4 16a4 4 0 0 1 4-4h10',
  chart: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
  spark: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M18 6 6 18M6 6l12 12',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
  swap: 'M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4',
  layers: 'M12 3 2 8l10 5 10-5zM2 16l10 5 10-5M2 12l10 5 10-5',
  calc: 'M5 2h14v20H5zM8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[n] || ''}"/></svg>`;

/* ===================== Toast & modal ===================== */
function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3500);
}

function openModal(title, body, opts = {}) {
  const m = $('#modal');
  const foot = (opts.onSubmit || opts.footer) ? `<div class="modal-foot">${opts.footer || ''}<span class="grow"></span>
      <button type="button" class="btn ghost" onclick="closeModal()">${opts.onSubmit ? 'Cancel' : 'Close'}</button>
      ${opts.onSubmit ? `<button class="btn primary" type="submit">${esc(opts.submit || 'Save')}</button>` : ''}</div>` : '';
  m.innerHTML = `<div class="modal-box ${opts.wide ? 'wide' : ''}"><form id="mform">
    <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" onclick="closeModal()" aria-label="Close">${ic('x')}</button></div>
    <div class="modal-body">${body}</div>${foot}</form></div>`;
  m.classList.add('open');
  const f = $('#mform');
  f.onsubmit = async e => {
    e.preventDefault();
    if (!opts.onSubmit) return;
    const b = $('button[type=submit]', f);
    b.disabled = true; b.textContent = 'Saving…';
    try {
      const r = await opts.onSubmit(f);
      if (r !== false && f.isConnected) closeModal();
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), 'err');
    } finally {
      if (b.isConnected) { b.disabled = false; b.textContent = opts.submit || 'Save'; }
    }
  };
  if (opts.after) opts.after(f);
  const first = $('input:not([type=hidden]):not([readonly]):not([type=checkbox]), select, textarea', $('.modal-body', f));
  if (first && !opts.noFocus) first.focus();
}
function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal(); });

function fieldHTML(f, v) {
  const val = v ?? f.default ?? '';
  const req = f.required ? 'required' : '';
  let inp;
  if (f.type === 'select') {
    inp = `<select name="${f.k}" ${req}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || 'Select…')}</option>` : ''}${f.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    inp = `<textarea name="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
  } else if (f.type === 'checkbox') {
    return `<label class="check ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.k}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  } else {
    inp = `<input name="${f.k}" type="${f.type || 'text'}" value="${esc(val)}" ${f.type === 'number' ? `step="${f.step || 'any'}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} ${req} ${f.readonly ? 'readonly' : ''} placeholder="${esc(f.ph || '')}">`;
  }
  return `<label class="field ${f.full ? 'full' : ''}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${inp}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}
function readForm(f, fields) {
  const o = {};
  for (const x of fields) {
    const el = f.elements[x.k];
    if (!el) continue;
    if (x.type === 'checkbox') o[x.k] = el.checked;
    else if (x.type === 'number') o[x.k] = num(el.value);
    else o[x.k] = el.value.trim() === '' ? null : el.value.trim();
  }
  return o;
}
function formModal(title, fields, values, onSave, opts = {}) {
  openModal(title, `<div class="form-grid">${fields.map(f => fieldHTML(f, values?.[f.k])).join('')}</div>`,
    { ...opts, onSubmit: f => onSave(readForm(f, fields), f) });
}

/* ===================== Database ===================== */
async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
const ins = (t, row) => q(sb.from(t).insert(row).select().single());
const insMany = async (t, rows) => (rows.length ? q(sb.from(t).insert(rows).select()) : []);
const upd = (t, id, row) => q(sb.from(t).update(row).eq('id', id).select().single());
const del = (t, id) => q(sb.from(t).delete().eq('id', id));

const loadTable = t => q(sb.from(t).select('*').order('created_at', { ascending: true }).range(0, 9999));
async function reload() {
  const res = await Promise.all(TABLES.map(loadTable));
  TABLES.forEach((t, i) => { S[t] = res[i] || []; });
  S.business = await q(sb.from('business').select('*').maybeSingle());
  S.entryById = new Map(S.journal_entries.map(e => [e.id, e]));
  if (S.patch) {
    try { S.costings = await loadTable('costings'); } catch (e) { S.costings = []; }
    if (isOwner()) { try { S.team = await loadTable('team_members'); } catch (e) { S.team = []; } }
  }
}

/* ===================== Roles: owner & accountant ===================== */
const isOwner = () => UI.role === 'owner';
const OWNER_MSG = 'Only the owner can do this. Please ask the owner.';
async function loadRole() {
  try {
    const { data, error } = await sb.rpc('my_role');
    if (error) throw error;
    UI.role = data === 'accountant' ? 'accountant' : 'owner';
    S.patch = true;
  } catch (e) {
    UI.role = 'owner';
    S.patch = false;
  }
  document.body.classList.toggle('role-accountant', !isOwner());
}
async function refresh() { await reload(); render(); }

const DEFAULT_ACCOUNTS = [
  ['1000', 'Cash in Hand', 'asset', 'cash', true],
  ['1010', 'Bank Account', 'asset', 'bank', true],
  ['1100', 'Accounts Receivable', 'asset', 'ar'],
  ['1200', 'Inventory', 'asset', 'inventory'],
  ['2000', 'Accounts Payable', 'liability', 'ap'],
  ['2100', 'Tax Payable', 'liability', 'tax'],
  ['3000', "Owner's Capital", 'equity', 'capital'],
  ['3100', 'Opening Balance Equity', 'equity', 'obe'],
  ['4000', 'Sales Revenue', 'income', 'sales'],
  ['4100', 'Other Income', 'income'],
  ['5000', 'Cost of Goods Sold', 'expense', 'cogs'],
  ['6000', 'Salaries & Wages', 'expense', 'salaries'],
  ['6100', 'Rent', 'expense'],
  ['6200', 'Electricity, Gas & Water', 'expense'],
  ['6300', 'Transport & Freight', 'expense'],
  ['6400', 'Office Expenses', 'expense'],
  ['6500', 'Marketing', 'expense'],
  ['6900', 'General Expenses', 'expense', 'general'],
];

async function ensureSeed() {
  let changed = false;
  if (!S.business) { await q(sb.from('business').insert({ name: 'My Business', currency: 'PKR' })); changed = true; }
  if (!S.accounts.length) {
    await insMany('accounts', DEFAULT_ACCOUNTS.map(([code, name, type, sys, isBank]) => ({ code, name, type, sys: sys || null, is_bank: !!isBank })));
    changed = true;
  }
  if (!S.warehouses.length) { await ins('warehouses', { name: 'Main Warehouse' }); changed = true; }
  if (changed) await reload();
}

/* ===================== Business type ===================== */
const BIZ_TYPES = {
  manufacturer: {
    label: 'Manufacturer', icon: 'box',
    desc: 'You make products from raw material (boxes, packaging, garments…). Adds raw material, factory and machine accounts, plus PVC & carton costing.',
    accounts: [['1210', 'Raw Materials', 'asset'], ['1220', 'Packing Material Stock', 'asset'], ['1230', 'Work in Progress', 'asset'],
      ['1500', 'Machinery & Equipment', 'asset'], ['4200', 'Scrap / Wastage Sale', 'income'], ['6010', 'Factory Wages', 'expense'],
      ['6210', 'Factory Electricity & Gas', 'expense'], ['6610', 'Machine Repair & Maintenance', 'expense'],
      ['6620', 'Dies, Blocks & Plates', 'expense'], ['6630', 'Factory Overheads', 'expense']],
  },
  trader: {
    label: 'Trader / Wholesaler', icon: 'cart',
    desc: 'You buy and sell goods locally. Adds freight inward, delivery, discounts, commission and bad debt accounts.',
    accounts: [['4300', 'Commission Income', 'income'], ['4400', 'Discount Received', 'income'], ['5100', 'Freight Inward', 'expense'],
      ['6310', 'Delivery & Loading', 'expense'], ['6700', 'Discount Allowed', 'expense'], ['6710', 'Bad Debts', 'expense']],
  },
  importer: {
    label: 'Importer / Exporter', icon: 'swap',
    desc: 'You import or export goods. Adds goods in transit, LC, customs duty, freight, clearing, insurance and exchange gain/loss accounts.',
    accounts: [['1250', 'Goods in Transit', 'asset'], ['1260', 'LC Margin / Advance to Supplier', 'asset'], ['4500', 'Exchange Gain / Loss', 'income'],
      ['5200', 'Customs Duty & Taxes', 'expense'], ['5210', 'Sea / Air Freight', 'expense'], ['5220', 'Clearing & Forwarding', 'expense'],
      ['5230', 'Marine Insurance', 'expense'], ['6800', 'Bank & LC Charges', 'expense']],
  },
  retail_uk: {
    label: 'UK Online Shop & Market Stall', icon: 'cart', currency: 'GBP',
    desc: 'You sell online (Shopify, TikTok Shop) and at markets in the UK. Adds Shopify, TikTok and market sales, payout balances, postage, packaging, pitch rent, fees and VAT — plus order import and a VAT summary.',
    accounts: [['1020', 'Shopify Payments Balance', 'asset', true], ['1030', 'TikTok Shop Balance', 'asset', true], ['1040', 'PayPal Balance', 'asset', true],
      ['1050', 'Card Reader (SumUp) Balance', 'asset', true],
      ['4010', 'Shopify Website Sales', 'income'], ['4020', 'TikTok Shop Sales', 'income'], ['4030', 'Market Stall Sales', 'income'],
      ['4035', 'Other Online Sales', 'income'], ['4040', 'Delivery Charges Received', 'income'], ['4050', 'Refunds & Returns', 'income'],
      ['5010', 'Ingredients & Raw Materials', 'expense'], ['5020', 'Jars, Bottles & Labels', 'expense'],
      ['6110', 'Market Pitch & Stall Rent', 'expense'], ['6330', 'Postage & Couriers', 'expense'], ['6340', 'Packaging & Gift Boxes', 'expense'],
      ['6510', 'Social Media & Influencers', 'expense'], ['6520', 'Photography & Content', 'expense'],
      ['6830', 'Payment Processing Fees', 'expense'], ['6840', 'TikTok Shop & Marketplace Fees', 'expense'], ['6850', 'Shopify Plan & Apps', 'expense'],
      ['6860', 'Website, Domain & Software', 'expense'], ['6870', 'Business Insurance', 'expense'], ['6880', 'Accountancy & Bookkeeping', 'expense'], ['6890', 'Bank Charges', 'expense']],
  },
  investor: {
    label: 'Investor', icon: 'chart',
    desc: 'You invest money in shares, property or other businesses. Adds investment, loans given, dividend, rental, profit and brokerage accounts.',
    accounts: [['1300', 'Investments in Shares', 'asset'], ['1310', 'Investments in Property', 'asset'], ['1320', 'Loans Given', 'asset'],
      ['4600', 'Dividend Income', 'income'], ['4610', 'Capital Gain on Investments', 'income'], ['4620', 'Profit / Interest Income', 'income'],
      ['4630', 'Rental Income', 'income'], ['6810', 'Brokerage & Fees', 'expense'], ['6820', 'Loss on Investments', 'expense']],
  },
};
const bizType = () => S.business?.business_type || null;
const showCosting = () => !bizType() || bizType() === 'manufacturer';
const isShop = () => bizType() === 'retail_uk';

function chooseBusinessType(first = false) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  if (!S.patch) return toast('Run supabase-update.sql in Supabase first.', 'err');
  const cur = bizType();
  openModal(first ? 'Welcome! What kind of business are you?' : 'Change business type', `
    <p class="muted" style="margin:0 0 16px">MK Finances will set up the right accounts for you. You can change this later in Settings — nothing is deleted.</p>
    <div class="biz-grid">${Object.entries(BIZ_TYPES).map(([k, b]) => `
      <button type="button" class="biz ${k === cur ? 'on' : ''}" onclick="setBusinessType('${k}')">${ic(b.icon)}<b>${b.label}</b><span>${b.desc}</span></button>`).join('')}</div>`, { wide: true, noFocus: true });
}
async function addMissingAccounts(list) {
  const have = new Set(S.accounts.map(a => a.name.toLowerCase()));
  const add = list.filter(([, name]) => !have.has(name.toLowerCase())).map(([code, name, t, isBank]) => ({ code, name, type: t, is_bank: !!isBank }));
  await insMany('accounts', add);
  return add;
}
async function setBusinessType(type) {
  const B = BIZ_TYPES[type];
  try {
    const patch = { business_type: type, ...(B.currency ? { currency: B.currency } : {}) };
    try { await q(sb.from('business').update(patch).eq('user_id', user.id)); }
    catch (e) { throw new Error(/check|constraint/i.test(e.message) ? 'Your database needs one update: run supabase-uk.sql in Supabase → SQL Editor, then try again.' : e.message); }
    const add = await addMissingAccounts(B.accounts);
    if (type === 'retail_uk') { const t = S.accounts.find(a => a.sys === 'tax'); if (t && !/vat/i.test(t.name)) await upd('accounts', t.id, { name: 'VAT Payable (HMRC)' }); }
    closeModal();
    await reload();
    buildNav();
    render();
    toast(`Set up as ${B.label}${add.length ? ` — ${add.length} accounts added` : ''}`);
  } catch (e) { toast(e.message, 'err'); }
}

/* ===================== Accounting engine ===================== */
function acc(key) {
  const a = S.accounts.find(x => x.sys === key);
  if (!a) throw new Error(`System account "${key}" is missing. Please check your chart of accounts.`);
  return a.id;
}
const banks = () => S.accounts.filter(a => a.is_bank);
const mainWh = () => S.warehouses[0];

function checkLock(date) {
  const L = S.business?.lock_date;
  if (L && date <= L) throw new Error(`Books are locked up to ${fmtDate(L)}. Change the lock date in Settings.`);
}

async function postJournal({ date, memo, ref_type = 'journal', ref_id = null, lines }) {
  const clean = [];
  for (const l of lines) {
    let d = r2(l.debit || 0), c = r2(l.credit || 0);
    if (d < 0) { c += -d; d = 0; }
    if (c < 0) { d += -c; c = 0; }
    if (d || c) clean.push({ account_id: l.account_id, debit: d, credit: c });
  }
  if (!clean.length) return null;
  const dr = r2(sum(clean, l => l.debit)), cr = r2(sum(clean, l => l.credit));
  if (Math.abs(dr - cr) > 0.009) throw new Error(`Entry is not balanced (debit ${fmtN(dr)} vs credit ${fmtN(cr)})`);
  const e = await ins('journal_entries', { date, memo, ref_type, ref_id });
  await insMany('journal_lines', clean.map(l => ({ ...l, entry_id: e.id })));
  return e;
}
async function unpost(refId) {
  await q(sb.from('journal_entries').delete().eq('ref_id', refId));
  await q(sb.from('stock_moves').delete().eq('ref_id', refId));
}

function sums(from, to) {
  const m = new Map();
  for (const l of S.journal_lines) {
    const e = S.entryById.get(l.entry_id);
    if (!e) continue;
    if (from && e.date < from) continue;
    if (to && e.date > to) continue;
    const s = m.get(l.account_id) || { dr: 0, cr: 0 };
    s.dr += +l.debit; s.cr += +l.credit;
    m.set(l.account_id, s);
  }
  return m;
}
const natural = (a, s) => (!s ? 0 : (['asset', 'expense'].includes(a.type) ? s.dr - s.cr : s.cr - s.dr));
function plTotals(from, to) {
  const s = sums(from, to);
  let income = 0, expense = 0;
  for (const a of S.accounts) {
    const v = natural(a, s.get(a.id));
    if (a.type === 'income') income += v;
    if (a.type === 'expense') expense += v;
  }
  return { income: r2(income), expense: r2(expense), net: r2(income - expense) };
}
function cashBalance(to = null) { const s = sums(null, to); return r2(sum(banks(), a => natural(a, s.get(a.id)))); }

/* ===================== Stock ===================== */
const stockOf = (pid, wh = null) => r2(sum(S.stock_moves.filter(m => m.product_id === pid && (!wh || m.warehouse_id === wh)), m => m.qty));
const lowStock = () => S.products.filter(p => +p.reorder_level > 0 && stockOf(p.id) <= +p.reorder_level);

/* ===================== Documents ===================== */
const KINDS = {
  quotation: { label: 'Quotation', prefix: 'QT', side: 'sales', to: ['sales_order', 'invoice'] },
  sales_order: { label: 'Sales Order', prefix: 'SO', side: 'sales', to: ['invoice'] },
  invoice: { label: 'Invoice', prefix: 'INV', side: 'sales', posts: true },
  purchase_order: { label: 'Purchase Order', prefix: 'PO', side: 'purchase', to: ['bill'] },
  bill: { label: 'Purchase Bill', prefix: 'BILL', side: 'purchase', posts: true },
};
const paidOf = id => r2(sum(S.payments.filter(p => p.document_id === id), p => p.amount));
const balOf = d => r2(+d.total - paidOf(d.id));
function statusOf(d) {
  if (!KINDS[d.kind].posts) return d.status || 'Open';
  const paid = paidOf(d.id);
  if (paid >= +d.total - 0.009) return 'Paid';
  if (d.due_date && d.due_date < today()) return 'Overdue';
  if (paid > 0) return 'Partial';
  return 'Unpaid';
}
const badge = s => `<span class="badge b-${String(s).toLowerCase().replace(/[^a-z]/g, '')}">${esc(s)}</span>`;
function nextNumber(kind) {
  const pre = KINDS[kind].prefix + '-';
  let max = 0;
  S.documents.filter(d => d.kind === kind).forEach(d => {
    const n = parseInt(String(d.number).replace(pre, ''), 10);
    if (n > max) max = n;
  });
  return pre + String(max + 1).padStart(4, '0');
}
function contactBalance(c) {
  const isCust = c.type === 'customer';
  return r2(+c.opening_balance
    + sum(S.documents.filter(d => d.kind === (isCust ? 'invoice' : 'bill') && d.contact_id === c.id), d => d.total)
    - sum(S.payments.filter(p => p.direction === (isCust ? 'in' : 'out') && p.contact_id === c.id), p => p.amount));
}

/* ===================== UI building blocks ===================== */
const NAV = [
  ['Overview', [['khata', 'Quick Entry', 'edit'], ['dashboard', 'Dashboard', 'home'], ['insights', 'Smart Insights', 'spark']]],
  ['Money', [['sales', 'Sales', 'receipt'], ['purchases', 'Purchases', 'cart'], ['payments', 'Payments', 'wallet'], ['expenses', 'Expenses', 'dollar'], ['banking', 'Bank & Cash', 'bank']]],
  ['Shop', [['online', 'Online & Market', 'cart']]],
  ['Business', [['contacts', 'Customers & Suppliers', 'users'], ['inventory', 'Products & Stock', 'box'], ['hr', 'HR & Payroll', 'id'], ['crm', 'CRM & Follow-ups', 'target']]],
  ['Costing', [['pvc', 'PVC Costing', 'layers'], ['carton', 'Carton Costing', 'calc']]],
  ['Books', [['accounting', 'Accounting', 'book'], ['reports', 'Reports', 'chart'], ['settings', 'Settings', 'gear']]],
];
const NAV_FLAT = NAV.flatMap(g => g[1]);
function buildNav() {
  $('#nav').innerHTML = NAV.filter(([g]) => (g !== 'Costing' || showCosting()) && (g !== 'Shop' || isShop()))
    .map(([g, items]) => `<h6>${g}</h6>` + items.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${ic(i)}<span>${l}</span></a>`).join('')).join('');
  $('#bizName').textContent = S.business?.name || 'My Business';
  $('#roleTag').textContent = `${isOwner() ? 'Owner' : 'Accountant'}${bizType() ? ' · ' + BIZ_TYPES[bizType()].label : ''}`;
}

function table(cols, rows, opts = {}) {
  if (!rows.length) return `<div class="empty">${opts.empty || 'Nothing here yet.'}</div>`;
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.r ? 'r' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr ${opts.click ? `class="click" onclick="${opts.click(r)}"` : ''}>${cols.map(c => `<td class="${c.r ? 'r' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const tabs = (key, list) => `<div class="tabs">${list.map(([v, l]) => `<button type="button" class="${UI[key] === v ? 'on' : ''}" onclick="setTab('${key}','${v}')">${esc(l)}</button>`).join('')}</div>`;
function setTab(k, v) { UI[k] = v; render(); }
const searchBox = (ph = 'Search…') => `<input class="search" type="search" placeholder="${esc(ph)}" oninput="filterRows(this)">`;
function filterRows(inp) {
  const qy = inp.value.toLowerCase();
  const scope = inp.closest('.card') || $('#main');
  $$('tbody tr', scope).forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(qy) ? '' : 'none'; });
}
const kpi = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><span>${esc(label)}</span><b>${value}</b><small>${sub}</small></div>`;
const actBtn = (icon, onclick, title, cls = '') => `<button type="button" class="icon-btn ${cls} ${icon === 'trash' ? 'owner-only' : ''}" title="${esc(title)}" onclick="event.stopPropagation();${onclick}">${ic(icon)}</button>`;
const trend = p => (p == null ? '' : `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`);
const go = r => { location.hash = '#/' + r; };

function accOptions(selected, filter = () => true) {
  const groups = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };
  return Object.entries(groups).map(([t, label]) => {
    const list = S.accounts.filter(a => a.type === t && filter(a)).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    if (!list.length) return '';
    return `<optgroup label="${label}">${list.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.code ? a.code + ' · ' : '')}${esc(a.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}
const bankOpts = () => banks().map(a => [a.id, a.name]);

function waLink(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0') && p.length === 11) p = '92' + p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
function printHTML(title, inner) {
  const b = S.business || {};
  const w = window.open('', '_blank');
  if (!w) { toast('Please allow pop-ups to print', 'err'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;color:#16202a;margin:32px;font-size:13px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:18px}
    .top h1{margin:0;color:#0f766e;font-size:22px} .top h2{margin:0;font-size:20px;text-align:right}
    table{width:100%;border-collapse:collapse;margin-top:12px} th{background:#f0f3f6;text-align:left;padding:8px;font-size:12px}
    td{padding:8px;border-bottom:1px solid #e3e8ed} .r{text-align:right} tr.total td,tr.grand td{font-weight:700}
    tr.head td{font-weight:700;background:#f7f9fa} tr.grand td{background:#e6f4f2}
    .meta{display:flex;justify-content:space-between;gap:20px;margin-bottom:10px} .muted{color:#64707d}
    .sum{margin-left:auto;width:280px;margin-top:12px} .sum div{display:flex;justify-content:space-between;padding:4px 0}
    .sum .g{font-size:16px;font-weight:700;border-top:2px solid #16202a;margin-top:4px;padding-top:8px}
    .foot{margin-top:40px;color:#64707d;font-size:11px;text-align:center}
  </style></head><body>
  <div class="top"><div><h1>${esc(b.name || 'My Business')}</h1><div class="muted">${esc(b.address || '')}<br>${esc(b.phone || '')} ${esc(b.email || '')}${b.tax_no ? '<br>Tax/NTN: ' + esc(b.tax_no) : ''}</div></div><h2>${esc(title)}</h2></div>
  ${inner}<div class="foot">Generated by MK Finances · ${fmtDate(today())}</div>
  <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}

/* ===================== Boot, setup & auth ===================== */
function showOnly(id) { ['loader', 'setup', 'auth', 'app'].forEach(x => $('#' + x).classList.toggle('hidden', x !== id)); }

async function boot() {
  applyTheme();
  $('#menuBtn').innerHTML = ic('menu');
  $('#themeBtn').innerHTML = ic('moon');
  const url = fixedConnection() ? cleanUrl(CONFIG.SUPABASE_URL) : cleanUrl(localStorage.getItem('mkf_url'));
  const key = fixedConnection() ? cfgKey() : (localStorage.getItem('mkf_key') || '');
  if (!url || !key) return showSetup();
  if (!window.supabase) { showOnly('setup'); toast('Could not load Supabase library. Check your internet.', 'err'); return; }
  try {
    sb = window.supabase.createClient(url, key);
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') setTimeout(askNewPassword, 300);
      if (ev === 'SIGNED_OUT') { user = null; showAuth(); }
      if (session) user = session.user;
    });
    const { data } = await sb.auth.getSession();
    if (data.session) { user = data.session.user; await startApp(); } else showAuth();
  } catch (e) {
    console.error(e);
    showSetup();
    toast('Could not connect: ' + e.message, 'err');
  }
}

function showSetup() {
  showOnly('setup');
  $('#setupForm').onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    localStorage.setItem('mkf_url', cleanUrl(f.url.value));
    localStorage.setItem('mkf_key', f.key.value.trim());
    location.reload();
  };
}

function showAuth() {
  showOnly('auth');
  const setMode = m => {
    UI.authMode = m;
    $$('#authSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#authBtn').textContent = m === 'signup' ? 'Create account' : m === 'reset' ? 'Send reset link' : 'Sign in';
    $('#passField').classList.toggle('hidden', m === 'reset');
    $('#authForm').password.required = m !== 'reset';
    $('#forgotBtn').textContent = m === 'reset' ? 'Back to sign in' : 'Forgot password?';
    $('#authMsg').textContent = ''; $('#authMsg').className = 'auth-msg';
  };
  $$('#authSeg button').forEach(b => { b.onclick = () => setMode(b.dataset.m); });
  $('#forgotBtn').onclick = () => setMode(UI.authMode === 'reset' ? 'login' : 'reset');
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, msg = $('#authMsg'), btn = $('#authBtn');
    const email = f.email.value.trim(), password = f.password.value;
    btn.disabled = true; msg.className = 'auth-msg'; msg.textContent = 'Please wait…';
    try {
      if (UI.authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) { user = data.session.user; await startApp(); }
        else { msg.textContent = 'Account created. Check your email to confirm, then sign in.'; setTimeout(() => setMode('login'), 50); }
      } else if (UI.authMode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        msg.textContent = 'Reset link sent. Check your email.';
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        user = data.user;
        await startApp();
      }
    } catch (err) {
      msg.className = 'auth-msg err'; msg.textContent = friendlyAuthError(err);
    } finally { btn.disabled = false; }
  };
  setMode(UI.authMode === 'reset' ? 'login' : UI.authMode);
}

function friendlyAuthError(err) {
  const m = String(err?.message || err || '');
  if (/rate limit/i.test(m)) return 'Too many emails sent in the last hour (Supabase free limit). Please wait, or ask the admin to turn off "Confirm email" in Supabase.';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Please open the confirmation email we sent you, click the link, then sign in.';
  if (/already registered/i.test(m)) return 'This email already has an account. Use Sign in instead.';
  return m;
}

function askNewPassword() {
  formModal('Set a new password', [{ k: 'password', label: 'New password', type: 'password', required: true, min: 6 }], {}, async v => {
    if ((v.password || '').length < 6) throw new Error('Use at least 6 characters');
    const { error } = await sb.auth.updateUser({ password: v.password });
    if (error) throw error;
    toast('Password updated');
  });
}

async function startApp() {
  showOnly('loader');
  try {
    await loadRole();
    await reload();
    if (isOwner()) await ensureSeed();
    else if (!S.business) throw new Error('Your owner has not finished setting up MK Finances yet.');
  } catch (e) {
    console.error(e);
    showOnly('auth');
    const msg = $('#authMsg');
    msg.className = 'auth-msg err';
    msg.textContent = 'Database error: ' + e.message + (isOwner() ? ' — did you run supabase-schema.sql?' : '');
    return;
  }
  buildNav();
  $('#whoEmail').textContent = user?.email || '';
  showOnly('app');
  render();
  if (isOwner() && S.patch && !bizType()) setTimeout(() => chooseBusinessType(true), 300);
}

async function signOut() { await sb.auth.signOut(); location.hash = ''; showAuth(); }
function resetConnection() {
  if (!confirm('Disconnect this browser from your Supabase project? Your data stays safe in Supabase.')) return;
  localStorage.removeItem('mkf_url'); localStorage.removeItem('mkf_key');
  sb?.auth.signOut().finally(() => location.reload());
}
function applyTheme() { document.documentElement.dataset.theme = localStorage.getItem('mkf_theme') || 'light'; }
function toggleTheme() {
  localStorage.setItem('mkf_theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  applyTheme();
  if (user) render();
}

/* ===================== Router ===================== */
const PAGES = {};
const AFTER = {};
function render() {
  const route = (location.hash.replace('#/', '') || (isShop() ? 'khata' : 'dashboard')).split('?')[0];
  const page = PAGES[route] ? route : (isShop() ? 'khata' : 'dashboard');
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.r === page));
  $('#pageTitle').textContent = NAV_FLAT.find(n => n[0] === page)?.[1] || '';
  $('#bizName').textContent = S.business?.name || 'My Business';
  $('#roleTag').textContent = `${isOwner() ? 'Owner' : 'Accountant'}${bizType() ? ' · ' + BIZ_TYPES[bizType()].label : ''}`;
  if (chartRef) { chartRef.destroy(); chartRef = null; }
  try {
    $('#main').innerHTML = PAGES[page]();
    if (AFTER[page]) AFTER[page]();
  } catch (e) {
    console.error(e);
    $('#main').innerHTML = `<div class="card"><div class="alert danger"><span class="dot"></span>Something went wrong: ${esc(e.message)}</div></div>`;
  }
  document.body.classList.remove('nav-open');
}
window.addEventListener('hashchange', () => { if (user && sb) render(); });

function quickNew() {
  const items = [
    ['receipt', 'New Invoice', "openDocForm('invoice')"], ['wallet', 'Receive Payment', "openPaymentForm('in')"],
    ['dollar', 'Add Expense', 'openExpenseForm()'], ['cart', 'Purchase Bill', "openDocForm('bill')"],
    ['file', 'Quotation', "openDocForm('quotation')"], ['wallet', 'Pay Supplier', "openPaymentForm('out')"],
    ['users', 'Customer', "openContactForm('customer')"], ['box', 'Product', 'openProductForm()'],
    ['id', 'Employee', 'openEmployeeForm()'], ['target', 'Follow-up / Lead', 'openLeadForm()'],
    ['file', 'Upload bank statement', 'openBankImport()'],
    ...(isShop() ? [['cart', 'Import Shopify / TikTok orders', 'openImport()'], ['wallet', 'Record market day', 'openMarketDay()'], ['bank', 'Record payout', 'openPayoutForm()']] : []),
    ...(showCosting() ? [['layers', 'PVC Costing', "openCostingForm('pvc')"], ['calc', 'Carton Costing', "openCostingForm('carton')"]] : []),
  ];
  openModal('What do you want to add?', `<div class="qa-grid">${items.map(([i, l, fn]) => `<button type="button" class="btn" onclick="closeModal();${fn}">${ic(i)} ${l}</button>`).join('')}</div>`, { noFocus: true });
}

/* ===================== Dashboard ===================== */
PAGES.dashboard = () => {
  const t = today(), ms = monthStart(t), pm = shiftMonth(t, -1);
  const now = plTotals(ms, t), prev = plTotals(pm, monthEnd(pm));
  const ar = sum(S.contacts.filter(c => c.type === 'customer'), contactBalance);
  const ap = sum(S.contacts.filter(c => c.type === 'supplier'), contactBalance);
  const ins = insights();
  const recent = S.documents.filter(d => d.kind === 'invoice').sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)).slice(0, 6);
  const quick = [['receipt', 'New Invoice', "openDocForm('invoice')"], ['wallet', 'Receive Payment', "openPaymentForm('in')"],
    ['dollar', 'Add Expense', 'openExpenseForm()'], ['cart', 'Purchase Bill', "openDocForm('bill')"],
    ['users', 'Add Customer', "openContactForm('customer')"], ['box', 'Add Product', 'openProductForm()']];
  const firstRun = !S.documents.length && !S.contacts.length && !S.products.length;
  return `
  ${firstRun ? `<div class="card mb"><div class="alert info"><span class="dot"></span><div><b>Welcome to MK Finances!</b> Start in 3 easy steps: 1) add your business details in <a href="#/settings">Settings</a>, 2) add a customer and a product, 3) create your first invoice.</div></div></div>` : ''}
  <div class="quick mb">${quick.map(([i, l, fn]) => `<button type="button" onclick="${fn}">${ic(i)}${l}</button>`).join('')}</div>
  <div class="grid g4 mb">
    ${kpi('Sales this month', money0(now.income), `${trend(pct(now.income, prev.income))} vs last month`)}
    ${kpi('Expenses this month', money0(now.expense), `${trend(pct(now.expense, prev.expense))} vs last month`)}
    ${kpi('Profit this month', money0(now.net), now.income ? `${Math.round(now.net / now.income * 100)}% margin` : '&nbsp;', now.net >= 0 ? 'good' : 'bad')}
    ${kpi('Cash & Bank', money0(cashBalance()), `${banks().length} account(s)`)}
  </div>
  <div class="grid g4 mb">
    ${kpi('Customers owe you', money0(ar), `${S.documents.filter(d => d.kind === 'invoice' && statusOf(d) === 'Overdue').length} overdue invoice(s)`)}
    ${kpi('You owe suppliers', money0(ap), 'Payables')}
    ${kpi('Stock value', money0(sum(S.products, p => stockOf(p.id) * +p.cost)), `${lowStock().length} low-stock item(s)`)}
    ${kpi('Open follow-ups', String(S.followups.filter(f => f.status !== 'done').length), 'CRM pipeline')}
  </div>
  <div class="grid g21 mb">
    <div class="card"><div class="card-head"><h3>Income vs Expenses</h3><span class="grow"></span><span class="muted small">Last 6 months</span></div><div class="chart-box"><canvas id="dashChart"></canvas></div></div>
    <div class="card"><div class="card-head"><h3>Business Health</h3><span class="grow"></span><a class="small" href="#/insights">Details →</a></div>
      <div class="score mb">${ring(ins.score)}<div><b>${ins.score >= 80 ? 'Healthy' : ins.score >= 60 ? 'Needs attention' : 'At risk'}</b><div class="muted small">Based on cash, collections, stock and profit</div></div></div>
      ${ins.alerts.slice(0, 3).map(a => `<div class="alert ${a.type}"><span class="dot"></span>${a.text}</div>`).join('') || '<div class="alert good"><span class="dot"></span>All clear — nothing needs your attention.</div>'}
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Recent invoices</h3><span class="grow"></span><a class="small" href="#/sales">View all →</a></div>
    ${table([
    { h: 'Invoice', f: d => `<b>${esc(d.number)}</b>` },
    { h: 'Customer', f: d => esc(byId('contacts', d.contact_id)?.name || '—') },
    { h: 'Date', f: d => fmtDate(d.date) },
    { h: 'Total', r: 1, f: d => fmtN(d.total) },
    { h: 'Status', f: d => badge(statusOf(d)) },
  ], recent, { click: d => `viewDoc('${d.id}')`, empty: 'No invoices yet. Click “New Invoice” to create one.' })}
  </div>`;
};
const ring = v => `<div class="ring" style="--v:${v};--c:${v >= 80 ? 'var(--green)' : v >= 60 ? 'var(--amber)' : 'var(--red)'}"><b>${v}</b></div>`;
AFTER.dashboard = () => {
  const el = $('#dashChart');
  if (!el || !window.Chart) return;
  const labels = [], inc = [], exp = [];
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(today(), -i);
    const p = plTotals(m, monthEnd(m));
    labels.push(monthLabel(m)); inc.push(p.income); exp.push(p.expense);
  }
  const dark = document.documentElement.dataset.theme === 'dark';
  const grid = dark ? '#26313a' : '#e3e8ed', tick = dark ? '#93a1ad' : '#64707d';
  chartRef = new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Income', data: inc, backgroundColor: dark ? '#2dd4bf' : '#0f766e', borderRadius: 6 },
      { label: 'Expenses', data: exp, backgroundColor: dark ? '#fbbf24' : '#f59e0b', borderRadius: 6 },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: tick } } },
      scales: { x: { grid: { display: false }, ticks: { color: tick } }, y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick } } },
    },
  });
};

/* ===================== Smart insights (rule-based) ===================== */
function insights() {
  const t = today(), ms = monthStart(t), pm = shiftMonth(t, -1);
  const now = plTotals(ms, t), prev = plTotals(pm, monthEnd(pm));
  const dayOfMonth = +t.slice(8, 10), daysInMonth = +monthEnd(t).slice(8, 10);
  const projected = now.income / dayOfMonth * daysInMonth;
  const overdue = S.documents.filter(d => d.kind === 'invoice' && statusOf(d) === 'Overdue');
  const overdueAmt = sum(overdue, balOf);
  const billsDue = S.documents.filter(d => d.kind === 'bill' && balOf(d) > 0.009 && d.due_date && d.due_date <= addDays(t, 7));
  const low = lowStock();
  const cash = cashBalance();
  const last90 = plTotals(addDays(t, -90), t);
  const avgMonthlyExp = last90.expense / 3;
  const daily = last90.income / 90;
  const fu = S.followups.filter(f => f.status !== 'done' && f.due_date && f.due_date <= t);
  let score = 100;
  const alerts = [], actions = [];
  if (overdue.length) {
    score -= Math.min(25, 5 * overdue.length);
    alerts.push({ type: 'danger', text: `${overdue.length} overdue invoice(s) — ${money0(overdueAmt)} not collected yet` });
    actions.push('Send WhatsApp reminders to customers with overdue invoices (open the invoice → WhatsApp).');
  }
  if (cash < 0) { score -= 25; alerts.push({ type: 'danger', text: `Cash & bank balance is negative (${money0(cash)})` }); }
  else if (avgMonthlyExp > 0 && cash < avgMonthlyExp) {
    score -= 15;
    alerts.push({ type: 'warn', text: `Cash (${money0(cash)}) covers less than one month of expenses (${money0(avgMonthlyExp)}/month)` });
    actions.push('Collect receivables first and delay non-essential spending this month.');
  }
  if (now.net < 0) { score -= 15; alerts.push({ type: 'danger', text: `You are at a loss this month (${money0(now.net)})` }); actions.push('Review the Expenses by Category report to find what to cut.'); }
  if (low.length) {
    score -= Math.min(15, 3 * low.length);
    alerts.push({ type: 'warn', text: `${low.length} product(s) at or below reorder level: ${low.slice(0, 3).map(p => esc(p.name)).join(', ')}${low.length > 3 ? '…' : ''}` });
    actions.push('Create a Purchase Order for low-stock items.');
  }
  if (billsDue.length) alerts.push({ type: 'warn', text: `${billsDue.length} supplier bill(s) due within 7 days — ${money0(sum(billsDue, balOf))}` });
  if (prev.expense > 0 && now.expense > prev.expense * 1.3) { score -= 5; alerts.push({ type: 'warn', text: `Expenses this month are already ${pct(now.expense, prev.expense)}% higher than last month` }); }
  if (prev.income > 0 && dayOfMonth >= 7) {
    const p = pct(projected, prev.income);
    if (p <= -20) { score -= 10; alerts.push({ type: 'warn', text: `Sales are on track to be ${Math.abs(p)}% lower than last month` }); actions.push('Follow up with past customers and open quotations.'); }
    else if (p >= 10) alerts.push({ type: 'good', text: `Sales are on track to be ${p}% higher than last month` });
  }
  if (fu.length) { alerts.push({ type: 'info', text: `${fu.length} CRM follow-up(s) due today or overdue` }); actions.push('Open CRM & Follow-ups and contact your leads.'); }
  const openQuotes = S.documents.filter(d => d.kind === 'quotation' && statusOf(d) === 'Open');
  if (openQuotes.length) actions.push(`Follow up on ${openQuotes.length} open quotation(s) worth ${money0(sum(openQuotes, d => d.total))}.`);
  const custSales = new Map();
  S.documents.filter(d => d.kind === 'invoice' && d.date >= addDays(t, -90)).forEach(d => custSales.set(d.contact_id, (custSales.get(d.contact_id) || 0) + (+d.subtotal - +d.discount)));
  const topCustomers = [...custSales].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ name: byId('contacts', id)?.name || '—', v }));
  const prodSales = new Map();
  S.documents.filter(d => d.kind === 'invoice' && d.date >= addDays(t, -90)).forEach(d => d.items.forEach(i => {
    if (i.product_id) prodSales.set(i.product_id, (prodSales.get(i.product_id) || 0) + i.qty * i.price);
  }));
  const topProducts = [...prodSales].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ name: byId('products', id)?.name || '—', v }));
  return {
    score: Math.max(0, Math.min(100, Math.round(score))), alerts, actions, now, prev, cash, projected,
    forecast: { d30: daily * 30, d60: daily * 60, d90: daily * 90 }, topCustomers, topProducts, avgMonthlyExp,
  };
}

PAGES.insights = () => {
  const I = insights();
  const list = (arr) => arr.length ? `<table class="tbl"><tbody>${arr.map((x, i) => `<tr><td>${i + 1}. ${esc(x.name)}</td><td class="r">${money0(x.v)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Not enough data yet.</div>';
  return `
  <div class="grid g2 mb">
    <div class="card"><div class="card-head"><h3>Business health score</h3></div>
      <div class="score">${ring(I.score)}<div><b>${I.score >= 80 ? 'Your business looks healthy' : I.score >= 60 ? 'A few things need attention' : 'Your business needs action'}</b>
      <div class="muted small">Score is calculated from collections, cash, stock, profit and sales trend.</div></div></div></div>
    <div class="card"><div class="card-head"><h3>Revenue forecast</h3><span class="grow"></span><span class="muted small">From last 90 days average</span></div>
      <div class="grid g3">${kpi('Next 30 days', money0(I.forecast.d30))}${kpi('Next 60 days', money0(I.forecast.d60))}${kpi('Next 90 days', money0(I.forecast.d90))}</div>
      <p class="muted small" style="margin:12px 0 0">This month so far: ${money0(I.now.income)} · projected month-end: ${money0(I.projected)}</p></div>
  </div>
  <div class="grid g2 mb">
    <div class="card"><div class="card-head"><h3>Alerts</h3></div>
      ${I.alerts.map(a => `<div class="alert ${a.type}"><span class="dot"></span>${a.text}</div>`).join('') || '<div class="alert good"><span class="dot"></span>No problems found. Keep it up!</div>'}</div>
    <div class="card"><div class="card-head"><h3>What to do next</h3></div>
      ${I.actions.map(a => `<div class="alert info"><span class="dot"></span>${esc(a)}</div>`).join('') || '<div class="empty">Nothing urgent. Good time to plan growth.</div>'}</div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-head"><h3>Top customers</h3><span class="grow"></span><span class="muted small">Last 90 days</span></div>${list(I.topCustomers)}</div>
    <div class="card"><div class="card-head"><h3>Best-selling products</h3><span class="grow"></span><span class="muted small">Last 90 days</span></div>${list(I.topProducts)}</div>
  </div>`;
};

/* ===================== Sales & Purchases ===================== */
PAGES.sales = () => docListPage('sales', [['invoice', 'Invoices'], ['quotation', 'Quotations'], ['sales_order', 'Sales Orders']]);
PAGES.purchases = () => docListPage('purchases', [['bill', 'Purchase Bills'], ['purchase_order', 'Purchase Orders']]);

function docListPage(key, kinds) {
  const kind = UI[key], K = KINDS[kind];
  const docs = S.documents.filter(d => d.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const isSales = K.side === 'sales';
  let cards = '';
  if (K.posts) {
    const out = sum(docs, balOf), over = docs.filter(d => statusOf(d) === 'Overdue');
    cards = `<div class="grid g4 mb">${kpi('Total', money0(sum(docs, d => d.total)), `${docs.length} ${K.label.toLowerCase()}(s)`)}
      ${kpi(isSales ? 'Received' : 'Paid', money0(sum(docs, d => paidOf(d.id))))}
      ${kpi('Outstanding', money0(out), isSales ? 'To collect' : 'To pay')}
      ${kpi('Overdue', money0(sum(over, balOf)), `${over.length} document(s)`, over.length ? 'bad' : '')}</div>`;
  }
  return `<div class="toolbar">${tabs(key, kinds)}<span class="grow"></span>
    <button class="btn primary" onclick="openDocForm('${kind}')">${ic('plus')} New ${K.label}</button></div>
  ${cards}
  <div class="card"><div class="card-head"><h3>${K.label}s</h3><span class="grow"></span>${searchBox()}</div>
  ${table([
    { h: 'Number', f: d => `<b>${esc(d.number)}</b>` },
    { h: isSales ? 'Customer' : 'Supplier', f: d => esc(byId('contacts', d.contact_id)?.name || '—') },
    { h: 'Date', f: d => fmtDate(d.date) },
    { h: kind === 'quotation' ? 'Valid until' : 'Due', f: d => fmtDate(d.due_date) },
    { h: 'Total', r: 1, f: d => fmtN(d.total) },
    ...(K.posts ? [{ h: 'Balance', r: 1, f: d => fmtN(balOf(d)) }] : []),
    { h: 'Status', f: d => badge(statusOf(d)) },
  ], docs, { click: d => `viewDoc('${d.id}')`, empty: `No ${K.label.toLowerCase()}s yet.` })}</div>`;
}

function itemRow(it = {}, sales = true) {
  return `<tr>
    <td><select class="i-prod" onchange="pickProduct(this,${sales})"><option value="">— Custom item —</option>${S.products.slice().sort(byName).map(p => `<option value="${p.id}" ${p.id === it.product_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
    <td><input class="i-desc" value="${esc(it.description || '')}" placeholder="Description"></td>
    <td><input class="i-qty r" type="number" step="any" min="0" value="${it.qty ?? 1}" oninput="recalcDoc()"></td>
    <td><input class="i-price r" type="number" step="any" min="0" value="${it.price ?? 0}" oninput="recalcDoc()"></td>
    <td class="r i-amt">0.00</td>
    <td><button type="button" class="icon-btn" onclick="this.closest('tr').remove();recalcDoc()" aria-label="Remove">${ic('x')}</button></td></tr>`;
}
function addItemRow(sales) { $('#items tbody').insertAdjacentHTML('beforeend', itemRow({}, sales)); recalcDoc(); }
function pickProduct(sel, sales) {
  const p = byId('products', sel.value), tr = sel.closest('tr');
  if (p) { $('.i-desc', tr).value = p.name; $('.i-price', tr).value = sales ? (+p.price || 0) : r2(+p.cost || 0); }
  recalcDoc();
}
function readItems() {
  return $$('#items tbody tr').map(tr => ({
    product_id: $('.i-prod', tr).value || null, description: $('.i-desc', tr).value.trim(),
    qty: num($('.i-qty', tr).value), price: num($('.i-price', tr).value),
  })).filter(i => (i.product_id || i.description) && i.qty > 0);
}
function calcTotals(items, discount, taxRate, landed = 0) {
  const subtotal = r2(sum(items, i => i.qty * i.price));
  const disc = Math.min(Math.max(0, discount), subtotal);
  const tax = r2((subtotal - disc) * taxRate / 100);
  return { subtotal, discount: r2(disc), tax, total: r2(subtotal - disc + tax + landed) };
}
function recalcDoc() {
  const f = $('#mform');
  if (!f || !$('#items')) return;
  $$('#items tbody tr').forEach(tr => { $('.i-amt', tr).textContent = fmtN(num($('.i-qty', tr).value) * num($('.i-price', tr).value)); });
  const t = calcTotals(readItems(), num(f.elements.discount.value), num(f.elements.tax_rate.value), num(f.elements.landed?.value));
  $('#tSub').textContent = fmtN(t.subtotal);
  $('#tTot').textContent = fmtN(t.total);
}

function openDocForm(kind, doc = null, prefill = null) {
  const K = KINDS[kind], sales = K.side === 'sales', ctype = sales ? 'customer' : 'supplier';
  if (!S.warehouses.length) return toast('Please add a warehouse first', 'err');
  const d = doc ? structuredClone(doc) : {
    date: today(), due_date: addDays(today(), kind === 'quotation' ? 15 : 30), discount: 0, tax_rate: 0, landed: 0,
    warehouse_id: mainWh()?.id, ...(prefill || {}),
  };
  if (!d.items?.length) d.items = [{ qty: 1, price: 0 }];
  const contacts = S.contacts.filter(c => c.type === ctype).sort(byName);
  const body = `
  <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
    <label class="field"><span>${sales ? 'Customer' : 'Supplier'} *</span><div class="row-in">
      <select name="contact_id" required><option value="">Select…</option>${contacts.map(c => `<option value="${c.id}" ${c.id === d.contact_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <button type="button" class="btn sm" onclick="quickContact('${ctype}')" title="Add new">+</button></div></label>
    <label class="field"><span>Number *</span><input name="number" value="${esc(d.number || nextNumber(kind))}" required></label>
    <label class="field"><span>Date *</span><input type="date" name="date" value="${d.date}" required></label>
    <label class="field"><span>${kind === 'quotation' ? 'Valid until' : 'Due date'}</span><input type="date" name="due_date" value="${d.due_date || ''}"></label>
    <label class="field"><span>Warehouse</span><select name="warehouse_id">${S.warehouses.map(w => `<option value="${w.id}" ${w.id === d.warehouse_id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>
  </div>
  <div class="table-wrap"><table class="items" id="items"><thead><tr><th>Product</th><th>Description</th><th class="r">Qty</th><th class="r">${sales ? 'Price' : 'Cost'}</th><th class="r">Amount</th><th></th></tr></thead>
    <tbody>${d.items.map(it => itemRow(it, sales)).join('')}</tbody></table></div>
  <button type="button" class="btn sm" onclick="addItemRow(${sales})">${ic('plus')} Add line</button>
  <div class="doc-bottom">
    <label class="field"><span>Notes / terms</span><textarea name="notes" rows="4" placeholder="Payment terms, bank details, delivery notes…">${esc(d.notes || '')}</textarea></label>
    <div class="totals">
      <div><span>Subtotal</span><b id="tSub">0.00</b></div>
      <div><span>Discount (amount)</span><input type="number" step="any" min="0" name="discount" value="${d.discount || 0}" oninput="recalcDoc()"></div>
      <div><span>Tax %</span><input type="number" step="any" min="0" name="tax_rate" value="${d.tax_rate || 0}" oninput="recalcDoc()"></div>
      ${kind === 'bill' ? `<div><span title="Freight, customs, handling — added to product cost">Landed cost</span><input type="number" step="any" min="0" name="landed" value="${d.landed || 0}" oninput="recalcDoc()"></div>` : ''}
      <div class="grand"><span>Total</span><b id="tTot">0.00</b></div>
    </div>
  </div>`;
  openModal(`${doc ? 'Edit' : 'New'} ${K.label}`, body, {
    wide: true, submit: `Save ${K.label}`, after: () => recalcDoc(),
    onSubmit: f => saveDoc(kind, doc, f, d.converted_from || null),
  });
}

async function quickContact(type) {
  const name = prompt(`New ${type} name`);
  if (!name || !name.trim()) return;
  try {
    const c = await ins('contacts', { type, name: name.trim() });
    S.contacts.push(c);
    const sel = $('#mform select[name=contact_id]');
    if (sel) { sel.insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`); sel.value = c.id; }
    toast(`${c.name} added`);
  } catch (e) { toast(e.message, 'err'); }
}

async function saveDoc(kind, existing, f, convertedFrom) {
  const K = KINDS[kind], E = f.elements;
  const items = readItems();
  if (!items.length) throw new Error('Add at least one item with a quantity');
  const landed = kind === 'bill' ? num(E.landed.value) : 0;
  const t = calcTotals(items, num(E.discount.value), num(E.tax_rate.value), landed);
  const row = {
    kind, number: E.number.value.trim(), contact_id: E.contact_id.value, date: E.date.value,
    due_date: E.due_date.value || null, warehouse_id: E.warehouse_id.value || null, items,
    subtotal: t.subtotal, discount: t.discount, tax_rate: num(E.tax_rate.value), tax: t.tax, landed, total: t.total,
    notes: E.notes.value.trim() || null,
  };
  if (!row.contact_id) throw new Error('Please select a ' + (K.side === 'sales' ? 'customer' : 'supplier'));
  if (K.posts) { checkLock(row.date); if (existing) checkLock(existing.date); }
  if (S.documents.some(d => d.kind === kind && d.number === row.number && d.id !== existing?.id)) throw new Error(`Number ${row.number} is already used`);

  if (kind === 'invoice') {
    const need = {};
    items.forEach(i => { if (i.product_id) need[i.product_id] = (need[i.product_id] || 0) + i.qty; });
    const short = Object.entries(need).filter(([pid, qty]) => {
      let avail = stockOf(pid, row.warehouse_id);
      if (existing && existing.warehouse_id === row.warehouse_id) avail += sum(existing.items.filter(i => i.product_id === pid), i => i.qty);
      return qty > avail + 1e-9;
    }).map(([pid]) => byId('products', pid)?.name);
    if (short.length && !confirm(`Not enough stock for: ${short.join(', ')}.\nSave anyway?`)) return false;
    const c = byId('contacts', row.contact_id);
    if (c && +c.credit_limit > 0) {
      const after = contactBalance(c) - (existing ? +existing.total : 0) + row.total;
      if (after > +c.credit_limit && !confirm(`${c.name} will go over the credit limit of ${money(c.credit_limit)} (new balance ${money(after)}). Continue?`)) return false;
    }
  }

  let doc;
  if (existing) { await unpost(existing.id); doc = await upd('documents', existing.id, row); }
  else doc = await ins('documents', { ...row, status: K.posts ? null : 'Open', converted_from: convertedFrom });
  try {
    if (kind === 'invoice') await postInvoice(doc);
    if (kind === 'bill') await postBill(doc, !existing);
  } catch (e) { console.error(e); toast('Saved, but accounting entry failed: ' + e.message, 'err'); }
  if (convertedFrom) await upd('documents', convertedFrom, { status: 'Converted' });
  await refresh();
  toast(`${K.label} ${doc.number} saved`);
}

async function postInvoice(d) {
  const wh = d.warehouse_id || mainWh()?.id;
  let cogs = 0;
  const moves = [];
  for (const it of d.items) {
    if (!it.product_id) continue;
    const p = byId('products', it.product_id);
    cogs += it.qty * (+p?.cost || 0);
    moves.push({ product_id: it.product_id, warehouse_id: wh, qty: -it.qty, date: d.date, ref_type: 'invoice', ref_id: d.id, note: d.number });
  }
  await insMany('stock_moves', moves);
  await postJournal({
    date: d.date, memo: `Invoice ${d.number}`, ref_type: 'invoice', ref_id: d.id, lines: [
      { account_id: acc('ar'), debit: d.total },
      { account_id: acc('sales'), credit: r2(+d.subtotal - +d.discount) },
      { account_id: acc('tax'), credit: d.tax },
      { account_id: acc('cogs'), debit: r2(cogs) },
      { account_id: acc('inventory'), credit: r2(cogs) },
    ],
  });
}

function billOtherAcc(d) {
  // non-stock lines can carry their own expense category (set by Quick Entry); otherwise General Expenses
  const other = (d.items || []).filter(i => !i.product_id);
  const a = other[0]?.account_id;
  return a && other.every(i => i.account_id === a) && byId('accounts', a) ? a : acc('general');
}
async function postBill(d, isNew) {
  const wh = d.warehouse_id || mainWh()?.id;
  const net = Math.max(0, +d.subtotal - +d.discount);
  const factor = +d.subtotal > 0 ? (net + +d.landed) / +d.subtotal : 1;
  let inv = 0;
  const moves = [];
  for (const it of d.items) {
    if (!it.product_id) continue;
    const unit = it.price * factor;
    inv += it.qty * unit;
    if (isNew) {
      const p = byId('products', it.product_id);
      if (p) {
        const oldQ = Math.max(0, stockOf(p.id) + sum(moves.filter(m => m.product_id === p.id), m => m.qty));
        const newCost = (oldQ + it.qty) > 0 ? (oldQ * (+p.cost || 0) + it.qty * unit) / (oldQ + it.qty) : unit;
        p.cost = Math.round(newCost * 10000) / 10000;
        await upd('products', p.id, { cost: p.cost });
      }
    }
    moves.push({ product_id: it.product_id, warehouse_id: wh, qty: it.qty, date: d.date, ref_type: 'bill', ref_id: d.id, note: d.number });
  }
  await insMany('stock_moves', moves);
  const invR = r2(inv);
  await postJournal({
    date: d.date, memo: `Purchase bill ${d.number}`, ref_type: 'bill', ref_id: d.id, lines: [
      { account_id: acc('inventory'), debit: invR },
      { account_id: billOtherAcc(d), debit: r2(+d.total - +d.tax - invR) },
      { account_id: acc('tax'), debit: d.tax },
      { account_id: acc('ap'), credit: d.total },
    ],
  });
}

function viewDoc(id) {
  const d = byId('documents', id);
  if (!d) return;
  const K = KINDS[d.kind], c = byId('contacts', d.contact_id), st = statusOf(d);
  const pays = S.payments.filter(p => p.document_id === id);
  const conv = (K.to || []).map(t => `<button type="button" class="btn sm" onclick="convertDoc('${id}','${t}')">${ic('swap')} To ${KINDS[t].label}</button>`).join('');
  const body = `
  <div class="info-grid">
    <div><span>${K.side === 'sales' ? 'Customer' : 'Supplier'}</span><b>${esc(c?.name || '—')}</b></div>
    <div><span>Date</span><b>${fmtDate(d.date)}</b></div>
    <div><span>${d.kind === 'quotation' ? 'Valid until' : 'Due'}</span><b>${fmtDate(d.due_date) || '—'}</b></div>
    <div><span>Status</span><b>${badge(st)}</b></div>
  </div>
  ${table([
    { h: 'Item', f: i => esc(i.description || byId('products', i.product_id)?.name || '') },
    { h: 'Qty', r: 1, f: i => fmtN(i.qty).replace(/\.00$/, '') },
    { h: 'Price', r: 1, f: i => fmtN(i.price) },
    { h: 'Amount', r: 1, f: i => fmtN(i.qty * i.price) },
  ], d.items)}
  <div class="doc-bottom"><div>${d.notes ? `<div class="muted small"><b>Notes</b><br>${esc(d.notes).replace(/\n/g, '<br>')}</div>` : ''}
    ${pays.length ? `<h4 style="margin:14px 0 6px">Payments</h4>${table([
    { h: 'Date', f: p => fmtDate(p.date) }, { h: 'Method', f: p => esc(p.method || '') },
    { h: 'Account', f: p => esc(byId('accounts', p.account_id)?.name || '') }, { h: 'Amount', r: 1, f: p => fmtN(p.amount) },
  ], pays)}` : ''}</div>
    <div class="totals">
      <div><span>Subtotal</span><b>${fmtN(d.subtotal)}</b></div>
      ${+d.discount ? `<div><span>Discount</span><b>− ${fmtN(d.discount)}</b></div>` : ''}
      ${+d.tax ? `<div><span>Tax (${+d.tax_rate}%)</span><b>${fmtN(d.tax)}</b></div>` : ''}
      ${+d.landed ? `<div><span>Landed cost</span><b>${fmtN(d.landed)}</b></div>` : ''}
      <div class="grand"><span>Total</span><b>${money(d.total)}</b></div>
      ${K.posts ? `<div><span>Paid</span><b>${fmtN(paidOf(id))}</b></div><div><span>Balance</span><b>${money(balOf(d))}</b></div>` : ''}
    </div></div>`;
  const footer = `<button type="button" class="btn danger sm owner-only" onclick="deleteDoc('${id}')">${ic('trash')} Delete</button>
    <button type="button" class="btn sm" onclick="printDoc('${id}')">${ic('print')} Print / PDF</button>
    <button type="button" class="btn sm" onclick="shareDoc('${id}')">${ic('chat')} WhatsApp</button>
    ${st !== 'Converted' ? `<button type="button" class="btn sm" onclick="closeModal();openDocForm('${d.kind}', byId('documents','${id}'))">${ic('edit')} Edit</button>` : ''}
    ${K.posts && balOf(d) > 0.009 ? `<button type="button" class="btn primary sm" onclick="closeModal();openPaymentForm('${d.kind === 'invoice' ? 'in' : 'out'}',{contact_id:'${d.contact_id}',document_id:'${id}'})">${ic('wallet')} ${d.kind === 'invoice' ? 'Receive' : 'Make'} payment</button>` : ''}
    ${st !== 'Converted' ? conv : ''}`;
  openModal(`${K.label} ${d.number}`, body, { wide: true, footer, noFocus: true });
}

function convertDoc(id, target) {
  const d = byId('documents', id);
  closeModal();
  openDocForm(target, null, {
    contact_id: d.contact_id, items: structuredClone(d.items), discount: d.discount, tax_rate: d.tax_rate,
    notes: d.notes, warehouse_id: d.warehouse_id, converted_from: id,
  });
}

async function deleteDoc(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const d = byId('documents', id), K = KINDS[d.kind];
  try {
    if (S.payments.some(p => p.document_id === id)) throw new Error('This document has payments. Delete the payments first (Payments page).');
    if (K.posts) checkLock(d.date);
    if (!confirm(`Delete ${K.label} ${d.number}? This cannot be undone.`)) return;
    await unpost(id);
    await q(sb.from('documents').update({ converted_from: null }).eq('converted_from', id));
    await del('documents', id);
    closeModal();
    await refresh();
    toast(`${K.label} deleted`);
  } catch (e) { toast(e.message, 'err'); }
}

function docPrintInner(d) {
  const K = KINDS[d.kind], c = byId('contacts', d.contact_id) || {};
  return `<div class="meta"><div><div class="muted">${K.side === 'sales' ? 'Bill to' : 'Supplier'}</div><b>${esc(c.name || '')}</b><br>${esc(c.address || '')}<br>${esc(c.phone || '')} ${esc(c.email || '')}</div>
    <div style="text-align:right"><b>${esc(d.number)}</b><br>Date: ${fmtDate(d.date)}${d.due_date ? `<br>${d.kind === 'quotation' ? 'Valid until' : 'Due'}: ${fmtDate(d.due_date)}` : ''}${K.posts ? `<br>Status: ${statusOf(d)}` : ''}</div></div>
    <table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
    ${d.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description || byId('products', i.product_id)?.name || '')}</td><td class="r">${+i.qty}</td><td class="r">${fmtN(i.price)}</td><td class="r">${fmtN(i.qty * i.price)}</td></tr>`).join('')}
    </tbody></table>
    <div class="sum"><div><span>Subtotal</span><span>${fmtN(d.subtotal)}</span></div>
    ${+d.discount ? `<div><span>Discount</span><span>− ${fmtN(d.discount)}</span></div>` : ''}
    ${+d.tax ? `<div><span>Tax (${+d.tax_rate}%)</span><span>${fmtN(d.tax)}</span></div>` : ''}
    ${+d.landed ? `<div><span>Landed cost</span><span>${fmtN(d.landed)}</span></div>` : ''}
    <div class="g"><span>Total</span><span>${money(d.total)}</span></div>
    ${K.posts ? `<div><span>Paid</span><span>${fmtN(paidOf(d.id))}</span></div><div class="g"><span>Balance due</span><span>${money(balOf(d))}</span></div>` : ''}</div>
    ${d.notes ? `<p style="margin-top:24px"><b>Notes</b><br>${esc(d.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
}
function printDoc(id) { const d = byId('documents', id); printHTML(`${KINDS[d.kind].label} ${d.number}`, docPrintInner(d)); }
function shareDoc(id) {
  const d = byId('documents', id), K = KINDS[d.kind], c = byId('contacts', d.contact_id);
  const lines = [`*${S.business?.name || 'MK Finances'}*`, `${K.label}: ${d.number}`, `Date: ${fmtDate(d.date)}`];
  d.items.forEach(i => lines.push(`• ${i.description || byId('products', i.product_id)?.name || ''} — ${+i.qty} × ${fmtN(i.price)}`));
  lines.push(`Total: ${money(d.total)}`);
  if (K.posts) { lines.push(`Paid: ${money(paidOf(id))}`, `*Balance due: ${money(balOf(d))}*`); if (d.due_date) lines.push(`Due date: ${fmtDate(d.due_date)}`); }
  lines.push('', 'Thank you!');
  window.open(waLink(c?.phone, lines.join('\n')), '_blank');
}

/* ===================== Payments ===================== */
PAGES.payments = () => {
  const dir = UI.payments;
  const list = S.payments.filter(p => p.direction === dir).sort((a, b) => b.date.localeCompare(a.date));
  const ms = monthStart(today());
  return `<div class="toolbar">${tabs('payments', [['in', 'Received from customers'], ['out', 'Paid to suppliers']])}<span class="grow"></span>
    <button class="btn primary" onclick="openPaymentForm('${dir}')">${ic('plus')} ${dir === 'in' ? 'Receive Payment' : 'Make Payment'}</button></div>
  <div class="grid g3 mb">${kpi('This month', money0(sum(list.filter(p => p.date >= ms), p => p.amount)))}${kpi('All time', money0(sum(list, p => p.amount)))}${kpi('Payments', String(list.length))}</div>
  <div class="card"><div class="card-head"><h3>${dir === 'in' ? 'Payments received' : 'Payments made'}</h3><span class="grow"></span>${searchBox()}</div>
  ${table([
    { h: 'Date', f: p => fmtDate(p.date) },
    { h: dir === 'in' ? 'Customer' : 'Supplier', f: p => esc(byId('contacts', p.contact_id)?.name || '—') },
    { h: 'Against', f: p => p.document_id ? `<a href="javascript:void 0" onclick="event.stopPropagation();viewDoc('${p.document_id}')">${esc(byId('documents', p.document_id)?.number || '')}</a>` : '<span class="muted">On account</span>' },
    { h: 'Account', f: p => esc(byId('accounts', p.account_id)?.name || '') },
    { h: 'Method', f: p => esc(p.method || '') },
    { h: 'Amount', r: 1, f: p => `<b>${fmtN(p.amount)}</b>` },
    { h: '', r: 1, f: p => `<div class="acts">${actBtn('trash', `deletePayment('${p.id}')`, 'Delete')}</div>` },
  ], list, { empty: 'No payments yet.' })}</div>`;
};

function payDocOptions(direction, contactId, selected) {
  const kind = direction === 'in' ? 'invoice' : 'bill';
  const docs = S.documents.filter(d => d.kind === kind && d.contact_id === contactId && balOf(d) > 0.009);
  return `<option value="">On account (not linked to a ${kind})</option>` + docs.map(d => `<option value="${d.id}" data-bal="${balOf(d)}" ${d.id === selected ? 'selected' : ''}>${esc(d.number)} — balance ${fmtN(balOf(d))}</option>`).join('');
}
function openPaymentForm(direction, preset = {}) {
  const sales = direction === 'in';
  const contacts = S.contacts.filter(c => c.type === (sales ? 'customer' : 'supplier')).sort(byName);
  const body = `<div class="form-grid">
    <label class="field full"><span>${sales ? 'Customer' : 'Supplier'} *</span><select name="contact_id" required onchange="payContactChanged('${direction}')"><option value="">Select…</option>
      ${contacts.map(c => `<option value="${c.id}" ${c.id === preset.contact_id ? 'selected' : ''}>${esc(c.name)} (balance ${fmtN(contactBalance(c))})</option>`).join('')}</select></label>
    <label class="field full"><span>Against ${sales ? 'invoice' : 'bill'}</span><select name="document_id" id="payDoc" onchange="payDocChanged()">${payDocOptions(direction, preset.contact_id, preset.document_id)}</select></label>
    ${fieldHTML({ k: 'amount', label: 'Amount', type: 'number', required: true, min: 0 }, '')}
    ${fieldHTML({ k: 'date', label: 'Date', type: 'date', required: true }, today())}
    ${fieldHTML({ k: 'account_id', label: sales ? 'Deposit to' : 'Pay from', type: 'select', required: true, options: bankOpts(), placeholder: false }, banks()[0]?.id)}
    ${fieldHTML({ k: 'method', label: 'Method', type: 'select', placeholder: false, options: ['Cash', 'Bank Transfer', 'Cheque', 'Card', 'Online / Wallet'].map(x => [x, x]) }, 'Cash')}
    ${fieldHTML({ k: 'note', label: 'Note', full: true, ph: 'Optional' })}
  </div>`;
  openModal(sales ? 'Receive Payment' : 'Make Payment', body, {
    submit: 'Save Payment', after: () => payDocChanged(), onSubmit: f => savePayment(direction, f),
  });
}
function payContactChanged(direction) { const f = $('#mform'); $('#payDoc').innerHTML = payDocOptions(direction, f.elements.contact_id.value); payDocChanged(); }
function payDocChanged() { const o = $('#payDoc')?.selectedOptions[0]; if (o?.dataset.bal) $('#mform').elements.amount.value = o.dataset.bal; }

async function savePayment(direction, f) {
  const E = f.elements;
  const row = {
    direction, contact_id: E.contact_id.value || null, document_id: E.document_id.value || null, account_id: E.account_id.value,
    amount: r2(num(E.amount.value)), date: E.date.value, method: E.method.value, note: E.note.value.trim() || null,
  };
  if (!row.contact_id) throw new Error('Select a contact');
  if (!row.account_id) throw new Error('Add a bank or cash account first');
  if (row.amount <= 0) throw new Error('Enter an amount');
  checkLock(row.date);
  if (row.document_id) {
    const d = byId('documents', row.document_id);
    if (row.amount > balOf(d) + 0.009 && !confirm(`Amount is more than the balance (${fmtN(balOf(d))}). Continue?`)) return false;
  }
  const p = await ins('payments', row);
  const c = byId('contacts', row.contact_id);
  await postJournal({
    date: row.date, memo: `${direction === 'in' ? 'Received from' : 'Paid to'} ${c?.name || ''}`, ref_type: 'payment', ref_id: p.id,
    lines: direction === 'in'
      ? [{ account_id: row.account_id, debit: row.amount }, { account_id: acc('ar'), credit: row.amount }]
      : [{ account_id: acc('ap'), debit: row.amount }, { account_id: row.account_id, credit: row.amount }],
  });
  await refresh();
  toast('Payment saved');
}
async function deletePayment(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const p = byId('payments', id);
  try {
    checkLock(p.date);
    if (!confirm(`Delete this payment of ${money(p.amount)}?`)) return;
    await unpost(id); await del('payments', id);
    await refresh(); toast('Payment deleted');
  } catch (e) { toast(e.message, 'err'); }
}

/* ===================== Expenses ===================== */
PAGES.expenses = () => {
  const list = S.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  const ms = monthStart(today());
  const month = list.filter(e => e.date >= ms);
  const byCat = new Map();
  month.forEach(e => byCat.set(e.account_id, (byCat.get(e.account_id) || 0) + +e.amount));
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
  return `<div class="toolbar"><span class="grow"></span><button class="btn" onclick="setTab('accounting','coa');go('accounting')">Manage categories</button>
    <button class="btn primary" onclick="openExpenseForm()">${ic('plus')} Add Expense</button></div>
  <div class="grid g3 mb">${kpi('This month', money0(sum(month, e => e.amount)), `${month.length} expense(s)`)}
    ${kpi('Biggest category', top ? esc(byId('accounts', top[0])?.name || '') : '—', top ? money0(top[1]) : '')}
    ${kpi('All time', money0(sum(list, e => e.amount)))}</div>
  <div class="card"><div class="card-head"><h3>Expenses</h3><span class="grow"></span>${searchBox()}</div>
  ${table([
    { h: 'Date', f: e => fmtDate(e.date) },
    { h: 'Category', f: e => `<b>${esc(byId('accounts', e.account_id)?.name || '')}</b>` },
    { h: 'Paid to', f: e => esc(e.payee || '') },
    { h: 'Paid from', f: e => esc(byId('accounts', e.paid_from)?.name || '') },
    { h: 'Note', f: e => `<span class="muted">${esc(e.note || '')}</span>` },
    { h: 'Amount', r: 1, f: e => `<b>${fmtN(e.amount)}</b>` },
    { h: '', r: 1, f: e => `<div class="acts">${actBtn('edit', `openExpenseForm('${e.id}')`, 'Edit')}${actBtn('trash', `deleteExpense('${e.id}')`, 'Delete')}</div>` },
  ], list, { empty: 'No expenses recorded yet.' })}</div>`;
};
function openExpenseForm(id = null) {
  const e = id ? byId('expenses', id) : null;
  const expAccs = S.accounts.filter(a => a.type === 'expense' && a.sys !== 'cogs').sort(byName).map(a => [a.id, a.name]);
  const fields = [
    { k: 'account_id', label: 'Category', type: 'select', required: true, options: expAccs },
    { k: 'amount', label: 'Amount', type: 'number', required: true, min: 0 },
    { k: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { k: 'paid_from', label: 'Paid from', type: 'select', required: true, options: bankOpts(), placeholder: false, default: banks()[0]?.id },
    { k: 'payee', label: 'Paid to', ph: 'e.g. K-Electric, landlord' },
    { k: 'note', label: 'Note', ph: 'Optional' },
  ];
  formModal(e ? 'Edit Expense' : 'Add Expense', fields, e, async v => {
    if (v.amount <= 0) throw new Error('Enter an amount');
    checkLock(v.date); if (e) checkLock(e.date);
    let row;
    if (e) { await unpost(e.id); row = await upd('expenses', e.id, v); } else row = await ins('expenses', v);
    await postJournal({
      date: row.date, memo: `Expense: ${byId('accounts', row.account_id)?.name || ''}${row.payee ? ' — ' + row.payee : ''}`, ref_type: 'expense', ref_id: row.id,
      lines: [{ account_id: row.account_id, debit: row.amount }, { account_id: row.paid_from, credit: row.amount }],
    });
    await refresh(); toast('Expense saved');
  });
}
async function deleteExpense(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const e = byId('expenses', id);
  try {
    checkLock(e.date);
    if (!confirm('Delete this expense?')) return;
    await unpost(id); await del('expenses', id);
    await refresh(); toast('Expense deleted');
  } catch (err) { toast(err.message, 'err'); }
}

/* ===================== Contacts ===================== */
PAGES.contacts = () => {
  const type = UI.contacts;
  const list = S.contacts.filter(c => c.type === type).sort(byName);
  return `<div class="toolbar">${tabs('contacts', [['customer', 'Customers'], ['supplier', 'Suppliers']])}<span class="grow"></span>
    <button class="btn primary" onclick="openContactForm('${type}')">${ic('plus')} Add ${type === 'customer' ? 'Customer' : 'Supplier'}</button></div>
  <div class="grid g3 mb">${kpi(type === 'customer' ? 'Customers' : 'Suppliers', String(list.length))}
    ${kpi(type === 'customer' ? 'Total they owe you' : 'Total you owe', money0(sum(list, contactBalance)))}
    ${kpi('With balance', String(list.filter(c => contactBalance(c) > 0.009).length))}</div>
  <div class="card"><div class="card-head"><h3>${type === 'customer' ? 'Customers' : 'Suppliers'}</h3><span class="grow"></span>${searchBox('Search name, phone…')}</div>
  ${table([
    { h: 'Name', f: c => `<b>${esc(c.name)}</b>${c.email ? `<div class="muted small">${esc(c.email)}</div>` : ''}` },
    { h: 'Phone', f: c => esc(c.phone || '') },
    { h: 'Credit limit', r: 1, f: c => +c.credit_limit ? fmtN(c.credit_limit) : '—' },
    { h: 'Balance', r: 1, f: c => { const b = contactBalance(c); return `<b class="${b > 0.009 ? 'down' : ''}">${fmtN(b)}</b>`; } },
    { h: '', r: 1, f: c => `<div class="acts">${actBtn('file', `contactStatement('${c.id}')`, 'Statement')}${c.phone ? actBtn('chat', `window.open(waLink('${esc(c.phone)}',''),'_blank')`, 'WhatsApp') : ''}${actBtn('edit', `openContactForm('${c.type}','${c.id}')`, 'Edit')}${actBtn('trash', `deleteContact('${c.id}')`, 'Delete')}</div>` },
  ], list, { click: c => `contactStatement('${c.id}')`, empty: `No ${type}s yet. Add your first one.` })}</div>`;
};
function openContactForm(type, id = null) {
  const c = id ? byId('contacts', id) : null;
  const fields = [
    { k: 'name', label: 'Name', required: true, full: true },
    { k: 'phone', label: 'Phone / WhatsApp', ph: '03xx xxxxxxx' },
    { k: 'email', label: 'Email', type: 'email' },
    { k: 'address', label: 'Address', full: true },
    { k: 'opening_balance', label: type === 'customer' ? 'Opening balance (they owe you)' : 'Opening balance (you owe them)', type: 'number', default: 0 },
    { k: 'credit_limit', label: 'Credit limit (0 = no limit)', type: 'number', default: 0, min: 0 },
    { k: 'notes', label: 'Notes', type: 'textarea', full: true, rows: 2 },
  ];
  formModal(`${c ? 'Edit' : 'Add'} ${type === 'customer' ? 'Customer' : 'Supplier'}`, fields, c, async v => {
    const row = c ? await upd('contacts', c.id, v) : await ins('contacts', { ...v, type });
    await unpost(row.id);
    const ob = r2(+row.opening_balance);
    if (ob) {
      const date = (row.created_at || '').slice(0, 10) || today();
      await postJournal({
        date, memo: `Opening balance — ${row.name}`, ref_type: 'opening', ref_id: row.id,
        lines: type === 'customer'
          ? [{ account_id: acc('ar'), debit: ob }, { account_id: acc('obe'), credit: ob }]
          : [{ account_id: acc('obe'), debit: ob }, { account_id: acc('ap'), credit: ob }],
      });
    }
    await refresh(); toast(`${row.name} saved`);
  });
}
async function deleteContact(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const c = byId('contacts', id);
  try {
    if (S.documents.some(d => d.contact_id === id) || S.payments.some(p => p.contact_id === id)) throw new Error(`${c.name} has documents or payments and cannot be deleted.`);
    if (!confirm(`Delete ${c.name}?`)) return;
    await unpost(id); await del('contacts', id);
    await refresh(); toast('Deleted');
  } catch (e) { toast(e.message, 'err'); }
}
function statementRows(c) {
  const isCust = c.type === 'customer';
  const ev = [];
  if (+c.opening_balance) ev.push({ date: (c.created_at || '').slice(0, 10), text: 'Opening balance', due: +c.opening_balance, paid: 0 });
  S.documents.filter(d => d.kind === (isCust ? 'invoice' : 'bill') && d.contact_id === c.id).forEach(d => ev.push({ date: d.date, text: `${KINDS[d.kind].label} ${d.number}`, due: +d.total, paid: 0 }));
  S.payments.filter(p => p.direction === (isCust ? 'in' : 'out') && p.contact_id === c.id).forEach(p => ev.push({ date: p.date, text: `Payment${p.method ? ' (' + p.method + ')' : ''}${p.document_id ? ' — ' + (byId('documents', p.document_id)?.number || '') : ''}`, due: 0, paid: +p.amount }));
  ev.sort((a, b) => a.date.localeCompare(b.date) || b.due - a.due);
  let bal = 0;
  ev.forEach(e => { bal = r2(bal + e.due - e.paid); e.bal = bal; });
  return ev;
}
function statementTable(c) {
  const rows = statementRows(c);
  return `<table class="tbl"><thead><tr><th>Date</th><th>Details</th><th class="r">${c.type === 'customer' ? 'Billed' : 'Bills'}</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead><tbody>
    ${rows.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.text)}</td><td class="r">${e.due ? fmtN(e.due) : ''}</td><td class="r">${e.paid ? fmtN(e.paid) : ''}</td><td class="r"><b>${fmtN(e.bal)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No transactions yet.</td></tr>'}
    <tr class="grand"><td colspan="4">${c.type === 'customer' ? 'Amount due from' : 'Amount due to'} ${esc(c.name)}</td><td class="r">${money(contactBalance(c))}</td></tr></tbody></table>`;
}
function contactStatement(id) {
  const c = byId('contacts', id);
  openModal(`Statement — ${c.name}`, `<div class="info-grid"><div><span>Phone</span><b>${esc(c.phone || '—')}</b></div><div><span>Email</span><b>${esc(c.email || '—')}</b></div><div><span>Credit limit</span><b>${+c.credit_limit ? fmtN(c.credit_limit) : '—'}</b></div><div><span>Balance</span><b>${fmtN(contactBalance(c))}</b></div></div><div class="table-wrap">${statementTable(c)}</div>`, {
    wide: true, noFocus: true,
    footer: `<button type="button" class="btn sm" onclick="printStatement('${id}')">${ic('print')} Print / PDF</button>
      <button type="button" class="btn sm" onclick="shareStatement('${id}')">${ic('chat')} WhatsApp</button>
      ${c.type === 'customer' ? `<button type="button" class="btn sm" onclick="closeModal();openDocForm('invoice',null,{contact_id:'${id}'})">${ic('receipt')} New invoice</button>` : `<button type="button" class="btn sm" onclick="closeModal();openDocForm('bill',null,{contact_id:'${id}'})">${ic('cart')} New bill</button>`}
      <button type="button" class="btn primary sm" onclick="closeModal();openPaymentForm('${c.type === 'customer' ? 'in' : 'out'}',{contact_id:'${id}'})">${ic('wallet')} ${c.type === 'customer' ? 'Receive' : 'Make'} payment</button>`,
  });
}
function printStatement(id) {
  const c = byId('contacts', id);
  printHTML('Statement of Account', `<div class="meta"><div><div class="muted">Account</div><b>${esc(c.name)}</b><br>${esc(c.address || '')}<br>${esc(c.phone || '')}</div><div style="text-align:right">Date: ${fmtDate(today())}</div></div>${statementTable(c)}`);
}
function shareStatement(id) {
  const c = byId('contacts', id);
  const rows = statementRows(c).slice(-8);
  const text = [`*${S.business?.name || 'MK Finances'}* — Account statement`, `Dear ${c.name},`, '',
    ...rows.map(e => `${fmtDate(e.date)}: ${e.text} ${e.due ? '+' + fmtN(e.due) : '−' + fmtN(e.paid)}`),
    '', `*Balance: ${money(contactBalance(c))}*`, '', 'Thank you!'].join('\n');
  window.open(waLink(c.phone, text), '_blank');
}

/* ===================== Products & stock ===================== */
PAGES.inventory = () => {
  const tab = UI.inventory;
  const head = `<div class="toolbar">${tabs('inventory', [['products', 'Products'], ['warehouses', 'Warehouses'], ['moves', 'Stock movements']])}<span class="grow"></span>
    ${tab === 'warehouses' ? `<button class="btn primary" onclick="openWarehouseForm()">${ic('plus')} Add Warehouse</button>` : `<button class="btn primary" onclick="openProductForm()">${ic('plus')} Add Product</button>`}</div>`;
  if (tab === 'warehouses') {
    return head + `<div class="card">${table([
      { h: 'Warehouse', f: w => `<b>${esc(w.name)}</b>` },
      { h: 'Items in stock', r: 1, f: w => String(S.products.filter(p => stockOf(p.id, w.id) > 0).length) },
      { h: 'Stock value', r: 1, f: w => fmtN(sum(S.products, p => stockOf(p.id, w.id) * +p.cost)) },
      { h: '', r: 1, f: w => `<div class="acts">${actBtn('edit', `openWarehouseForm('${w.id}')`, 'Rename')}${actBtn('trash', `deleteWarehouse('${w.id}')`, 'Delete')}</div>` },
    ], S.warehouses)}</div>`;
  }
  if (tab === 'moves') {
    const moves = S.stock_moves.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 500);
    const L = { invoice: 'Sale', bill: 'Purchase', opening: 'Opening stock', adjust: 'Adjustment', transfer: 'Transfer' };
    return head + `<div class="card"><div class="card-head"><h3>Latest stock movements</h3><span class="grow"></span>${searchBox()}</div>${table([
      { h: 'Date', f: m => fmtDate(m.date) },
      { h: 'Product', f: m => `<b>${esc(byId('products', m.product_id)?.name || '')}</b>` },
      { h: 'Warehouse', f: m => esc(byId('warehouses', m.warehouse_id)?.name || '') },
      { h: 'Type', f: m => esc(L[m.ref_type] || m.ref_type || '') },
      { h: 'Ref / note', f: m => `<span class="muted">${esc(m.note || '')}</span>` },
      { h: 'Qty', r: 1, f: m => `<b class="${+m.qty < 0 ? 'down' : 'up'}">${+m.qty > 0 ? '+' : ''}${+m.qty}</b>` },
      { h: '', r: 1, f: m => ['adjust', 'transfer'].includes(m.ref_type) ? `<div class="acts">${actBtn('trash', `deleteMove('${m.ref_id}')`, 'Undo')}</div>` : '' },
    ], moves, { empty: 'No stock movements yet.' })}</div>`;
  }
  const prods = S.products.slice().sort(byName);
  return head + `<div class="grid g4 mb">${kpi('Products', String(prods.length))}
    ${kpi('Stock value (cost)', money0(sum(prods, p => stockOf(p.id) * +p.cost)))}
    ${kpi('Retail value', money0(sum(prods, p => stockOf(p.id) * +p.price)))}
    ${kpi('Low stock', String(lowStock().length), 'At or below reorder level', lowStock().length ? 'bad' : '')}</div>
  <div class="card"><div class="card-head"><h3>Products</h3><span class="grow"></span>${searchBox('Search name, SKU…')}</div>
  ${table([
    { h: 'Product', f: p => `<b>${esc(p.name)}</b><div class="muted small">${esc([p.sku, p.category].filter(Boolean).join(' · '))}</div>` },
    { h: 'Price', r: 1, f: p => fmtN(p.price) },
    { h: 'Cost', r: 1, f: p => fmtN(p.cost) },
    { h: 'In stock', r: 1, f: p => `<b>${stockOf(p.id)}</b> <span class="muted small">${esc(p.unit || '')}</span>` },
    { h: 'Value', r: 1, f: p => fmtN(stockOf(p.id) * +p.cost) },
    { h: 'Status', f: p => (+p.reorder_level > 0 && stockOf(p.id) <= +p.reorder_level) ? badge('Low') : '<span class="badge b-paid">OK</span>' },
    { h: '', r: 1, f: p => `<div class="acts">${actBtn('plus', `adjustStock('${p.id}')`, 'Adjust stock')}${S.warehouses.length > 1 ? actBtn('swap', `transferStock('${p.id}')`, 'Transfer') : ''}${actBtn('edit', `openProductForm('${p.id}')`, 'Edit')}${actBtn('trash', `deleteProduct('${p.id}')`, 'Delete')}</div>` },
  ], prods, { empty: 'No products yet. Add your first product.' })}</div>`;
};
function openProductForm(id = null) {
  const p = id ? byId('products', id) : null;
  const whOpts = S.warehouses.map(w => [w.id, w.name]);
  const fields = [
    { k: 'name', label: 'Product name', required: true, full: true },
    { k: 'sku', label: 'SKU / code' },
    { k: 'category', label: 'Category' },
    { k: 'price', label: 'Selling price', type: 'number', default: 0, min: 0 },
    { k: 'cost', label: 'Cost price', type: 'number', default: 0, min: 0, hint: 'Updated automatically from purchase bills' },
    { k: 'unit', label: 'Unit', default: 'pcs', ph: 'pcs, kg, box…' },
    { k: 'reorder_level', label: 'Reorder level (low-stock alert)', type: 'number', default: 0, min: 0 },
    ...(!p ? [{ k: 'opening_qty', label: 'Opening stock qty', type: 'number', default: 0, min: 0 },
      { k: 'opening_wh', label: 'In warehouse', type: 'select', options: whOpts, placeholder: false, default: mainWh()?.id }] : []),
  ];
  formModal(p ? 'Edit Product' : 'Add Product', fields, p, async v => {
    const { opening_qty: oq, opening_wh: owh, ...row } = v;
    if (p) { await upd('products', p.id, row); }
    else {
      const np = await ins('products', row);
      if (oq > 0) {
        await ins('stock_moves', { product_id: np.id, warehouse_id: owh || mainWh().id, qty: oq, date: today(), ref_type: 'opening', ref_id: np.id, note: 'Opening stock' });
        await postJournal({
          date: today(), memo: `Opening stock — ${np.name}`, ref_type: 'opening', ref_id: np.id,
          lines: [{ account_id: acc('inventory'), debit: r2(oq * +np.cost) }, { account_id: acc('obe'), credit: r2(oq * +np.cost) }],
        });
      }
    }
    await refresh(); toast('Product saved');
  });
}
async function deleteProduct(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const p = byId('products', id);
  try {
    if (S.documents.some(d => d.items.some(i => i.product_id === id))) throw new Error(`${p.name} is used in documents and cannot be deleted.`);
    if (!confirm(`Delete ${p.name}?`)) return;
    await unpost(id);
    for (const m of S.stock_moves.filter(x => x.product_id === id && x.ref_id && x.ref_id !== id)) await unpost(m.ref_id);
    await del('products', id);
    await refresh(); toast('Product deleted');
  } catch (e) { toast(e.message, 'err'); }
}
function adjustStock(id) {
  const p = byId('products', id);
  formModal(`Adjust stock — ${p.name}`, [
    { k: 'mode', label: 'Type', type: 'select', placeholder: false, options: [['add', 'Add stock (found / received)'], ['remove', 'Remove stock (damaged / lost / used)']] },
    { k: 'qty', label: 'Quantity', type: 'number', required: true, min: 0 },
    { k: 'warehouse_id', label: 'Warehouse', type: 'select', placeholder: false, options: S.warehouses.map(w => [w.id, `${w.name} (in stock: ${stockOf(id, w.id)})`]) },
    { k: 'date', label: 'Date', type: 'date', default: today(), required: true },
    { k: 'note', label: 'Reason', full: true },
  ], {}, async v => {
    if (v.qty <= 0) throw new Error('Enter a quantity');
    checkLock(v.date);
    const ref = uuid(), qty = v.mode === 'add' ? v.qty : -v.qty, value = r2(v.qty * +p.cost);
    await ins('stock_moves', { product_id: id, warehouse_id: v.warehouse_id, qty, date: v.date, ref_type: 'adjust', ref_id: ref, note: v.note || 'Stock adjustment' });
    await postJournal({
      date: v.date, memo: `Stock adjustment — ${p.name}`, ref_type: 'adjust', ref_id: ref,
      lines: v.mode === 'add'
        ? [{ account_id: acc('inventory'), debit: value }, { account_id: acc('obe'), credit: value }]
        : [{ account_id: acc('cogs'), debit: value }, { account_id: acc('inventory'), credit: value }],
    });
    await refresh(); toast('Stock updated');
  });
}
function transferStock(id) {
  const p = byId('products', id);
  const opts = S.warehouses.map(w => [w.id, `${w.name} (${stockOf(id, w.id)})`]);
  formModal(`Transfer stock — ${p.name}`, [
    { k: 'from', label: 'From warehouse', type: 'select', options: opts, required: true },
    { k: 'to', label: 'To warehouse', type: 'select', options: opts, required: true },
    { k: 'qty', label: 'Quantity', type: 'number', required: true, min: 0 },
    { k: 'date', label: 'Date', type: 'date', default: today(), required: true },
  ], {}, async v => {
    if (v.from === v.to) throw new Error('Choose two different warehouses');
    if (v.qty <= 0) throw new Error('Enter a quantity');
    if (v.qty > stockOf(id, v.from) && !confirm('Not enough stock in the source warehouse. Continue?')) return false;
    const ref = uuid(), note = `${byId('warehouses', v.from).name} → ${byId('warehouses', v.to).name}`;
    await insMany('stock_moves', [
      { product_id: id, warehouse_id: v.from, qty: -v.qty, date: v.date, ref_type: 'transfer', ref_id: ref, note },
      { product_id: id, warehouse_id: v.to, qty: v.qty, date: v.date, ref_type: 'transfer', ref_id: ref, note },
    ]);
    await refresh(); toast('Stock transferred');
  });
}
async function deleteMove(ref) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  if (!confirm('Undo this stock movement?')) return;
  try { await unpost(ref); await refresh(); toast('Movement removed'); } catch (e) { toast(e.message, 'err'); }
}
function openWarehouseForm(id = null) {
  const w = id ? byId('warehouses', id) : null;
  formModal(w ? 'Rename Warehouse' : 'Add Warehouse', [{ k: 'name', label: 'Warehouse / branch name', required: true, full: true }], w, async v => {
    if (w) await upd('warehouses', w.id, v); else await ins('warehouses', v);
    await refresh(); toast('Warehouse saved');
  });
}
async function deleteWarehouse(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  try {
    if (S.warehouses.length <= 1) throw new Error('You need at least one warehouse.');
    if (S.stock_moves.some(m => m.warehouse_id === id)) throw new Error('This warehouse has stock history and cannot be deleted.');
    if (!confirm('Delete this warehouse?')) return;
    await del('warehouses', id); await refresh(); toast('Deleted');
  } catch (e) { toast(e.message, 'err'); }
}

/* ===================== Bank & cash ===================== */
PAGES.banking = () => {
  const list = banks();
  if (!list.find(a => a.id === UI.bankAcc)) UI.bankAcc = list[0]?.id || null;
  const s = sums(null, null);
  const sel = byId('accounts', UI.bankAcc);
  let txHTML = '<div class="empty">Add a bank or cash account to start.</div>';
  if (sel) {
    const lines = S.journal_lines.filter(l => l.account_id === sel.id).map(l => ({ ...l, e: S.entryById.get(l.entry_id) })).filter(l => l.e)
      .sort((a, b) => a.e.date.localeCompare(b.e.date) || String(a.created_at).localeCompare(String(b.created_at)));
    let bal = 0;
    lines.forEach(l => { bal = r2(bal + +l.debit - +l.credit); l.bal = bal; });
    const recBal = r2(sum(lines.filter(l => l.reconciled), l => +l.debit - +l.credit));
    txHTML = `<div class="card mb"><div class="card-head"><h3>Reconcile ${esc(sel.name)}</h3></div>
      <p class="muted small" style="margin:0 0 12px">Tick each transaction that also appears on your bank statement. When the difference is 0, your books match the bank.</p>
      <div class="range"><label class="field"><span>Bank statement balance</span><input type="number" step="any" id="stmtBal" oninput="calcRec(${recBal})"></label>
      <div class="kpi" style="padding:10px 14px"><span>Ticked balance</span><b style="font-size:18px">${fmtN(recBal)}</b></div>
      <div class="kpi" style="padding:10px 14px"><span>Difference</span><b style="font-size:18px" id="recDiff">—</b></div></div></div>
      <div class="card"><div class="card-head"><h3>Transactions</h3><span class="grow"></span>${searchBox()}</div>
      ${table([
        { h: '✓', f: l => `<input type="checkbox" style="width:18px;height:18px" ${l.reconciled ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleRec('${l.id}',this.checked)">` },
        { h: 'Date', f: l => fmtDate(l.e.date) },
        { h: 'Details', f: l => esc(l.e.memo || '') },
        { h: 'Money in', r: 1, f: l => +l.debit ? `<span class="up">${fmtN(l.debit)}</span>` : '' },
        { h: 'Money out', r: 1, f: l => +l.credit ? `<span class="down">${fmtN(l.credit)}</span>` : '' },
        { h: 'Balance', r: 1, f: l => `<b>${fmtN(l.bal)}</b>` },
      ], lines.reverse(), { empty: 'No transactions in this account yet.' })}</div>`;
  }
  return `<div class="toolbar"><span class="muted">Total cash & bank: <b>${money(cashBalance())}</b></span><span class="grow"></span>
    <button class="btn" onclick="openBankImport()">${ic('file')} Upload statement (CSV)</button>
    <button class="btn" onclick="openTransferForm()">${ic('swap')} Transfer money</button>
    <button class="btn primary" onclick="openBankForm()">${ic('plus')} Add Account</button></div>
  <div class="grid g4 mb">${list.map(a => `<div class="card acc-card ${a.id === UI.bankAcc ? 'on' : ''}" onclick="selectBank('${a.id}')"><span>${esc(a.name)}</span><b>${money(natural(a, s.get(a.id)))}</b></div>`).join('')}</div>
  ${txHTML}`;
};
function selectBank(id) { UI.bankAcc = id; render(); }
function calcRec(recBal) {
  const v = $('#stmtBal').value;
  const el = $('#recDiff');
  if (v === '') { el.textContent = '—'; el.className = ''; return; }
  const d = r2(num(v) - recBal);
  el.textContent = fmtN(d);
  el.className = Math.abs(d) < 0.01 ? 'up' : 'down';
}
async function toggleRec(id, val) {
  try { await upd('journal_lines', id, { reconciled: val }); const l = byId('journal_lines', id); if (l) l.reconciled = val; render(); }
  catch (e) { toast(e.message, 'err'); }
}
function openBankForm() {
  formModal('Add Bank / Cash Account', [
    { k: 'name', label: 'Account name', required: true, full: true, ph: 'e.g. Meezan Bank, JazzCash, Petty cash' },
    { k: 'code', label: 'Code', ph: '1020' },
    { k: 'opening', label: 'Opening balance', type: 'number', default: 0 },
  ], {}, async v => {
    const a = await ins('accounts', { name: v.name, code: v.code, type: 'asset', is_bank: true });
    if (v.opening) {
      await postJournal({ date: today(), memo: `Opening balance — ${a.name}`, ref_type: 'opening', ref_id: a.id,
        lines: [{ account_id: a.id, debit: v.opening }, { account_id: acc('obe'), credit: v.opening }] });
    }
    UI.bankAcc = a.id;
    await refresh(); toast('Account added');
  });
}
function openTransferForm() {
  const o = bankOpts();
  formModal('Transfer Money', [
    { k: 'from', label: 'From', type: 'select', options: o, required: true },
    { k: 'to', label: 'To', type: 'select', options: o, required: true },
    { k: 'amount', label: 'Amount', type: 'number', required: true, min: 0 },
    { k: 'date', label: 'Date', type: 'date', default: today(), required: true },
    { k: 'memo', label: 'Note', full: true, ph: 'e.g. Cash deposited in bank' },
  ], {}, async v => {
    if (v.from === v.to) throw new Error('Choose two different accounts');
    if (v.amount <= 0) throw new Error('Enter an amount');
    checkLock(v.date);
    await postJournal({ date: v.date, memo: v.memo || `Transfer ${byId('accounts', v.from).name} → ${byId('accounts', v.to).name}`, ref_type: 'transfer',
      lines: [{ account_id: v.to, debit: v.amount }, { account_id: v.from, credit: v.amount }] });
    await refresh(); toast('Transfer saved');
  });
}

/* ===================== HR & payroll ===================== */
PAGES.hr = () => {
  const tab = UI.hr;
  const head = `<div class="toolbar">${tabs('hr', [['employees', 'Employees'], ['attendance', 'Attendance'], ['payroll', 'Payroll']])}<span class="grow"></span>
    <button class="btn primary" onclick="openEmployeeForm()">${ic('plus')} Add Employee</button></div>`;
  const active = S.employees.filter(e => e.active).sort(byName);
  if (tab === 'attendance') {
    const d = UI.attDate || today();
    const ms = monthStart(d);
    const att = (eid, date) => S.attendance.find(a => a.employee_id === eid && a.date === date)?.status;
    const cnt = (eid, st) => S.attendance.filter(a => a.employee_id === eid && a.status === st && a.date >= ms && a.date <= monthEnd(d)).length;
    return head + `<div class="card"><div class="card-head"><h3>Attendance</h3><span class="grow"></span>
      <input type="date" value="${d}" style="width:auto" onchange="setAttDate(this.value)">
      <button class="btn sm" onclick="markAll('present')">Mark all present</button></div>
      ${table([
        { h: 'Employee', f: e => `<b>${esc(e.name)}</b><div class="muted small">${esc(e.designation || '')}</div>` },
        { h: 'This month', f: e => `<span class="small muted">P ${cnt(e.id, 'present')} · A ${cnt(e.id, 'absent')} · L ${cnt(e.id, 'leave')} · H ${cnt(e.id, 'half')}</span>` },
        { h: 'Today\'s status', r: 1, f: e => { const s = att(e.id, d); return `<div class="att">${[['present', 'Present'], ['absent', 'Absent'], ['leave', 'Leave'], ['half', 'Half day']].map(([k, l]) => `<button type="button" class="${k} ${s === k ? 'on' : ''}" onclick="markAtt('${e.id}','${k}')">${l}</button>`).join('')}</div>`; } },
      ], active, { empty: 'Add employees first.' })}</div>`;
  }
  if (tab === 'payroll') {
    const m = UI.payMonth || today().slice(0, 7);
    const list = S.payroll.filter(p => p.month === m).map(p => ({ ...p, emp: byId('employees', p.employee_id) }));
    return head + `<div class="card"><div class="card-head"><h3>Payroll</h3><span class="grow"></span>
      <input type="month" value="${m}" style="width:auto" onchange="setPayMonth(this.value)">
      <button class="btn sm" onclick="generatePayroll()">Generate for this month</button></div>
      <div class="grid g3 mb">${kpi('Total net pay', money0(sum(list, p => p.net)))}${kpi('Paid', money0(sum(list.filter(p => p.paid_date), p => p.net)))}${kpi('Unpaid', money0(sum(list.filter(p => !p.paid_date), p => p.net)))}</div>
      ${table([
        { h: 'Employee', f: p => `<b>${esc(p.emp?.name || '')}</b>` },
        { h: 'Basic', r: 1, f: p => fmtN(p.basic) },
        { h: 'Allowances', r: 1, f: p => fmtN(p.allowances) },
        { h: 'Deductions', r: 1, f: p => fmtN(p.deductions) },
        { h: 'Net pay', r: 1, f: p => `<b>${fmtN(p.net)}</b>` },
        { h: 'Status', f: p => p.paid_date ? badge('Paid') : badge('Unpaid') },
        { h: '', r: 1, f: p => `<div class="acts">${!p.paid_date ? `<button class="btn primary sm" onclick="payPayroll('${p.id}')">Pay</button>${actBtn('edit', `editPayroll('${p.id}')`, 'Edit')}` : ''}${actBtn('print', `payslip('${p.id}')`, 'Payslip')}${actBtn('trash', `deletePayroll('${p.id}')`, 'Delete')}</div>` },
      ], list, { empty: 'No payroll for this month yet. Click “Generate for this month”. Absences and half days are deducted automatically (salary ÷ 30 per day).' })}</div>`;
  }
  return head + `<div class="grid g3 mb">${kpi('Active employees', String(active.length))}${kpi('Monthly salaries', money0(sum(active, e => e.salary)))}${kpi('Inactive', String(S.employees.length - active.length))}</div>
  <div class="card"><div class="card-head"><h3>Employees</h3><span class="grow"></span>${searchBox()}</div>
  ${table([
    { h: 'Name', f: e => `<b>${esc(e.name)}</b><div class="muted small">${esc(e.designation || '')}</div>` },
    { h: 'Phone', f: e => esc(e.phone || '') },
    { h: 'Joined', f: e => fmtDate(e.join_date) },
    { h: 'Salary', r: 1, f: e => fmtN(e.salary) },
    { h: 'Status', f: e => e.active ? badge('Active') : '<span class="badge">Inactive</span>' },
    { h: '', r: 1, f: e => `<div class="acts">${actBtn('edit', `openEmployeeForm('${e.id}')`, 'Edit')}${actBtn('trash', `deleteEmployee('${e.id}')`, 'Delete')}</div>` },
  ], S.employees.slice().sort(byName), { empty: 'No employees yet.' })}</div>`;
};
function openEmployeeForm(id = null) {
  const e = id ? byId('employees', id) : null;
  formModal(e ? 'Edit Employee' : 'Add Employee', [
    { k: 'name', label: 'Full name', required: true, full: true },
    { k: 'designation', label: 'Designation', ph: 'e.g. Machine operator' },
    { k: 'phone', label: 'Phone' },
    { k: 'salary', label: 'Monthly salary', type: 'number', default: 0, min: 0 },
    { k: 'join_date', label: 'Joining date', type: 'date', default: today() },
    { k: 'active', label: 'Active employee', type: 'checkbox', default: true, full: true },
  ], e, async v => {
    if (e) await upd('employees', e.id, v); else await ins('employees', v);
    await refresh(); toast('Employee saved');
  });
}
async function deleteEmployee(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const e = byId('employees', id);
  try {
    if (S.payroll.some(p => p.employee_id === id && p.paid_date)) throw new Error('This employee has paid salaries. Mark them inactive instead.');
    if (!confirm(`Delete ${e.name} and their attendance?`)) return;
    await del('employees', id); await refresh(); toast('Deleted');
  } catch (err) { toast(err.message, 'err'); }
}
function setAttDate(v) { UI.attDate = v || today(); render(); }
function setPayMonth(v) { UI.payMonth = v || today().slice(0, 7); render(); }
async function markAtt(eid, status) {
  try {
    const date = UI.attDate || today();
    const row = await q(sb.from('attendance').upsert({ employee_id: eid, date, status }, { onConflict: 'employee_id,date' }).select().single());
    S.attendance = S.attendance.filter(a => !(a.employee_id === eid && a.date === date)).concat(row);
    render();
  } catch (e) { toast(e.message, 'err'); }
}
async function markAll(status) {
  try {
    const date = UI.attDate || today();
    const rows = S.employees.filter(e => e.active && !S.attendance.some(a => a.employee_id === e.id && a.date === date)).map(e => ({ employee_id: e.id, date, status }));
    if (rows.length) await q(sb.from('attendance').upsert(rows, { onConflict: 'employee_id,date' }).select());
    await refresh(); toast('Attendance marked');
  } catch (e) { toast(e.message, 'err'); }
}
async function generatePayroll() {
  const m = UI.payMonth || today().slice(0, 7);
  const ms = m + '-01', me = monthEnd(ms);
  const rows = S.employees.filter(e => e.active && !S.payroll.some(p => p.employee_id === e.id && p.month === m)).map(e => {
    const a = S.attendance.filter(x => x.employee_id === e.id && x.date >= ms && x.date <= me);
    const days = a.filter(x => x.status === 'absent').length + a.filter(x => x.status === 'half').length * 0.5;
    const deductions = r2(+e.salary / 30 * days);
    return { employee_id: e.id, month: m, basic: +e.salary, allowances: 0, deductions, net: r2(+e.salary - deductions) };
  });
  if (!rows.length) return toast('Payroll already generated for all active employees');
  try { await insMany('payroll', rows); await refresh(); toast(`Payroll generated for ${rows.length} employee(s)`); }
  catch (e) { toast(e.message, 'err'); }
}
function editPayroll(id) {
  const p = byId('payroll', id);
  formModal(`Edit salary — ${byId('employees', p.employee_id)?.name}`, [
    { k: 'basic', label: 'Basic salary', type: 'number', min: 0 },
    { k: 'allowances', label: 'Allowances / bonus / overtime', type: 'number', min: 0 },
    { k: 'deductions', label: 'Deductions (absence, advance…)', type: 'number', min: 0 },
  ], p, async v => {
    await upd('payroll', id, { ...v, net: r2(v.basic + v.allowances - v.deductions) });
    await refresh(); toast('Updated');
  });
}
function payPayroll(id) {
  const p = byId('payroll', id), emp = byId('employees', p.employee_id);
  formModal(`Pay salary — ${emp?.name}`, [
    { k: 'account_id', label: 'Pay from', type: 'select', options: bankOpts(), required: true, placeholder: false, default: banks()[0]?.id },
    { k: 'date', label: 'Payment date', type: 'date', default: today(), required: true },
  ], {}, async v => {
    checkLock(v.date);
    await upd('payroll', id, { paid_date: v.date, account_id: v.account_id });
    await postJournal({ date: v.date, memo: `Salary ${p.month} — ${emp?.name}`, ref_type: 'payroll', ref_id: id,
      lines: [{ account_id: acc('salaries'), debit: p.net }, { account_id: v.account_id, credit: p.net }] });
    await refresh(); toast('Salary paid');
  });
}
function payslip(id) {
  const p = byId('payroll', id), e = byId('employees', p.employee_id) || {};
  printHTML(`Payslip ${p.month}`, `<div class="meta"><div><div class="muted">Employee</div><b>${esc(e.name || '')}</b><br>${esc(e.designation || '')}</div><div style="text-align:right">Month: <b>${esc(p.month)}</b><br>${p.paid_date ? 'Paid on ' + fmtDate(p.paid_date) : 'Not paid yet'}</div></div>
    <table><tbody><tr><td>Basic salary</td><td class="r">${fmtN(p.basic)}</td></tr><tr><td>Allowances</td><td class="r">${fmtN(p.allowances)}</td></tr>
    <tr><td>Deductions</td><td class="r">− ${fmtN(p.deductions)}</td></tr><tr class="grand"><td>Net pay</td><td class="r">${money(p.net)}</td></tr></tbody></table>`);
}
async function deletePayroll(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const p = byId('payroll', id);
  try {
    if (p.paid_date) checkLock(p.paid_date);
    if (!confirm(p.paid_date ? 'This salary is paid. Deleting will also reverse the payment entry. Continue?' : 'Delete this payroll line?')) return;
    await unpost(id); await del('payroll', id); await refresh(); toast('Deleted');
  } catch (e) { toast(e.message, 'err'); }
}

/* ===================== CRM ===================== */
const STAGES = ['New', 'Contacted', 'Proposal', 'Won', 'Lost'];
PAGES.crm = () => {
  const t = today();
  const open = S.followups.filter(f => f.status !== 'done');
  const due = open.filter(f => f.due_date && f.due_date <= t).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const lname = f => f.lead_name || byId('contacts', f.contact_id)?.name || 'Unnamed';
  return `<div class="toolbar"><span class="muted">Pipeline value: <b>${money0(sum(open.filter(f => !['Won', 'Lost'].includes(f.stage)), f => f.value))}</b></span><span class="grow"></span>
    <button class="btn primary" onclick="openLeadForm()">${ic('plus')} Add Lead / Follow-up</button></div>
  ${due.length ? `<div class="card mb"><div class="card-head"><h3>Follow up today</h3></div>${due.map(f => `<div class="alert ${f.due_date < t ? 'danger' : 'warn'}"><span class="dot"></span><div style="flex:1"><b>${esc(lname(f))}</b> — ${esc(f.notes || f.stage)} <span class="small">(${f.due_date < t ? 'overdue since ' : 'due '}${fmtDate(f.due_date)})</span></div>
    ${f.phone || byId('contacts', f.contact_id)?.phone ? `<button class="btn sm" onclick="window.open(waLink('${esc(f.phone || byId('contacts', f.contact_id)?.phone)}',''),'_blank')">WhatsApp</button>` : ''}
    <button class="btn sm" onclick="openLeadForm('${f.id}')">Update</button><button class="btn sm" onclick="leadDone('${f.id}')">Done</button></div>`).join('')}</div>` : ''}
  <div class="board">${STAGES.map((st, i) => {
    const cards = open.filter(f => (f.stage || 'New') === st);
    return `<div class="col"><h4><span>${st}</span><span>${cards.length} · ${fmt0(sum(cards, f => f.value))}</span></h4>
      ${cards.map(f => `<div class="lead"><b>${esc(lname(f))}</b>${+f.value ? `<div>${money0(f.value)}</div>` : ''}
        ${f.due_date ? `<div class="${f.due_date < t ? 'down' : 'muted'} small">Next: ${fmtDate(f.due_date)}</div>` : ''}
        ${f.notes ? `<div class="muted small">${esc(f.notes).slice(0, 90)}</div>` : ''}
        <div class="acts">${i > 0 ? `<button class="btn sm" onclick="moveLead('${f.id}',-1)">←</button>` : ''}${i < STAGES.length - 1 ? `<button class="btn sm" onclick="moveLead('${f.id}',1)">→</button>` : ''}
        <button class="btn sm" onclick="openLeadForm('${f.id}')">Edit</button>
        ${st === 'Won' && !f.contact_id ? `<button class="btn sm" onclick="leadToCustomer('${f.id}')">Make customer</button>` : ''}
        <button class="btn sm" onclick="leadDone('${f.id}')">Close</button></div></div>`).join('') || '<div class="muted small" style="padding:6px">Empty</div>'}</div>`;
  }).join('')}</div>`;
};
function openLeadForm(id = null) {
  const f = id ? byId('followups', id) : null;
  formModal(f ? 'Update Lead / Follow-up' : 'Add Lead / Follow-up', [
    { k: 'lead_name', label: 'Lead / company name', ph: 'Leave empty if existing customer' },
    { k: 'contact_id', label: 'Or existing customer', type: 'select', options: S.contacts.filter(c => c.type === 'customer').sort(byName).map(c => [c.id, c.name]), placeholder: '— none —' },
    { k: 'phone', label: 'Phone / WhatsApp' },
    { k: 'value', label: 'Expected deal value', type: 'number', default: 0, min: 0 },
    { k: 'stage', label: 'Stage', type: 'select', options: STAGES.map(s => [s, s]), placeholder: false, default: 'New' },
    { k: 'due_date', label: 'Next follow-up date', type: 'date', default: addDays(today(), 2) },
    { k: 'notes', label: 'Notes / next step', type: 'textarea', full: true, rows: 3 },
  ], f, async v => {
    if (!v.lead_name && !v.contact_id) throw new Error('Enter a lead name or choose a customer');
    if (f) await upd('followups', f.id, v); else await ins('followups', v);
    await refresh(); toast('Saved');
  });
}
async function moveLead(id, dir) {
  const f = byId('followups', id);
  const i = Math.max(0, Math.min(STAGES.length - 1, STAGES.indexOf(f.stage || 'New') + dir));
  try { await upd('followups', id, { stage: STAGES[i] }); await refresh(); } catch (e) { toast(e.message, 'err'); }
}
async function leadDone(id) { try { await upd('followups', id, { status: 'done' }); await refresh(); toast('Closed'); } catch (e) { toast(e.message, 'err'); } }
async function leadToCustomer(id) {
  const f = byId('followups', id);
  try {
    const c = await ins('contacts', { type: 'customer', name: f.lead_name || 'New customer', phone: f.phone });
    await upd('followups', id, { contact_id: c.id });
    await refresh(); toast(`${c.name} added as customer`);
  } catch (e) { toast(e.message, 'err'); }
}

/* ===================== Accounting ===================== */
const TYPE_LABEL = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses' };
const REF_LABEL = { journal: 'Manual', transfer: 'Transfer', invoice: 'Invoice', bill: 'Bill', payment: 'Payment', expense: 'Expense', payroll: 'Payroll', opening: 'Opening', adjust: 'Stock adj.' };
PAGES.accounting = () => {
  const tab = UI.accounting;
  const head = `<div class="toolbar">${tabs('accounting', [['coa', 'Chart of Accounts'], ['journal', 'Journal Entries']])}<span class="grow"></span>
    ${tab === 'coa' ? `<button class="btn primary" onclick="openAccountForm()">${ic('plus')} Add Account</button>` : `<button class="btn primary" onclick="openJournalForm()">${ic('plus')} New Journal Entry</button>`}</div>`;
  if (tab === 'journal') {
    const entries = S.journal_entries.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 300);
    const linesOf = id => S.journal_lines.filter(l => l.entry_id === id);
    return head + `<div class="card"><div class="card-head"><h3>Journal (latest 300)</h3><span class="grow"></span>${searchBox()}</div>
    <p class="muted small" style="margin:0 0 10px">Every sale, purchase, payment and expense creates a double-entry record here automatically.</p>
    ${table([
      { h: 'Date', f: e => fmtDate(e.date) },
      { h: 'Details', f: e => `<b>${esc(e.memo || '')}</b><div class="small muted">${linesOf(e.id).map(l => `${esc(byId('accounts', l.account_id)?.name || '')} ${+l.debit ? 'Dr ' + fmtN(l.debit) : 'Cr ' + fmtN(l.credit)}`).join(' · ')}</div>` },
      { h: 'Type', f: e => `<span class="badge">${esc(REF_LABEL[e.ref_type] || e.ref_type)}</span>` },
      { h: 'Amount', r: 1, f: e => fmtN(sum(linesOf(e.id), l => l.debit)) },
      { h: '', r: 1, f: e => ['journal', 'transfer'].includes(e.ref_type) ? `<div class="acts">${actBtn('trash', `deleteEntry('${e.id}')`, 'Delete')}</div>` : '' },
    ], entries, { empty: 'No journal entries yet.' })}</div>`;
  }
  const s = sums(null, null);
  return head + Object.entries(TYPE_LABEL).map(([t, label]) => {
    const list = S.accounts.filter(a => a.type === t).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return `<div class="card"><div class="card-head"><h3>${label}</h3><span class="grow"></span><b>${fmtN(sum(list, a => natural(a, s.get(a.id))))}</b></div>
    ${table([
      { h: 'Code', f: a => esc(a.code || '') },
      { h: 'Account', f: a => `<b>${esc(a.name)}</b>${a.sys ? ' <span class="badge">system</span>' : ''}${a.is_bank ? ' <span class="badge b-open">bank/cash</span>' : ''}` },
      { h: 'Balance', r: 1, f: a => fmtN(natural(a, s.get(a.id))) },
      { h: '', r: 1, f: a => `<div class="acts">${actBtn('edit', `openAccountForm('${a.id}')`, 'Edit')}${!a.sys ? actBtn('trash', `deleteAccount('${a.id}')`, 'Delete') : ''}</div>` },
    ], list, { empty: 'No accounts.' })}</div>`;
  }).join('');
};
function openAccountForm(id = null) {
  const a = id ? byId('accounts', id) : null;
  formModal(a ? 'Edit Account' : 'Add Account', [
    { k: 'name', label: 'Account name', required: true, full: true },
    { k: 'code', label: 'Code', ph: 'e.g. 6600' },
    ...(a?.sys ? [] : [{ k: 'type', label: 'Type', type: 'select', required: true, options: Object.entries(TYPE_LABEL).map(([k, l]) => [k, l]), default: 'expense' }]),
    { k: 'is_bank', label: 'This is a bank / cash / wallet account', type: 'checkbox', full: true },
  ], a, async v => {
    if (v.is_bank && (v.type || a?.type) !== 'asset') throw new Error('Bank/cash accounts must be of type Assets');
    if (a) await upd('accounts', a.id, v); else await ins('accounts', v);
    await refresh(); toast('Account saved');
  });
}
async function deleteAccount(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  try {
    if (S.journal_lines.some(l => l.account_id === id) || S.expenses.some(e => e.account_id === id)) throw new Error('This account has transactions and cannot be deleted.');
    if (!confirm('Delete this account?')) return;
    await del('accounts', id); await refresh(); toast('Deleted');
  } catch (e) { toast(e.message, 'err'); }
}
function jLine(l = {}) {
  return `<tr><td><select class="j-acc"><option value="">Select account…</option>${accOptions(l.account_id)}</select></td>
    <td><input class="j-dr r" type="number" step="any" min="0" value="${l.debit || ''}" oninput="recalcJ()" placeholder="0"></td>
    <td><input class="j-cr r" type="number" step="any" min="0" value="${l.credit || ''}" oninput="recalcJ()" placeholder="0"></td>
    <td><button type="button" class="icon-btn" onclick="this.closest('tr').remove();recalcJ()">${ic('x')}</button></td></tr>`;
}
function addJLine() { $('#jl tbody').insertAdjacentHTML('beforeend', jLine()); }
function recalcJ() {
  const dr = sum($$('.j-dr'), i => num(i.value)), cr = sum($$('.j-cr'), i => num(i.value));
  const el = $('#jBal');
  el.innerHTML = `Debit ${fmtN(dr)} · Credit ${fmtN(cr)} — ${Math.abs(dr - cr) < 0.01 && dr > 0 ? '<span class="up">Balanced ✓</span>' : `<span class="down">Difference ${fmtN(dr - cr)}</span>`}`;
}
function openJournalForm() {
  openModal('New Journal Entry', `<div class="form-grid">${fieldHTML({ k: 'date', label: 'Date', type: 'date', required: true }, today())}${fieldHTML({ k: 'memo', label: 'Description', required: true, ph: 'e.g. Owner invested capital' })}</div>
    <div class="table-wrap"><table class="items" id="jl" style="min-width:560px"><thead><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th><th></th></tr></thead><tbody>${jLine()}${jLine()}</tbody></table></div>
    <button type="button" class="btn sm" onclick="addJLine()">${ic('plus')} Add line</button>
    <p id="jBal" class="small" style="margin:12px 0 0"></p>
    <p class="muted small">Tip: total debits must equal total credits. Example — owner puts money in: Debit "Cash in Hand", Credit "Owner's Capital".</p>`, {
    wide: true, submit: 'Post Entry', after: () => recalcJ(),
    onSubmit: async f => {
      const lines = $$('#jl tbody tr').map(tr => ({ account_id: $('.j-acc', tr).value, debit: num($('.j-dr', tr).value), credit: num($('.j-cr', tr).value) })).filter(l => l.account_id && (l.debit || l.credit));
      if (lines.length < 2) throw new Error('Add at least two lines');
      checkLock(f.elements.date.value);
      await postJournal({ date: f.elements.date.value, memo: f.elements.memo.value.trim(), ref_type: 'journal', lines });
      await refresh(); toast('Journal entry posted');
    },
  });
}
async function deleteEntry(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const e = byId('journal_entries', id);
  try {
    checkLock(e.date);
    if (!confirm(e.ref_id ? 'Delete this entry (and its stock movements)?' : 'Delete this journal entry?')) return;
    if (e.ref_id) await unpost(e.ref_id); else await del('journal_entries', id);
    await refresh(); toast('Deleted');
  } catch (err) { toast(err.message, 'err'); }
}

/* ===================== Quick Entry (notebook-style "khata") =====================
   Type plain sentences like "sold 3 vanilla shea butter £75 cash" or "bought 200 jars from Ali £180 on credit".
   The app works out what it is, shows a check card, and posts it to the right place:
   cash sales, credit sales (customer ledger), purchases (supplier ledger), payments, expenses, capital, payouts.
   ================================================================================ */
const KH = { pending: null };
const KH_STOP = new Set(['shea', 'luv', 'pure', 'the', 'and', 'with', 'for', 'from', 'set', 'of', 'a', 'x']);
const KH_NOT_NAME = new Set(['bank', 'cash', 'card', 'me', 'us', 'business', 'the', 'a', 'an', 'shopify', 'tiktok', 'paypal', 'sumup', 'market',
  'stall', 'customer', 'customers', 'today', 'yesterday', 'credit', 'account', 'stock', 'myself', 'personal', 'royal', 'mail', 'evri', 'it', 'him', 'her', 'them',
  'online', 'website', 'walk', 'walk-in', 'shop', 'home', 'supplier']);
const KH_EXP = [
  [/royal mail|evri|hermes|dpd|parcelforce|courier|postage|post office|shipping label|stamps?\b/, 'Postage & Couriers', 'Transport & Freight'],
  [/pitch|stall (fee|rent)|market (fee|rent)|apple market/, 'Market Pitch & Stall Rent', 'Rent'],
  [/gift box|packaging|bags?\b|tissue|ribbon|boxes\b|mailers?\b|bubble wrap/, 'Packaging & Gift Boxes', 'General Expenses'],
  [/jars?\b|bottles?\b|labels?\b|lids?\b|pumps?\b|droppers?\b|tins?\b|containers?\b/, 'Jars, Bottles & Labels', 'General Expenses'],
  [/raw shea|shea nuts?|unrefined|ingredients?|cocoa butter|carrier oil|essential oils?|fragrance|beeswax|raw material/, 'Ingredients & Raw Materials', 'General Expenses'],
  [/facebook ads?|instagram ads?|tiktok ads?|ads?\b|advert|influencer|promo(tion)?|marketing|boost/, 'Social Media & Influencers', 'Marketing'],
  [/photo(grapher|s|graphy)?|video(grapher)?|content|filming/, 'Photography & Content', 'Marketing'],
  [/shopify (plan|app|subscription|bill)|app subscription/, 'Shopify Plan & Apps', 'Office Expenses'],
  [/domain|website|hosting|software|canva|subscription/, 'Website, Domain & Software', 'Office Expenses'],
  [/insurance/, 'Business Insurance', 'General Expenses'],
  [/accountant|bookkeep|accountancy/, 'Accountancy & Bookkeeping', 'General Expenses'],
  [/tiktok (fee|fees|commission)|marketplace fee/, 'TikTok Shop & Marketplace Fees', 'General Expenses'],
  [/(card|sumup|paypal|stripe|shopify payments?) (fee|fees)|processing fee|transaction fee/, 'Payment Processing Fees', 'General Expenses'],
  [/electric|electricity|gas bill|water bill|utilit/, 'Electricity, Gas & Water', 'Electricity, Gas & Water'],
  [/\brent\b|storage unit|lock ?up/, 'Rent', 'Rent'],
  [/uber|taxi|train|tube|bus\b|petrol|diesel|fuel|parking|congestion|tfl|oyster|van hire|travel|transport/, 'Transport & Freight', 'Transport & Freight'],
  [/wages?|salary|salaries|helper|staff|assistant/, 'Salaries & Wages', 'Salaries & Wages'],
  [/stationery|printing|printer|ink|office|phone bill|mobile bill|internet/, 'Office Expenses', 'Office Expenses'],
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function accNamed(...names) {
  for (const n of names) { const a = S.accounts.find(x => x.name.toLowerCase() === String(n).toLowerCase()); if (a) return a; }
  return null;
}
const sysAcc = k => S.accounts.find(a => a.sys === k);
const generalAcc = () => sysAcc('general') || S.accounts.find(a => a.type === 'expense');
function payAccounts() {
  const cash = sysAcc('cash') || banks()[0];
  const bank = sysAcc('bank') || banks().find(a => a.id !== cash?.id) || cash;
  const card = accNamed('Card Reader (SumUp) Balance') || bank;
  const paypal = accNamed('PayPal Balance') || bank;
  return { cash, bank, card, paypal };
}
const KH_METHODS = [['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank'], ['paypal', 'PayPal'], ['credit', 'On credit (pay later)']];

function khDate(t) {
  if (/\byesterday\b/.test(t)) return addDays(today(), -1);
  let m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : today().slice(0, 4); return `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; }
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/) || t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*(?:\.\d|ml|g\b|x\b|pcs|jars|bottles))/);
  if (m) { const [d, mo] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]; return `${today().slice(0, 4)}-${String(MONTHS.indexOf(mo.slice(0, 3)) + 1).padStart(2, '0')}-${String(+d).padStart(2, '0')}`; }
  return today();
}
function khMoney(t) {
  let m = t.match(/£\s*(\d+(?:[.,]\d{1,2})?)/) || t.match(/(\d+(?:\.\d{1,2})?)\s*(?:pounds?|gbp|quid)\b/);
  if (m) return num(m[1].replace(',', '.'));
  // otherwise: the last number that is not a quantity, a size or a date
  const clean = t.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(ml|g|kg|l|oz|pcs?|x|jars?|bottles?|tins?|units?|boxes|bags|labels|lids|pumps|packs?|items?|of)\b/g, ' ')
    .replace(/\b(fees?|commission)\s*£?\s*\d+(\.\d+)?/g, ' ');
  const nums = [...clean.matchAll(/(?:^|[^\w.])(\d+(?:\.\d{1,2})?)(?![\w.])/g)].map(x => num(x[1]));
  return nums.length ? nums[nums.length - 1] : 0;
}
function khMethod(t, type) {
  if (/\b(on credit|credit|owe|owes|owed|unpaid|pay later|on account|to pay later|invoice)\b/.test(t)) return 'credit';
  if (/\bpaypal\b/.test(t)) return 'paypal';
  if (/\b(card|sumup|contactless|debit card|apple pay)\b/.test(t)) return 'card';
  if (/\b(bank|transfer|bacs|online banking|direct debit)\b/.test(t)) return 'bank';
  if (/\bcash\b/.test(t)) return 'cash';
  if (type === 'purchase') return 'unknown';
  return 'cash';
}
function khWords(s) { return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !KH_STOP.has(w)); }
function khProduct(seg) {
  const words = new Set(khWords(seg));
  let best = null, bs = 0;
  for (const p of S.products) {
    const pw = khWords(p.name).concat(p.sku ? [String(p.sku).toLowerCase()] : []);
    if (!pw.length) continue;
    const hit = pw.filter(w => words.has(w) || (w.length > 4 && [...words].some(x => x.length > 3 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))));
    const score = hit.length / pw.length + hit.length * 0.01;
    if (hit.length && score > bs) { bs = score; best = p; }
  }
  return bs >= 0.34 ? best : null;
}
function khItems(t) {
  const body = t.replace(/£\s*\d+([.,]\d+)?|\b\d+(\.\d+)?\s*(pounds?|gbp|quid)\b|\b\d+\.\d+\b/g, ' ')
    .replace(/\b(from|to|for)\s+[a-z][\w'&.-]*(\s+[a-z][\w'&.-]*)?\s*$/, '');
  const segs = body.split(/,|\band\b|&|\+|\bplus\b/);
  const items = [];
  for (const seg of segs) {
    const p = khProduct(seg);
    const qm = seg.match(/\b(\d+)\s*(?:x\s*)?(?=[a-z])(?!(?:for|from|to|on|by|at|cash|card|bank|each)\b)/) || seg.match(/\bx\s*(\d+)\b/);
    const qty = qm && !/^\d+(\s*)(ml|g|kg|l|oz)\b/.test(seg.slice(seg.indexOf(qm[1]))) ? +qm[1] : 1;
    if (p) items.push({ product_id: p.id, description: p.name, qty, price: +p.price || 0 });
  }
  return items;
}
function khName(raw, t) {
  const pats = [/\b(?:from|to|for|paid|pay|by)\s+([A-Za-z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,2})/g, /^([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+)?)\s+(?:paid|sent|bought|owes)\b/g];
  for (const re of pats) {
    for (const m of raw.matchAll(re)) {
      const cand = m[1].trim().replace(/[.,]$/, '');
      const first = cand.split(/\s+/)[0].toLowerCase();
      if (KH_NOT_NAME.has(first) || /^\d/.test(first) || khExpense(first)) continue;
      if (S.products.some(p => khWords(p.name).includes(first))) continue;
      // keep only capitalised follow-on words (names), drop trailing lowercase words
      const parts = cand.split(/\s+/); const keep = [parts[0]];
      for (const w of parts.slice(1)) { if (/^[A-Z]/.test(w) && !KH_NOT_NAME.has(w.toLowerCase())) keep.push(w); else break; }
      return keep.join(' ').replace(/^./, c => c.toUpperCase());
    }
  }
  return '';
}
function khExpense(t) {
  for (const [re, shopName, fallback] of KH_EXP) if (re.test(t)) return accNamed(shopName, fallback) || generalAcc();
  return null;
}
function khContact(name, type) {
  if (!name) return null;
  const n = name.toLowerCase();
  const list = S.contacts.filter(c => !type || c.type === type);
  return list.find(c => c.name.toLowerCase() === n) || list.find(c => c.name.toLowerCase().startsWith(n)) || list.find(c => n.startsWith(c.name.toLowerCase())) || null;
}

function parseKhata(raw) {
  const t = ' ' + raw.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
  const r = { raw: raw.trim(), date: khDate(t), amount: khMoney(t), items: [], name: khName(raw, t), method: 'cash', type: 'unknown', account_id: null, fees: 0 };
  const fm = t.match(/\b(?:fees?|commission)\s*(?:of\s*)?£?\s*(\d+(?:\.\d{1,2})?)/);
  if (/\b(payout|paid out|paid me out|paid into (my )?bank|settlement)\b/.test(t) && /\b(shopify|tiktok|paypal|sumup)\b/.test(t)) {
    r.type = 'payout'; r.fees = fm ? num(fm[1]) : 0;
    r.source = /tiktok/.test(t) ? 'TikTok Shop Balance' : /paypal/.test(t) ? 'PayPal Balance' : /sumup|card reader/.test(t) ? 'Card Reader (SumUp) Balance' : 'Shopify Payments Balance';
  } else if (/\b(invested|invest|put|added|capital|loan from me)\b/.test(t) && /\b(business|capital|own money|my money|myself|company)\b/.test(t) && !/\b(took|withdrew)\b/.test(t)) {
    r.type = 'capital';
  } else if (/\b(took out|withdrew|withdrawal|drawings|for myself|personal use|took £?\d)/.test(t)) {
    r.type = 'drawings';
  } else if (/\b(received|got paid|collected|recd|got £?\d)/.test(t) || /^ ?[a-z][\w'-]* (paid|sent) (me|us|£?\d)/.test(t)) {
    r.type = 'receive';
  } else if (/\b(sold|sale|sales|sell|selling|takings|took in)\b/.test(t) || (/\bowes?\b/.test(t) && r.name)) {
    r.type = 'sale';
    r.channel = /\b(shopify|website|online order)\b/.test(t) ? 'shopify' : /\btiktok\b/.test(t) ? 'tiktok' : 'stall';
  } else if (/\b(bought|buy|purchased|purchase|restock|restocked|stock from|ordered)\b/.test(t)) {
    r.type = 'purchase';
  } else if (/\b(paid|pay|paying|spent|spend|cost|bill|fee|fees)\b/.test(t) || khExpense(t)) {
    const exp = khExpense(t);
    const sup = khContact(r.name, 'supplier');
    r.type = sup || (!exp && r.name) ? 'pay' : 'expense';
    if (r.type === 'expense') r.account_id = (exp || generalAcc())?.id;
  }
  r.method = khMethod(t, r.type);
  if (r.type === 'sale' || r.type === 'purchase') r.items = khItems(t);
  if (r.type === 'purchase') {
    r.account_id = (khExpense(t) || generalAcc())?.id;
    if (r.method === 'unknown') r.method = r.name ? 'credit' : 'cash';
    if (!r.items.length) {
      const qm = t.match(/\b(\d+)\s*(?:x\s*)?([a-z][a-z ]{2,30}?)(?= from| for| at| on| £| \d|,| $)/);
      r.desc = qm && !/^(cash|card|bank|paypal|pounds?|gbp|quid|on|by)\b/.test(qm[2]) ? `${qm[1]} ${qm[2].trim()}`
        : raw.replace(/£\s*\d+(\.\d+)?|\b\d+(\.\d+)?\b/g, ' ').replace(/\b(bought|buy|purchased|purchase|restocked|restock|ordered|from|to|on credit|credit|cash|card|bank|paypal|by|with|pounds?|today|yesterday)\b/gi, ' ')
          .replace(new RegExp('\\b' + (r.name || '@@') + '\\b', 'i'), ' ').replace(/\s+/g, ' ').trim();
    }
  }
  if (r.type === 'sale' && !r.amount && r.items.length) r.amount = r2(sum(r.items, i => i.qty * i.price));
  if (['receive', 'pay'].includes(r.type) && r.method === 'credit') r.method = 'cash';
  return r;
}

/* ---------- page ---------- */
const KH_TYPES = [['sale', 'Sale'], ['purchase', 'Purchase (stock / supplies)'], ['expense', 'Expense'], ['pay', 'Paid a supplier'], ['receive', 'Money received from a customer'],
  ['payout', 'Payout to bank (Shopify / TikTok / PayPal)'], ['capital', 'Owner put money in'], ['drawings', 'Owner took money out']];
const KH_EXAMPLES = ['sold 3 vanilla shea butter £75 cash', 'sold 2 lemongrass oil by card £40', 'bought 200 jars from Ali £180 on credit',
  'paid Ali £100 bank', 'royal mail postage £14.60 card', 'pitch rent £45 cash', 'Sarah owes £60 for 2 gift sets', 'received £60 from Sarah',
  'shopify payout £230 fees £7.10', 'took £100 for myself'];
PAGES.khata = () => {
  const t = today();
  const s = sums(t, t);
  const inc = sum(S.accounts.filter(a => a.type === 'income'), a => natural(a, s.get(a.id)));
  const exp = sum(S.accounts.filter(a => a.type === 'expense' && a.sys !== 'cogs'), a => natural(a, s.get(a.id)));
  const P = payAccounts(), all = sums(null, null);
  const recent = S.journal_entries.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 40);
  const amt = e => sum(S.journal_lines.filter(l => l.entry_id === e.id && sysAcc('cogs')?.id !== l.account_id && sysAcc('inventory')?.id !== l.account_id), l => l.debit)
    || sum(S.journal_lines.filter(l => l.entry_id === e.id), l => l.debit);
  const kind = e => /^(Sale|Invoice|Market day|Shopify order|TikTok Shop order|Other online order)/.test(e.memo || '') ? 'in'
    : /^(Received from|Owner put)/.test(e.memo || '') ? 'in' : /^(Expense|Paid to|Purchase|Owner took)/.test(e.memo || '') ? 'out' : '';
  const label = e => {
    const d = ['invoice', 'bill'].includes(e.ref_type) ? byId('documents', e.ref_id) : null;
    if (!d) return e.memo || '';
    const who = byId('contacts', d.contact_id)?.name || '';
    const what = (d.items || []).map(i => `${i.qty}× ${i.description || byId('products', i.product_id)?.name || ''}`).join(', ');
    const paid = paidOf(d.id) >= +d.total - 0.009;
    return d.kind === 'invoice' ? `Sold to ${who}: ${what}${paid ? '' : ' (on credit)'}` : `Bought${who && who !== 'Cash purchases' ? ' from ' + who : ''}: ${what}${paid ? '' : ' (on credit)'}`;
  };
  const shown = recent.filter(e => !(e.ref_type === 'payment' && /^Paid to Cash purchases$/.test(e.memo || '')));
  let lastDay = '';
  return `<div class="kh-wrap">
    <div class="card kh-box">
      <form onsubmit="event.preventDefault();khSubmit()">
        <textarea id="khText" rows="2" placeholder="Write what happened, e.g. “sold 3 shea butter £75 cash” or “bought 200 jars from Ali £180 on credit”" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();khSubmit()}"></textarea>
        <div class="kh-row"><div class="kh-chips">${KH_EXAMPLES.slice(0, 6).map(x => `<button type="button" onclick="khUse(this)">${esc(x)}</button>`).join('')}</div>
        <button class="btn" type="button" onclick="openBankImport()">${ic('bank')} Upload bank statement</button>
        <button class="btn primary" type="submit">${ic('plus')} Add</button></div>
      </form>
    </div>
    <div class="grid g4 mb">
      ${kpi('Sales today', money0(inc))}
      ${kpi('Spent today', money0(exp))}
      ${kpi('Cash in hand', money0(P.cash ? natural(P.cash, all.get(P.cash.id)) : 0))}
      ${kpi('Bank', money0(P.bank && P.bank.id !== P.cash?.id ? natural(P.bank, all.get(P.bank.id)) : 0))}
    </div>
    <div class="card"><div class="card-head"><h3>Your notebook</h3><span class="grow"></span><span class="muted small">Every line is saved in the right ledger automatically</span></div>
      ${shown.length ? `<div class="kh-feed">${shown.map(e => {
        const day = e.date !== lastDay ? `<div class="kh-day">${e.date === t ? 'Today' : e.date === addDays(t, -1) ? 'Yesterday' : fmtDate(e.date)}</div>` : '';
        lastDay = e.date;
        const bankMove = /^Bank: /.test(e.memo || '') ? sum(S.journal_lines.filter(l => l.entry_id === e.id && byId('accounts', l.account_id)?.is_bank), l => +l.debit - +l.credit) : 0;
        const k = e.ref_type === 'invoice' ? 'in' : e.ref_type === 'bill' ? 'out' : bankMove > 0.009 ? 'in' : bankMove < -0.009 ? 'out' : kind(e);
        return `${day}<div class="kh-line ${k}"><span class="kh-ic">${k === 'in' ? '＋' : k === 'out' ? '−' : '•'}</span><div class="grow"><b>${esc(label(e))}</b><div class="muted small">${esc(S.journal_lines.filter(l => l.entry_id === e.id).map(l => byId('accounts', l.account_id)?.name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '))}</div></div><b class="kh-amt">${fmtN(amt(e))}</b></div>`;
      }).join('')}</div>` : '<div class="empty">Nothing written yet. Type your first entry above — like writing in your notebook.</div>'}
    </div></div>`;
};
AFTER.khata = () => { const el = $('#khText'); if (el && matchMedia('(min-width: 900px)').matches) el.focus(); };
function khUse(b) { const el = $('#khText'); el.value = b.textContent; el.focus(); }
function khSubmit() {
  const text = $('#khText')?.value.trim();
  if (!text) return;
  KH.pending = parseKhata(text);
  khConfirm();
}

/* ---------- check card ---------- */
function khConfirm() {
  const r = KH.pending;
  const expOpts = S.accounts.filter(a => a.type === 'expense' && a.sys !== 'cogs').sort(byName).map(a => [a.id, a.name]);
  const people = S.contacts.slice().sort(byName);
  const itemsHTML = r.items.length ? `<div class="kh-items">${r.items.map((i, n) => `<div><input type="number" min="0" step="1" value="${i.qty}" data-n="${n}" class="kh-q"> × <b>${esc(i.description)}</b> <span class="muted small">(${money(i.price)} each)</span></div>`).join('')}</div>` : '';
  const unknown = r.type === 'unknown';
  openModal(unknown ? 'What kind of entry is this?' : 'Check and save', `
    <p class="kh-quote">“${esc(r.raw)}”</p>
    <div class="form-grid">
      ${fieldHTML({ k: 'type', label: 'What happened', type: 'select', placeholder: unknown ? 'Choose…' : false, required: true, options: KH_TYPES, full: true }, unknown ? '' : r.type)}
      ${fieldHTML({ k: 'amount', label: 'Amount (£)', type: 'number', required: true, min: 0 }, r.amount || '')}
      ${fieldHTML({ k: 'date', label: 'Date', type: 'date', required: true }, r.date)}
      <label class="field kh-f kh-who"><span>Who (customer / supplier)</span><input name="who" list="khPeople" value="${esc(r.name)}" placeholder="Leave empty for a walk-in customer"><datalist id="khPeople">${people.map(c => `<option value="${esc(c.name)}">${c.type === 'customer' ? 'Customer' : 'Supplier'}</option>`).join('')}</datalist></label>
      <div class="kh-f kh-method">${fieldHTML({ k: 'method', label: 'Paid with', type: 'select', placeholder: false, options: KH_METHODS }, r.method)}</div>
      <div class="kh-f kh-cat">${fieldHTML({ k: 'account_id', label: 'Category', type: 'select', placeholder: false, options: expOpts }, r.account_id)}</div>
      <div class="kh-f kh-desc">${fieldHTML({ k: 'desc', label: 'What was bought', ph: 'e.g. 200 jars' }, r.desc || '')}</div>
      <div class="kh-f kh-fees">${fieldHTML({ k: 'fees', label: 'Fees taken off (£)', type: 'number', min: 0 }, r.fees || '')}</div>
      <div class="kh-f kh-src">${fieldHTML({ k: 'source', label: 'Payout from', type: 'select', placeholder: false, options: ['Shopify Payments Balance', 'TikTok Shop Balance', 'PayPal Balance', 'Card Reader (SumUp) Balance'].filter(n => accNamed(n)).map(n => [n, n]) }, r.source)}</div>
      <div class="kh-f kh-chan">${fieldHTML({ k: 'channel', label: 'Sold where', type: 'select', placeholder: false, options: [['stall', 'Market stall / in person'], ['shopify', 'Website (Shopify)'], ['tiktok', 'TikTok Shop']] }, r.channel || 'stall')}</div>
    </div>
    <div class="kh-f kh-its">${itemsHTML}</div>
    <p class="muted small kh-hint" id="khHint"></p>`, {
    submit: 'Save entry', after: f => { f.elements.type.onchange = () => khToggle(f); f.elements.method.onchange = () => khToggle(f); khToggle(f); },
    onSubmit: f => khSave(f),
  });
}
function khToggle(f) {
  const t = f.elements.type.value, m = f.elements.method.value;
  const show = { 'kh-who': ['sale', 'purchase', 'pay', 'receive', 'expense'], 'kh-method': ['sale', 'purchase', 'expense', 'pay', 'receive', 'capital', 'drawings', 'payout'],
    'kh-cat': ['expense', 'purchase'], 'kh-desc': ['purchase'], 'kh-fees': ['payout'], 'kh-src': ['payout'], 'kh-chan': ['sale'], 'kh-its': ['sale', 'purchase'] };
  Object.entries(show).forEach(([c, ts]) => $$('.' + c, f).forEach(el => { el.style.display = ts.includes(t) ? '' : 'none'; }));
  if (t === 'purchase') $('.kh-cat span', f).textContent = 'Category (if not stock)';
  else if ($('.kh-cat span', f)) $('.kh-cat span', f).textContent = 'Category';
  const lbl = $('.kh-method span', f);
  if (lbl) lbl.textContent = t === 'payout' ? 'Paid into' : t === 'receive' ? 'Received as' : t === 'capital' ? 'Put into' : t === 'drawings' ? 'Taken from' : 'Paid with';
  const who = f.elements.who.value.trim();
  const hints = {
    sale: m === 'credit' ? `Goes on ${who || 'the customer'}'s account (they owe you). Stock goes down.` : `Cash/card sale${who ? ' to ' + who : ' (walk-in customer)'}. Stock goes down.`,
    purchase: m === 'credit' ? `Added to ${who || 'the supplier'}'s account — you owe them.` : `Paid now${who ? ' to ' + who : ''}. Shown in the supplier's ledger as bought and paid.`,
    expense: 'Saved as an expense in the chosen category.', pay: `Reduces what you owe ${who || 'the supplier'}.`, receive: `Reduces what ${who || 'the customer'} owes you.`,
    payout: 'Moves money from Shopify / TikTok / PayPal to your bank. Fees go to expenses.', capital: 'Recorded as owner’s money put into the business.', drawings: 'Recorded as owner’s money taken out of the business.',
  };
  $('#khHint').textContent = hints[t] || '';
}
async function khPerson(name, type) {
  const n = String(name || '').trim();
  if (!n) return null;
  const c = khContact(n, type) || (khContact(n) && khContact(n).type === type ? khContact(n) : null);
  if (c) return c;
  const nc = await ins('contacts', { type, name: n, opening_balance: 0 });
  S.contacts.push(nc);
  return nc;
}
async function khSave(f) {
  const r = KH.pending, E = f.elements;
  const type = E.type.value, amount = r2(num(E.amount.value)), date = E.date.value, method = E.method.value, who = E.who.value.trim();
  if (!type) throw new Error('Choose what happened');
  if (amount <= 0) throw new Error('Enter the amount');
  checkLock(date);
  const P = payAccounts();
  const payAcc = { cash: P.cash, card: P.card, bank: P.bank, paypal: P.paypal }[method] || P.cash;
  if (!payAcc) throw new Error('Add a cash or bank account first (Bank & Cash).');
  $$('.kh-q', f).forEach(i => { r.items[+i.dataset.n].qty = num(i.value); });
  const items = r.items.filter(i => i.qty > 0);
  const wh = mainWh()?.id;
  const note = r.raw;

  if (type === 'sale') {
    const lines = items.length ? (() => { const base = sum(items, i => i.qty * i.price); const k = base ? amount / base : 0; return items.map(i => ({ ...i, price: r2(base ? i.price * k : amount / items.length / i.qty) })); })()
      : [{ product_id: null, description: 'Sale', qty: 1, price: amount }];
    const fix = r2(amount - sum(lines, i => i.qty * i.price)); if (Math.abs(fix) > 0 && lines.length) lines[0].price = r2(lines[0].price + fix / lines[0].qty);
    const chan = E.channel.value;
    const salesAcc = (chan === 'shopify' ? accNamed('Shopify Website Sales') : chan === 'tiktok' ? accNamed('TikTok Shop Sales') : accNamed('Market Stall Sales')) || sysAcc('sales');
    if (who || method === 'credit') {
      if (!who) throw new Error('Write the customer’s name for a credit sale');
      const c = await khPerson(who, 'customer');
      const subtotal = r2(sum(lines, i => i.qty * i.price));
      const doc = await ins('documents', { kind: 'invoice', number: nextNumber('invoice'), contact_id: c.id, date, due_date: method === 'credit' ? addDays(date, 14) : date,
        warehouse_id: wh, items: lines, subtotal, discount: 0, tax_rate: 0, tax: 0, landed: 0, total: subtotal, notes: note, status: null });
      await postInvoice(doc);
      if (salesAcc && salesAcc.id !== sysAcc('sales')?.id) await khMoveSales(doc.id, salesAcc.id);
      if (method !== 'credit') await khPayment('in', c, doc.id, payAcc, amount, date, method);
    } else {
      const ref = uuid(); let cogs = 0; const moves = [];
      items.forEach(i => { const p = byId('products', i.product_id); cogs += i.qty * (+p?.cost || 0); moves.push({ product_id: i.product_id, warehouse_id: wh, qty: -i.qty, date, ref_type: 'invoice', ref_id: ref, note: 'Walk-in sale' }); });
      await postJournal({ date, memo: `Sale: ${items.length ? items.map(i => `${i.qty}× ${i.description}`).join(', ') : 'walk-in customer'} (${method})`, ref_type: 'journal', ref_id: ref, lines: [
        { account_id: payAcc.id, debit: amount }, { account_id: salesAcc.id, credit: amount },
        { account_id: acc('cogs'), debit: r2(cogs) }, { account_id: acc('inventory'), credit: r2(cogs) }] });
      if (moves.length) await insMany('stock_moves', moves);
    }
  } else if (type === 'purchase') {
    const c = await khPerson(who || 'Cash purchases', 'supplier');
    const desc = E.desc.value.trim() || 'Purchase';
    let lines;
    if (items.length) {
      const base = sum(items, i => i.qty * (+byId('products', i.product_id)?.cost || 0));
      lines = items.map(i => ({ product_id: i.product_id, description: i.description, qty: i.qty, price: r2(base ? (+byId('products', i.product_id)?.cost || 0) * amount / base : amount / sum(items, x => x.qty)) }));
      const fix = r2(amount - sum(lines, i => i.qty * i.price)); if (fix) lines[0].price = r2(lines[0].price + fix / lines[0].qty);
    } else {
      const qm = desc.match(/^(\d+)\s+(.+)$/);
      lines = [{ product_id: null, description: desc, qty: 1, price: amount, account_id: E.account_id.value, ...(qm ? { description: `${qm[1]} ${qm[2]}` } : {}) }];
    }
    const subtotal = r2(sum(lines, i => i.qty * i.price));
    const doc = await ins('documents', { kind: 'bill', number: nextNumber('bill'), contact_id: c.id, date, due_date: method === 'credit' ? addDays(date, 30) : date,
      warehouse_id: wh, items: lines, subtotal, discount: 0, tax_rate: 0, tax: 0, landed: 0, total: subtotal, notes: note, status: null });
    await postBill(doc, true);
    if (method !== 'credit') await khPayment('out', c, doc.id, payAcc, amount, date, method);
  } else if (type === 'expense') {
    const row = await ins('expenses', { account_id: E.account_id.value, amount, date, paid_from: payAcc.id, payee: who || null, note });
    await postJournal({ date, memo: `Expense: ${byId('accounts', row.account_id)?.name || ''}${who ? ' — ' + who : ''}`, ref_type: 'expense', ref_id: row.id,
      lines: [{ account_id: row.account_id, debit: amount }, { account_id: payAcc.id, credit: amount }] });
  } else if (type === 'pay' || type === 'receive') {
    if (!who) throw new Error(`Write who you ${type === 'pay' ? 'paid' : 'received money from'}`);
    const c = await khPerson(who, type === 'pay' ? 'supplier' : 'customer');
    const open = S.documents.filter(d => d.contact_id === c.id && d.kind === (type === 'pay' ? 'bill' : 'invoice') && balOf(d) > 0.009).sort((a, b) => a.date.localeCompare(b.date))[0];
    await khPayment(type === 'pay' ? 'out' : 'in', c, open?.id || null, payAcc, amount, date, method);
  } else if (type === 'payout') {
    const src = accNamed(E.source.value);
    if (!src) throw new Error('Choose where the payout came from');
    const fees = r2(num(E.fees.value));
    const feeAcc = accNamed(/tiktok/i.test(src.name) ? 'TikTok Shop & Marketplace Fees' : 'Payment Processing Fees') || generalAcc();
    const to = method === 'cash' ? P.bank : payAcc;
    await postJournal({ date, memo: `Payout ${src.name} → ${to.name}`, ref_type: 'journal', ref_id: uuid(), lines: [
      { account_id: to.id, debit: amount }, { account_id: feeAcc.id, debit: fees }, { account_id: src.id, credit: r2(amount + fees) }] });
  } else if (type === 'capital' || type === 'drawings') {
    const cap = sysAcc('capital');
    await postJournal({ date, memo: type === 'capital' ? `Owner put money in (${payAcc.name})` : `Owner took money out (${payAcc.name})`, ref_type: 'journal', ref_id: uuid(),
      lines: type === 'capital' ? [{ account_id: payAcc.id, debit: amount }, { account_id: cap.id, credit: amount }] : [{ account_id: cap.id, debit: amount }, { account_id: payAcc.id, credit: amount }] });
  }
  await refresh();
  const box = $('#khText'); if (box) box.value = '';
  toast('Saved ✓');
}
async function khPayment(direction, c, docId, account, amount, date, method) {
  const methodName = { cash: 'Cash', card: 'Card', bank: 'Bank Transfer', paypal: 'Online / Wallet' }[method] || 'Cash';
  const p = await ins('payments', { direction, contact_id: c.id, document_id: docId, account_id: account.id, amount, date, method: methodName, note: null });
  await postJournal({ date, memo: `${direction === 'in' ? 'Received from' : 'Paid to'} ${c.name}`, ref_type: 'payment', ref_id: p.id,
    lines: direction === 'in' ? [{ account_id: account.id, debit: amount }, { account_id: acc('ar'), credit: amount }]
      : [{ account_id: acc('ap'), debit: amount }, { account_id: account.id, credit: amount }] });
}
async function khMoveSales(docId, salesId) {
  // credit the shop's own sales account (e.g. Market Stall Sales) instead of the general Sales Revenue
  const e = S.journal_entries.find(x => x.ref_id === docId) || (await q(sb.from('journal_entries').select('*').eq('ref_id', docId)))[0];
  if (!e) return;
  const lines = await q(sb.from('journal_lines').select('*').eq('entry_id', e.id));
  const l = lines.find(x => x.account_id === sysAcc('sales')?.id);
  if (l) await q(sb.from('journal_lines').update({ account_id: salesId }).eq('id', l.id));
}

/* ===================== Bank statement upload =====================
   Upload a monthly CSV statement from any UK bank. Each line is sorted into the right account
   (Shopify/TikTok/SumUp payouts → sales, Royal Mail → postage, ATM → cash, …). Lines it can't place
   are marked "Choose…", and once chosen the same payee is remembered next month.
   ================================================================= */
const BS = { rows: [], headers: [], map: {}, lines: [], bankId: null };
const SHOPIFY_FEE_PCT = 2; // estimate used to split Shopify payouts into sales + fees
const BS_FIELDS = [
  ['date', 'Date', /^(date|transaction date|posting date|posted date|value date|completed date)$/i, true],
  ['desc', 'Description / payee', /^(description|transaction description|details|counter party|counterparty|name|payee|merchant|narrative|memo|reference|transaction details)$/i, true],
  ['amount', 'Amount (one column, minus = money out)', /^(amount|value|amount \(gbp\)|amount gbp|transaction amount|net amount)$/i],
  ['in', 'Money in (if separate column)', /^(paid in|money in|credit|credit amount|in|paid in \(gbp\)|deposits?)$/i],
  ['out', 'Money out (if separate column)', /^(paid out|money out|debit|debit amount|out|paid out \(gbp\)|withdrawals?)$/i],
  ['ref', 'Reference (optional)', /^(reference|ref|payment reference)$/i],
];
const BS_RULES = [
  // [regex on description, direction ('in' | 'out' | ''), account names to try, special]
  [/shopify/, 'in', ['Shopify Website Sales'], 'shopify'],
  [/tiktok/, 'in', ['TikTok Shop Sales']],
  [/sumup|sum up|zettle|izettle|square/, 'in', ['Market Stall Sales']],
  [/paypal/, 'in', ['Other Online Sales']],
  [/cash (dep|in)|counter credit|deposit|paid in at|branch/, 'in', ['Market Stall Sales']],
  [/atm|cash withdrawal|cashpoint|link /, 'out', ['Cash in Hand']],
  [/shopify/, 'out', ['Shopify Plan & Apps']],
  [/royal mail|evri|hermes|dpd|parcelforce|post office|ups |dhl|yodel|packlink|click ?& ?drop/, 'out', ['Postage & Couriers', 'Transport & Freight']],
  [/facebk|facebook|meta |instagram|tiktok ads|tiktok|google ads/, 'out', ['Social Media & Influencers', 'Marketing']],
  [/canva|google|godaddy|namecheap|wix|squarespace|adobe|microsoft|apple\.com|icloud/, 'out', ['Website, Domain & Software', 'Office Expenses']],
  [/insurance|simply business|hiscox|axa|aviva/, 'out', ['Business Insurance']],
  [/tfl|uber|bolt|trainline|national rail|shell|esso|bp |texaco|parking|ringgo|congestion/, 'out', ['Transport & Freight']],
  [/covent garden|apple market|market (rent|pitch|fee)|pitch/, 'out', ['Market Pitch & Stall Rent', 'Rent']],
  [/vistaprint|stickermule|label|packag|boxes|ribbon|tissue|mailer/, 'out', ['Packaging & Gift Boxes', 'Jars, Bottles & Labels']],
  [/sumup|zettle|paypal fee|stripe/, 'out', ['Payment Processing Fees']],
  [/charge|fee|commission|overdraft|interest/, 'out', ['Bank Charges', 'Payment Processing Fees', 'General Expenses']],
  [/accountant|accountancy|bookkeep/, 'out', ['Accountancy & Bookkeeping']],
  [/ee |vodafone|o2 |three|bt |sky |virgin media/, 'out', ['Office Expenses']],
];
function bsKey(desc) {
  return String(desc || '').toLowerCase().replace(/[0-9*#/\\.,:;-]+/g, ' ').replace(/\b(ref|fp|bp|dd|so|bgc|pos|card|payment|to|from|on|gb|ltd|limited|uk)\b/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
}
function bsLearned() {
  // remember how earlier bank lines were sorted: "Bank: <description>" entries → the other account used
  const m = new Map();
  S.journal_entries.filter(e => /^Bank: /.test(e.memo || '')).forEach(e => {
    const lines = S.journal_lines.filter(l => l.entry_id === e.id && l.account_id !== BS.bankId);
    const pick = lines.sort((a, b) => (+b.debit + +b.credit) - (+a.debit + +a.credit))[0];
    if (pick) m.set(bsKey(e.memo.slice(6)), pick.account_id);
  });
  return m;
}
function bsGuess(desc, dir, learned) {
  const k = bsKey(desc);
  if (k && learned.has(k)) return { id: learned.get(k), how: 'remembered' };
  const d = ' ' + String(desc).toLowerCase() + ' ';
  const sup = S.contacts.find(c => c.type === 'supplier' && c.name.length > 2 && d.includes(c.name.toLowerCase()));
  if (sup && dir === 'out') return { id: acc('ap'), how: 'supplier', contact: sup };
  const cus = S.contacts.find(c => c.type === 'customer' && c.name.length > 2 && d.includes(c.name.toLowerCase()));
  if (cus && dir === 'in') return { id: acc('ar'), how: 'customer', contact: cus };
  for (const [re, rd, names, special] of BS_RULES) {
    if (rd && rd !== dir) continue;
    if (!re.test(d)) continue;
    const a = accNamed(...names);
    if (a) return { id: a.id, how: 'rule', special };
  }
  return { id: '', how: '' };
}
function openBankImport() {
  const bankOptsList = banks().map(a => [a.id, a.name]);
  const def = sysAcc('bank')?.id || banks()[0]?.id;
  openModal('Upload bank statement', `
    <p class="muted" style="margin:0 0 12px">Download the month's statement from online banking as <b>CSV</b> (sometimes called “Excel” or “spreadsheet”) and upload it here.
      Each line is sorted automatically. Lines already uploaded are skipped, so it's safe to upload overlapping months.</p>
    <div class="form-grid">
      ${fieldHTML({ k: 'bank', label: 'Which account is this statement for?', type: 'select', placeholder: false, options: bankOptsList }, def)}
      <label class="field"><span>CSV file *</span><input type="file" name="file" accept=".csv,text/csv" required></label>
    </div>`, {
    wide: true, submit: 'Read statement',
    onSubmit: async f => {
      const file = f.elements.file.files[0];
      if (!file) throw new Error('Choose the CSV file');
      let rows = parseCSV(await file.text());
      // some banks put a few title lines above the real header — find the first row that looks like a header
      const hi = rows.findIndex(r => r.some(c => /^(date|transaction date|posting date)$/i.test(c.trim())));
      if (hi > 0) rows = rows.slice(hi);
      if (rows.length < 2) throw new Error('No transactions found in this file.');
      const headerLike = rows[0].some(c => /date/i.test(c)) && !rows[0].some(c => dateIn(c));
      BS.headers = headerLike ? rows[0].map(h => h.trim()) : rows[0].map((_, i) => `Column ${i + 1}`);
      BS.rows = headerLike ? rows.slice(1) : rows;
      BS.bankId = f.elements.bank.value;
      BS.map = {};
      BS_FIELDS.forEach(([k, , re]) => { const i = BS.headers.findIndex(h => re.test(h)); if (i >= 0 && !Object.values(BS.map).includes(i)) BS.map[k] = i; });
      if (!headerLike) { // e.g. HSBC: Date, Description, Amount with no header
        const r = BS.rows[0]; BS.map = {};
        r.forEach((c, i) => { if (BS.map.date == null && dateIn(c)) BS.map.date = i; else if (BS.map.amount == null && /^-?£?\d[\d,]*\.\d{2}$/.test(c.trim())) BS.map.amount = i; else if (BS.map.desc == null && /[a-z]/i.test(c)) BS.map.desc = i; });
      }
      const ok = BS.map.date != null && BS.map.desc != null && (BS.map.amount != null || BS.map.in != null || BS.map.out != null);
      setTimeout(ok ? bsReview : bsMapping, 0);
    },
  });
}
function bsMapping() {
  const opts = [['', '— not in file —'], ...BS.headers.map((h, i) => [String(i), h])];
  openModal('Match the columns', `<p class="muted" style="margin:0 0 12px">Tell us which column is which (you only do this once per bank).</p>
    <div class="form-grid">${BS_FIELDS.map(([k, label, , req]) => fieldHTML({ k, label, type: 'select', placeholder: false, required: req, options: opts }, BS.map[k] != null ? String(BS.map[k]) : '')).join('')}</div>`, {
    wide: true, submit: 'Continue',
    onSubmit: async f => {
      BS.map = {};
      BS_FIELDS.forEach(([k]) => { const v = f.elements[k].value; if (v !== '') BS.map[k] = +v; });
      if (BS.map.date == null || BS.map.desc == null) throw new Error('Choose the date and description columns');
      if (BS.map.amount == null && BS.map.in == null && BS.map.out == null) throw new Error('Choose the amount column (or money in / money out)');
      setTimeout(bsReview, 0);
    },
  });
}
function bsBuild() {
  const M = BS.map, get = (r, k) => (M[k] != null ? String(r[M[k]] ?? '').trim() : '');
  const learned = bsLearned();
  const done = new Set(S.journal_lines.filter(l => l.account_id === BS.bankId).map(l => { const e = S.entryById.get(l.entry_id); return e ? `${e.date}|${r2(+l.debit - +l.credit)}|${e.memo}` : ''; }));
  const seen = new Map();
  return BS.rows.map(r => {
    const date = dateIn(get(r, 'date'));
    let amt;
    if (M.amount != null) amt = moneyIn(get(r, 'amount'));
    else amt = moneyIn(get(r, 'in')) - Math.abs(moneyIn(get(r, 'out')));
    const desc = [get(r, 'desc'), M.ref != null && M.ref !== M.desc ? get(r, 'ref') : ''].filter(Boolean).join(' · ').slice(0, 120) || 'Bank transaction';
    if (!date || !amt) return null;
    const dir = amt > 0 ? 'in' : 'out';
    const memo = `Bank: ${desc}`;
    const key = `${date}|${r2(amt)}|${memo}`;
    const n = (seen.get(key) || 0) + 1; seen.set(key, n);
    const g = bsGuess(desc, dir, learned);
    return { date, desc, amt: r2(amt), dir, memo, account_id: g.id, how: g.how, special: g.special, contact: g.contact, skip: n === 1 && done.has(key) ? 'already uploaded' : '' };
  }).filter(Boolean);
}
function bsReview() {
  try { BS.lines = bsBuild(); } catch (e) { return toast(e.message, 'err'); }
  const L = BS.lines, todo = L.filter(l => !l.skip);
  const unknown = todo.filter(l => !l.account_id).length;
  const others = a => a.id !== BS.bankId && a.sys !== 'inventory' && a.sys !== 'cogs';
  const row = (l, i) => `<tr class="${l.skip ? 'muted' : ''}">
    <td><input type="checkbox" class="bs-on" data-i="${i}" ${l.skip ? '' : 'checked'} ${l.skip ? 'disabled' : ''}></td>
    <td style="white-space:nowrap">${fmtDate(l.date)}</td>
    <td style="min-width:200px">${esc(l.desc)}${l.how === 'remembered' ? ' <span class="badge b-paid">remembered</span>' : ''}${l.contact ? ` <span class="badge">${esc(l.contact.name)}</span>` : ''}${l.skip ? ` <span class="badge">${l.skip}</span>` : ''}</td>
    <td class="r ${l.dir === 'in' ? 'up' : 'down'}" style="white-space:nowrap"><b>${l.dir === 'in' ? '+' : '−'}${fmtN(Math.abs(l.amt))}</b></td>
    <td>${l.skip ? '' : `<select class="bs-acc ${l.account_id ? '' : 'bs-need'}" data-i="${i}" onchange="this.classList.toggle('bs-need',!this.value);bsCount()"><option value="">Choose…</option>${accOptions(l.account_id, others)}</select>`}</td></tr>`;
  openModal(`Bank statement — ${todo.length} new line${todo.length === 1 ? '' : 's'}`, `
    <div class="grid g4 mb">${kpi('Money in', money0(sum(todo.filter(l => l.dir === 'in'), l => l.amt)))}${kpi('Money out', money0(-sum(todo.filter(l => l.dir === 'out'), l => l.amt)))}
      ${kpi('Sorted automatically', String(todo.length - unknown))}${kpi('Need you', `<i id="bsNeed" style="font-style:normal">${unknown}</i>`, 'choose a category', unknown ? 'bad' : '')}</div>
    <p class="muted small" style="margin:0 0 10px">Shopify payouts are counted as Shopify sales; about ${SHOPIFY_FEE_PCT}% is added back as Shopify fees (an estimate). Cash paid into the bank is counted as market stall sales — change any line if that's not right.</p>
    <div class="table-wrap"><table class="tbl bs-tbl"><thead><tr><th></th><th>Date</th><th>Description</th><th class="r">Amount</th><th>Goes to</th></tr></thead>
    <tbody>${L.map(row).join('')}</tbody></table></div>`, {
    wide: true, submit: todo.length ? 'Save to books' : 'Close', noFocus: true,
    onSubmit: async f => { if (todo.length) await bsSave(f); },
  });
}
function bsCount() { const el = $('#bsNeed'); if (el) el.textContent = $$('.bs-acc').filter(s => !s.value && $(`.bs-on[data-i="${s.dataset.i}"]`)?.checked).length; }
async function bsSave(f) {
  const pick = $$('.bs-on', f).filter(c => c.checked).map(c => +c.dataset.i);
  const missing = pick.filter(i => !$(`.bs-acc[data-i="${i}"]`, f)?.value);
  if (missing.length) throw new Error(`Choose where ${missing.length} line(s) go, or untick them`);
  if (!pick.length) throw new Error('Nothing selected');
  const bank = BS.bankId, fees = accNamed('Payment Processing Fees');
  let n = 0;
  for (const i of pick) {
    const l = BS.lines[i], other = $(`.bs-acc[data-i="${i}"]`, f).value, a = Math.abs(l.amt);
    checkLock(l.date);
    const ref = uuid();
    let lines;
    if (l.dir === 'in') {
      const shop = l.special === 'shopify' && other === l.account_id && fees;
      const gross = shop ? r2(a / (1 - SHOPIFY_FEE_PCT / 100)) : a;
      lines = [{ account_id: bank, debit: a }, ...(shop ? [{ account_id: fees.id, debit: r2(gross - a) }] : []), { account_id: other, credit: gross }];
    } else lines = [{ account_id: other, debit: a }, { account_id: bank, credit: a }];
    if ((other === acc('ap') || other === acc('ar')) && l.contact) {
      const p = await ins('payments', { direction: l.dir, contact_id: l.contact.id, document_id: null, account_id: bank, amount: a, date: l.date, method: 'Bank Transfer', note: l.desc });
      await postJournal({ date: l.date, memo: l.memo, ref_type: 'payment', ref_id: p.id, lines });
    } else {
      await postJournal({ date: l.date, memo: l.memo, ref_type: 'journal', ref_id: ref, lines });
    }
    n++;
    if (n % 15 === 0) toast(`Saved ${n} of ${pick.length}…`);
  }
  await refresh();
  toast(`${n} bank line${n === 1 ? '' : 's'} saved`);
}

/* ===================== UK shop: online orders, market days, payouts =====================
   For businesses set up as "UK Online Shop & Market Stall" (e.g. Shea Luv).
   - Import Shopify / TikTok Shop order exports (CSV) → sales, delivery, VAT, refunds, stock and cost of sales
   - Record a market day (cash + card takings, products sold, pitch rent)
   - Record payouts from Shopify / TikTok / PayPal / SumUp to the bank (with fees)
   ========================================================================================= */
const SHOP = {
  shopifyClr: 'Shopify Payments Balance', tiktokClr: 'TikTok Shop Balance', paypalClr: 'PayPal Balance', cardClr: 'Card Reader (SumUp) Balance',
  shopifySales: 'Shopify Website Sales', tiktokSales: 'TikTok Shop Sales', marketSales: 'Market Stall Sales', otherSales: 'Other Online Sales',
  delivery: 'Delivery Charges Received', refunds: 'Refunds & Returns', procFees: 'Payment Processing Fees', mktFees: 'TikTok Shop & Marketplace Fees',
  pitch: 'Market Pitch & Stall Rent',
};
const CHANNELS = {
  shopify: { label: 'Shopify', sales: SHOP.shopifySales, clr: SHOP.shopifyClr },
  tiktok: { label: 'TikTok Shop', sales: SHOP.tiktokSales, clr: SHOP.tiktokClr },
  other: { label: 'Other online', sales: SHOP.otherSales, clr: SHOP.paypalClr },
};
const SHOP_MEMO = /^(Shopify|TikTok Shop|Other online) (order|refund) |^Market day |^Payout /;
function shopAcc(name) {
  const a = S.accounts.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!a) throw new Error(`Account "${name}" is missing. Go to Settings → Business type and choose "UK Online Shop & Market Stall".`);
  return a;
}
async function ensureShopAccounts() {
  const add = await addMissingAccounts(BIZ_TYPES.retail_uk.accounts);
  if (add.length) await reload();
}
const cashAcc = () => S.accounts.find(a => a.sys === 'cash') || banks()[0];

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', qd = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (qd) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else qd = false; }
      else f += c;
    } else if (c === '"') qd = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
const moneyIn = v => { const n = parseFloat(String(v ?? '').replace(/[£$€,\s]|GBP/gi, '')); return Number.isFinite(n) ? n : 0; };
function dateIn(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); // UK style DD/MM/YYYY
  if (m) { let d = +m[1], mo = +m[2]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  return null;
}

/* ---------- Import ---------- */
const IMP = { headers: [], rows: [], orders: [], channel: 'shopify', map: {} };
const MAP_FIELDS = [
  ['id', 'Order ID / number', /^(order id|order number|order no|name|order)$/i, true],
  ['date', 'Order date', /^(paid at|created at|created time|order date|date|paid time)$/i, true],
  ['total', 'Order total (what the customer paid)', /^(total|order amount|order total|grand total|total amount)$/i, true],
  ['shipping', 'Delivery / shipping charged', /^(shipping|shipping fee after discount|shipping fee|delivery|postage)$/i],
  ['tax', 'VAT / tax', /^(taxes|tax|vat|taxes amount)$/i],
  ['refund', 'Refunded amount', /^(refunded amount|refund amount|refund)$/i],
  ['status', 'Order / payment status', /^(financial status|order status|status)$/i],
  ['pay', 'Payment method', /^(payment method|payment gateway|payment)$/i],
  ['item', 'Product name', /^(lineitem name|product name|item name|product|sku name)$/i],
  ['sku', 'SKU', /^(lineitem sku|seller sku|sku)$/i],
  ['qty', 'Quantity', /^(lineitem quantity|quantity|qty)$/i],
];
function openImport() {
  if (!isShop()) return toast('Set business type to "UK Online Shop & Market Stall" in Settings first.', 'err');
  openModal('Import online orders', `
    <p class="muted" style="margin:0 0 12px">Export your orders as a CSV file and upload it here. Orders already imported are skipped automatically, so you can upload the same file again safely.</p>
    <div class="grid g2 mb">
      <div class="alert info"><span class="dot"></span><div><b>Shopify</b><br>Orders → Export → <i>Current page / All orders / dates</i> → <b>CSV for Excel</b>.</div></div>
      <div class="alert info"><span class="dot"></span><div><b>TikTok Shop</b><br>Seller Centre → Orders → Manage orders → <b>Export orders</b> (CSV).</div></div>
    </div>
    <div class="form-grid">
      ${fieldHTML({ k: 'channel', label: 'Where are these orders from?', type: 'select', placeholder: false, options: Object.entries(CHANNELS).map(([k, c]) => [k, c.label]) }, 'shopify')}
      <label class="field"><span>CSV file *</span><input type="file" name="file" accept=".csv,text/csv" required></label>
    </div>`, {
    wide: true, submit: 'Read file',
    onSubmit: async f => {
      const file = f.elements.file.files[0];
      if (!file) throw new Error('Choose a CSV file');
      const rows = parseCSV(await file.text());
      if (rows.length < 2) throw new Error('This file has no orders in it.');
      IMP.headers = rows[0].map(h => h.trim());
      IMP.rows = rows.slice(1);
      IMP.channel = f.elements.channel.value;
      IMP.map = {};
      MAP_FIELDS.forEach(([k, , re]) => { const i = IMP.headers.findIndex(h => re.test(h)); if (i >= 0) IMP.map[k] = i; });
      const created = IMP.headers.findIndex(h => /^(created at|created time)$/i.test(h));
      if (created >= 0) IMP.created = created; else delete IMP.created;
      setTimeout(() => (MAP_FIELDS.filter(x => x[3]).every(([k]) => IMP.map[k] != null) && IMP.channel === 'shopify' ? previewImport() : openMapping()), 0);
    },
  });
}
function openMapping() {
  const opts = [['', '— not in file —'], ...IMP.headers.map((h, i) => [String(i), h])];
  openModal('Match the columns', `
    <p class="muted" style="margin:0 0 12px">We guessed which column is which. Check the ones marked * and press Continue.</p>
    <div class="form-grid">${MAP_FIELDS.map(([k, label, , req]) => fieldHTML({ k, label, type: 'select', placeholder: false, required: req, options: opts }, IMP.map[k] != null ? String(IMP.map[k]) : '')).join('')}</div>`, {
    wide: true, submit: 'Continue',
    onSubmit: async f => {
      IMP.map = {};
      MAP_FIELDS.forEach(([k]) => { const v = f.elements[k].value; if (v !== '') IMP.map[k] = +v; });
      const miss = MAP_FIELDS.filter(x => x[3] && IMP.map[x[0]] == null);
      if (miss.length) throw new Error('Please choose: ' + miss.map(x => x[1]).join(', '));
      setTimeout(previewImport, 0);
    },
  });
}
function matchProduct(name, sku) {
  const s = String(sku || '').trim().toLowerCase(), n = String(name || '').trim().toLowerCase();
  if (s) { const p = S.products.find(x => x.sku && String(x.sku).trim().toLowerCase() === s); if (p) return p; }
  if (!n) return null;
  const exact = S.products.find(x => x.name.toLowerCase() === n);
  if (exact) return exact;
  return S.products.filter(x => n.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(n))
    .sort((a, b) => b.name.length - a.name.length)[0] || null;
}
function buildOrders() {
  const M = IMP.map, get = (r, k) => (M[k] != null ? String(r[M[k]] ?? '').trim() : '');
  const ordersById = new Map();
  for (const r of IMP.rows) {
    const id = get(r, 'id').replace(/^'/, '');
    if (!id) continue;
    let o = ordersById.get(id);
    if (!o) { o = { id, date: null, total: 0, shipping: 0, tax: 0, refund: 0, status: '', pay: '', items: [] }; ordersById.set(id, o); }
    if (!o.date) o.date = dateIn(get(r, 'date')) || (IMP.created != null ? dateIn(r[IMP.created]) : null);
    if (!o.total) o.total = moneyIn(get(r, 'total'));
    if (!o.shipping) o.shipping = moneyIn(get(r, 'shipping'));
    if (!o.tax) o.tax = moneyIn(get(r, 'tax'));
    if (!o.refund) o.refund = moneyIn(get(r, 'refund'));
    if (!o.status) o.status = get(r, 'status').toLowerCase();
    if (!o.pay) o.pay = get(r, 'pay').toLowerCase();
    const item = get(r, 'item'), sku = get(r, 'sku');
    if (item || sku) {
      const qty = M.qty != null ? moneyIn(get(r, 'qty')) : 1;
      if (qty > 0) o.items.push({ name: item || sku, sku, qty, product: matchProduct(item, sku) });
    }
  }
  const skipStatus = /pending|voided|authori[sz]ed|expired|cancel|unpaid|awaiting/;
  const ch = CHANNELS[IMP.channel];
  const done = new Set(S.journal_entries.map(e => e.memo));
  return [...ordersById.values()].map(o => {
    o.memo = `${ch.label} order ${o.id}`;
    o.skip = skipStatus.test(o.status) ? o.status : !o.date ? 'no date' : o.total <= 0 ? 'no total' : done.has(o.memo) ? 'already imported' : '';
    return o;
  });
}
function previewImport() {
  try { IMP.orders = buildOrders(); } catch (e) { return toast(e.message, 'err'); }
  const ok = IMP.orders.filter(o => !o.skip), skipped = IMP.orders.filter(o => o.skip);
  const unmatched = [...new Set(ok.flatMap(o => o.items.filter(i => !i.product).map(i => i.name)))];
  const ch = CHANNELS[IMP.channel];
  const clrOpts = banks().map(a => [a.id, a.name]);
  let clrDefault = null; try { clrDefault = shopAcc(ch.clr).id; } catch (e) { /* created on import */ }
  openModal(`Import ${ok.length} ${ch.label} order${ok.length === 1 ? '' : 's'}`, `
    <div class="grid g4 mb">${kpi('New orders', String(ok.length))}${kpi('Sales total', money0(sum(ok, o => o.total)))}
      ${kpi('Refunds', money0(sum(ok, o => o.refund)))}${kpi('Skipped', String(skipped.length), skipped.length ? 'already imported / unpaid' : '')}</div>
    ${unmatched.length ? `<div class="alert warn mb"><span class="dot"></span><div><b>${unmatched.length} product name(s) not found in Products & Stock</b> — sales will still be recorded, but stock and cost of sales won't be updated for: ${esc(unmatched.slice(0, 8).join(', '))}${unmatched.length > 8 ? '…' : ''}. Tip: add the same SKU to your products.</div></div>` : ''}
    ${fieldHTML({ k: 'clr', label: 'Money from these orders goes to', type: 'select', placeholder: false, options: clrOpts, hint: 'PayPal orders from Shopify go to "PayPal Balance" automatically.' }, clrDefault)}
    ${table([
      { h: 'Order', f: o => `<b>${esc(o.id)}</b>` },
      { h: 'Date', f: o => fmtDate(o.date) },
      { h: 'Items', f: o => esc(o.items.map(i => `${i.qty}× ${i.name}`).join(', ')).slice(0, 90) },
      { h: 'Total', r: 1, f: o => fmtN(o.total) },
      { h: '', f: o => o.skip ? `<span class="badge">${esc(o.skip)}</span>` : (o.refund ? '<span class="badge b-overdue">refund</span>' : '') },
    ], IMP.orders.slice(0, 60), { empty: 'No orders found.' })}
    ${IMP.orders.length > 60 ? `<p class="muted small">Showing 60 of ${IMP.orders.length}.</p>` : ''}`, {
    wide: true, submit: ok.length ? `Import ${ok.length} orders` : 'Close', noFocus: true,
    onSubmit: async f => { if (ok.length) await runImport(ok, f.elements.clr?.value); },
  });
}
async function runImport(list, clrId) {
  await ensureShopAccounts();
  const ch = CHANNELS[IMP.channel];
  const sales = shopAcc(ch.sales).id, deliv = shopAcc(SHOP.delivery).id, refunds = shopAcc(SHOP.refunds).id;
  const paypal = shopAcc(SHOP.paypalClr).id;
  const wh = mainWh()?.id;
  let n = 0;
  for (const o of list) {
    checkLock(o.date);
    const clr = IMP.channel === 'shopify' && /paypal/.test(o.pay) ? paypal : (clrId || shopAcc(ch.clr).id);
    const ref = uuid();
    const tax = r2(Math.min(o.tax, o.total)), ship = r2(Math.min(o.shipping, o.total - tax));
    let cogs = 0;
    const moves = [];
    for (const i of o.items) {
      if (!i.product) continue;
      cogs += i.qty * (+i.product.cost || 0);
      moves.push({ product_id: i.product.id, warehouse_id: wh, qty: -i.qty, date: o.date, ref_type: 'invoice', ref_id: ref, note: o.memo });
    }
    await postJournal({
      date: o.date, memo: o.memo, ref_type: 'journal', ref_id: ref, lines: [
        { account_id: clr, debit: o.total },
        { account_id: sales, credit: r2(o.total - ship - tax) },
        { account_id: deliv, credit: ship },
        { account_id: acc('tax'), credit: tax },
        { account_id: acc('cogs'), debit: r2(cogs) },
        { account_id: acc('inventory'), credit: r2(cogs) },
      ],
    });
    if (moves.length) await insMany('stock_moves', moves);
    if (o.refund > 0) {
      await postJournal({
        date: o.date, memo: `${ch.label} refund ${o.id}`, ref_type: 'journal', ref_id: ref,
        lines: [{ account_id: refunds, debit: r2(Math.min(o.refund, o.total)) }, { account_id: clr, credit: r2(Math.min(o.refund, o.total)) }],
      });
    }
    n++;
    if (n % 10 === 0) toast(`Imported ${n} of ${list.length}…`);
  }
  await refresh();
  toast(`${n} order${n === 1 ? '' : 's'} imported`);
}

/* ---------- Market day ---------- */
function openMarketDay() {
  if (!isShop()) return toast('Set business type to "UK Online Shop & Market Stall" in Settings first.', 'err');
  const prods = S.products.slice().sort(byName);
  const bankList = banks().map(a => [a.id, a.name]);
  let cardDef = null; try { cardDef = shopAcc(SHOP.cardClr).id; } catch (e) { cardDef = banks()[0]?.id; }
  openModal('Record a market day', `
    <div class="form-grid">
      ${fieldHTML({ k: 'date', label: 'Date', type: 'date', required: true }, today())}
      ${fieldHTML({ k: 'place', label: 'Market', required: true }, 'Apple Market, Covent Garden')}
      ${fieldHTML({ k: 'cash', label: 'Cash taken (£)', type: 'number', min: 0 }, '')}
      ${fieldHTML({ k: 'card', label: 'Card taken (£)', type: 'number', min: 0 }, '')}
      ${fieldHTML({ k: 'card_acc', label: 'Card money goes to', type: 'select', placeholder: false, options: bankList }, cardDef)}
      ${fieldHTML({ k: 'cash_acc', label: 'Cash kept in', type: 'select', placeholder: false, options: bankList }, cashAcc()?.id)}
      ${fieldHTML({ k: 'pitch', label: 'Pitch / stall rent paid (£)', type: 'number', min: 0, hint: 'Paid from the cash account above. Leave empty if none.' }, '')}
    </div>
    ${prods.length ? `<h4 style="margin:16px 0 6px">Products sold today <span class="muted small">(optional — updates stock and profit)</span></h4>
    <div class="table-wrap"><table class="tbl"><tbody>${prods.map(p => `<tr><td>${esc(p.name)}<div class="muted small">${esc(p.sku || '')} · in stock ${stockOf(p.id)}</div></td>
      <td class="r" style="width:110px"><input type="number" min="0" step="1" class="md-q" data-id="${p.id}" placeholder="0" style="width:90px"></td></tr>`).join('')}</tbody></table></div>` : ''}`, {
    wide: true, submit: 'Save market day',
    onSubmit: async f => {
      const E = f.elements, date = E.date.value, cash = num(E.cash.value), card = num(E.card.value), pitch = num(E.pitch.value);
      if (cash + card <= 0 && pitch <= 0) throw new Error('Enter the cash or card taken');
      checkLock(date);
      await ensureShopAccounts();
      const ref = uuid(), memo = `Market day ${E.place.value.trim()} ${fmtDate(date)}`, wh = mainWh()?.id;
      let cogs = 0; const moves = [];
      $$('.md-q', f).forEach(i => {
        const qn = num(i.value); if (qn <= 0) return;
        const p = byId('products', i.dataset.id);
        cogs += qn * (+p.cost || 0);
        moves.push({ product_id: p.id, warehouse_id: wh, qty: -qn, date, ref_type: 'invoice', ref_id: ref, note: memo });
      });
      if (cash + card > 0) {
        await postJournal({
          date, memo, ref_type: 'journal', ref_id: ref, lines: [
            { account_id: E.cash_acc.value, debit: cash }, { account_id: E.card_acc.value, debit: card },
            { account_id: shopAcc(SHOP.marketSales).id, credit: r2(cash + card) },
            { account_id: acc('cogs'), debit: r2(cogs) }, { account_id: acc('inventory'), credit: r2(cogs) },
          ],
        });
        if (moves.length) await insMany('stock_moves', moves);
      }
      if (pitch > 0) {
        const row = await ins('expenses', { account_id: shopAcc(SHOP.pitch).id, amount: pitch, date, paid_from: E.cash_acc.value, payee: E.place.value.trim(), note: 'Market pitch' });
        await postJournal({ date, memo: `Expense: ${SHOP.pitch} — ${row.payee}`, ref_type: 'expense', ref_id: row.id,
          lines: [{ account_id: row.account_id, debit: pitch }, { account_id: row.paid_from, credit: pitch }] });
      }
      await refresh(); toast('Market day saved');
    },
  });
}

/* ---------- Payouts ---------- */
function openPayoutForm() {
  if (!isShop()) return toast('Set business type to "UK Online Shop & Market Stall" in Settings first.', 'err');
  const clrNames = [SHOP.shopifyClr, SHOP.tiktokClr, SHOP.paypalClr, SHOP.cardClr].map(n => n.toLowerCase());
  const from = banks().filter(a => clrNames.includes(a.name.toLowerCase())).map(a => [a.id, a.name]);
  const to = banks().filter(a => !clrNames.includes(a.name.toLowerCase())).map(a => [a.id, a.name]);
  const s = sums(null, null);
  formModal('Record a payout to the bank', [
    { k: 'from', label: 'Payout from', type: 'select', required: true, placeholder: false, options: from.map(([id, n]) => [id, `${n} (balance ${fmtN(natural(byId('accounts', id), s.get(id)))})`]) },
    { k: 'to', label: 'Paid into', type: 'select', required: true, placeholder: false, options: to, default: S.accounts.find(a => a.sys === 'bank')?.id },
    { k: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { k: 'amount', label: 'Amount received in bank (£)', type: 'number', required: true, min: 0 },
    { k: 'fees', label: 'Fees deducted (£)', type: 'number', min: 0, hint: 'Shown on the payout report (Shopify: Finances → Payouts; TikTok: Finance → Statements).' },
  ], null, async v => {
    if (v.amount <= 0 && v.fees <= 0) throw new Error('Enter the amount received');
    checkLock(v.date);
    const src = byId('accounts', v.from);
    const feeAcc = shopAcc(/tiktok/i.test(src.name) ? SHOP.mktFees : SHOP.procFees).id;
    await postJournal({
      date: v.date, memo: `Payout ${src.name} → ${byId('accounts', v.to)?.name || 'Bank'}`, ref_type: 'journal', ref_id: uuid(), lines: [
        { account_id: v.to, debit: v.amount }, { account_id: feeAcc, debit: v.fees }, { account_id: v.from, credit: r2(v.amount + v.fees) },
      ],
    });
    await refresh(); toast('Payout saved');
  });
}

/* ---------- Page ---------- */
PAGES.online = () => {
  if (!isShop()) return `<div class="card"><div class="alert info"><span class="dot"></span><div>Go to <a href="#/settings">Settings → Business type</a> and choose <b>UK Online Shop & Market Stall</b> to use this page.</div></div></div>`;
  const t = today(), ms = monthStart(t), s = sums(ms, t), all = sums(null, null);
  const val = name => { const a = S.accounts.find(x => x.name.toLowerCase() === name.toLowerCase()); return a ? natural(a, s.get(a.id)) : 0; };
  const bal = name => { const a = S.accounts.find(x => x.name.toLowerCase() === name.toLowerCase()); return a ? natural(a, all.get(a.id)) : 0; };
  const entries = S.journal_entries.filter(e => SHOP_MEMO.test(e.memo || '')).sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at)));
  const linesOf = id => S.journal_lines.filter(l => l.entry_id === id);
  const monthOrders = entries.filter(e => e.date >= ms && /^Shopify order /.test(e.memo)).length;
  return `<div class="quick mb">
      <button type="button" onclick="openImport()">${ic('cart')}Import Shopify / TikTok orders</button>
      <button type="button" onclick="openMarketDay()">${ic('wallet')}Record market day</button>
      <button type="button" onclick="openPayoutForm()">${ic('bank')}Record payout</button>
      <button type="button" onclick="openBankImport()">${ic('file')}Upload bank statement</button>
      <button type="button" onclick="openExpenseForm()">${ic('dollar')}Add expense</button>
      <button type="button" onclick="UI.report='vat';go('reports')">${ic('chart')}VAT summary</button>
    </div>
    <div class="grid g4 mb">
      ${kpi('Shopify sales this month', money0(val(SHOP.shopifySales)), `${monthOrders} order(s)`)}
      ${kpi('TikTok Shop sales this month', money0(val(SHOP.tiktokSales)))}
      ${kpi('Market sales this month', money0(val(SHOP.marketSales)))}
      ${kpi('Refunds this month', money0(-val(SHOP.refunds)), '', val(SHOP.refunds) < 0 ? 'bad' : '')}
    </div>
    <div class="grid g4 mb">
      ${kpi('Waiting in Shopify', money0(bal(SHOP.shopifyClr)), 'Not yet paid to bank')}
      ${kpi('Waiting in TikTok Shop', money0(bal(SHOP.tiktokClr)), 'Not yet paid to bank')}
      ${kpi('Waiting in PayPal', money0(bal(SHOP.paypalClr)))}
      ${kpi('Waiting in card reader', money0(bal(SHOP.cardClr)))}
    </div>
    <div class="card"><div class="card-head"><h3>Orders, market days & payouts</h3><span class="grow"></span>${searchBox()}</div>
    ${table([
      { h: 'Date', f: e => fmtDate(e.date) },
      { h: 'Details', f: e => `<b>${esc(e.memo)}</b><div class="small muted">${linesOf(e.id).map(l => `${esc(byId('accounts', l.account_id)?.name || '')} ${+l.debit ? 'Dr ' + fmtN(l.debit) : 'Cr ' + fmtN(l.credit)}`).join(' · ')}</div>` },
      { h: 'Amount', r: 1, f: e => `<b>${fmtN(sum(linesOf(e.id), l => l.debit) - sum(linesOf(e.id).filter(l => S.accounts.find(a => a.id === l.account_id)?.sys === 'cogs'), l => l.debit))}</b>` },
      { h: '', r: 1, f: e => `<div class="acts">${actBtn('trash', `deleteEntry('${e.id}')`, 'Delete')}</div>` },
    ], entries.slice(0, 300), { empty: 'Nothing yet. Import your Shopify orders or record a market day to start.' })}</div>`;
};

/* ---------- Reports ---------- */
function channelReport() {
  const s = sums(UI.from, UI.to);
  const list = S.accounts.filter(a => a.type === 'income').map(a => [a.name, natural(a, s.get(a.id))]).filter(x => Math.abs(x[1]) > 0.001).sort((a, b) => b[1] - a[1]);
  const t = sum(list, x => x[1]);
  const count = re => S.journal_entries.filter(e => e.date >= UI.from && e.date <= UI.to && re.test(e.memo || '')).length;
  const counts = { [SHOP.shopifySales]: count(/^Shopify order /), [SHOP.tiktokSales]: count(/^TikTok Shop order /), [SHOP.marketSales]: count(/^Market day /), [SHOP.otherSales]: count(/^Other online order /), 'Sales Revenue': S.documents.filter(d => d.kind === 'invoice' && d.date >= UI.from && d.date <= UI.to).length };
  const rows = list.map(([n, v]) => ({ cells: [n, counts[n] != null ? String(counts[n]) : '', v, t ? `${Math.round(v / t * 100)}%` : ''] }));
  rows.push({ cls: 'grand', cells: ['Total sales (after refunds)', '', t, '100%'] });
  return { title: 'Sales by Channel', sub: range() + ' · orders / market days / invoices', cols: [{ h: 'Channel' }, { h: 'Count', r: 1 }, { h: 'Sales', r: 1 }, { h: 'Share', r: 1 }], rows: list.length ? rows : [] };
}
function marginReport() {
  const sold = new Map();
  S.stock_moves.filter(m => m.ref_type === 'invoice' && +m.qty < 0 && m.date >= UI.from && m.date <= UI.to)
    .forEach(m => sold.set(m.product_id, (sold.get(m.product_id) || 0) - +m.qty));
  const list = S.products.slice().sort(byName);
  const rows = list.map(p => {
    const price = +p.price || 0, cost = +p.cost || 0, q2 = sold.get(p.id) || 0;
    return { cells: [p.name, price, cost, price - cost, price ? `${Math.round((price - cost) / price * 100)}%` : '—', String(r2(q2)), q2 * (price - cost)] };
  });
  rows.push({ cls: 'grand', cells: ['Total', '', '', '', '', String(r2(sum([...sold.values()], x => x))), sum(list, p => (sold.get(p.id) || 0) * ((+p.price || 0) - (+p.cost || 0)))] });
  return { title: 'Product Margins', sub: range() + ' · uses selling price and cost price from Products & Stock (all channels)', cols: [{ h: 'Product' }, { h: 'Price', r: 1 }, { h: 'Cost', r: 1 }, { h: 'Profit / unit', r: 1 }, { h: 'Margin', r: 1 }, { h: 'Sold', r: 1 }, { h: 'Est. profit', r: 1 }], rows: list.length ? rows : [] };
}
const VAT_THRESHOLD = 90000; // UK VAT registration threshold (rolling 12 months) — check gov.uk if it changes
function vatReport() {
  const taxId = S.accounts.find(a => a.sys === 'tax')?.id;
  let out = 0, inp = 0;
  S.journal_lines.forEach(l => {
    if (l.account_id !== taxId) return;
    const e = S.entryById.get(l.entry_id);
    if (!e || e.date < UI.from || e.date > UI.to) return;
    if (['invoice', 'journal'].includes(e.ref_type)) out += +l.credit - (e.ref_type === 'invoice' ? +l.debit : 0);
    if (['bill', 'expense'].includes(e.ref_type)) inp += +l.debit;
  });
  const s = sums(UI.from, UI.to);
  const salesEx = sum(S.accounts.filter(a => a.type === 'income'), a => natural(a, s.get(a.id)));
  const buysEx = sum(S.documents.filter(d => d.kind === 'bill' && d.date >= UI.from && d.date <= UI.to), d => +d.subtotal - +d.discount)
    + sum(S.expenses.filter(e => e.date >= UI.from && e.date <= UI.to), e => e.amount);
  const y0 = addDays(UI.to, -364), ys = sums(y0, UI.to);
  const turnover12 = sum(S.accounts.filter(a => a.type === 'income'), a => natural(a, ys.get(a.id)));
  const pctT = Math.round(turnover12 / VAT_THRESHOLD * 100);
  const rows = [
    { cells: ['Box 1', 'VAT due on sales', r2(out)] },
    { cells: ['Box 2', 'VAT due on acquisitions from EU (Northern Ireland only)', 0] },
    { cls: 'total', cells: ['Box 3', 'Total VAT due (Box 1 + 2)', r2(out)] },
    { cells: ['Box 4', 'VAT reclaimed on purchases', r2(inp)] },
    { cls: 'grand', cells: ['Box 5', out - inp >= 0 ? 'Net VAT to pay HMRC' : 'Net VAT HMRC owes you', r2(Math.abs(out - inp))] },
    { cells: ['Box 6', 'Total sales excluding VAT', r2(salesEx)] },
    { cells: ['Box 7', 'Total purchases & expenses excluding VAT', r2(buysEx)] },
    { cells: ['Box 8', 'Goods supplied to EU (Northern Ireland only)', 0] },
    { cells: ['Box 9', 'Goods acquired from EU (Northern Ireland only)', 0] },
    { cls: 'head', cells: ['', 'VAT registration check', ''] },
    { cells: ['', `Sales in the 12 months to ${fmtDate(UI.to)}`, r2(turnover12)] },
    { cells: ['', `UK registration threshold (£${fmt0(VAT_THRESHOLD)}) — you are at ${pctT}%${pctT >= 100 ? ' · OVER: you must register for VAT' : pctT >= 80 ? ' · getting close, speak to your accountant' : ''}`, VAT_THRESHOLD] },
  ];
  return { title: 'UK VAT Summary', sub: `${range()} · a summary for you and your accountant — not submitted to HMRC`, cols: [{ h: 'Box' }, { h: 'Description' }, { h: 'Amount', r: 1 }], rows };
}

/* ===================== Reports ===================== */
const REPORTS = [
  ['pl', 'Profit & Loss', true], ['bs', 'Balance Sheet', false], ['tb', 'Trial Balance', false], ['cash', 'Cash Flow', true],
  ['ar', 'Receivables Aging', false], ['ap', 'Payables Aging', false], ['stock', 'Stock Report', false],
  ['salesc', 'Sales by Customer', true], ['salesp', 'Sales by Product', true], ['exp', 'Expenses by Category', true],
  ['tax', 'Tax Summary', true], ['ledger', 'Account Ledger', true],
  ['channel', 'Sales by Channel', true], ['margin', 'Product Margins', true], ['vat', 'UK VAT Summary', true],
];
PAGES.reports = () => {
  if (!UI.to) UI.to = today();
  if (!UI.from) UI.from = monthStart(today());
  const R = REPORTS.find(r => r[0] === UI.report) || REPORTS[0];
  let rep;
  try { rep = REPORT_FN[R[0]](); } catch (e) { rep = { title: R[1], cols: [{ h: 'Error' }], rows: [{ cells: [e.message] }] }; }
  UI.rep = rep;
  const presets = [['This month', monthStart(today()), today()], ['Last month', shiftMonth(today(), -1), monthEnd(shiftMonth(today(), -1))],
    ['This year', today().slice(0, 4) + '-01-01', today()], ['Last 12 months', addDays(today(), -365), today()]];
  return `<div class="card mb"><div class="report-pick">${REPORTS.map(([k, l]) => `<button type="button" class="${k === R[0] ? 'on' : ''}" onclick="setReport('${k}')">${l}</button>`).join('')}</div></div>
  <div class="card mb"><div class="range">
    ${R[2] ? `<label class="field"><span>From</span><input type="date" value="${UI.from}" onchange="setRange('from',this.value)"></label>` : ''}
    <label class="field"><span>${R[2] ? 'To' : 'As of'}</span><input type="date" value="${UI.to}" onchange="setRange('to',this.value)"></label>
    ${R[2] ? presets.map(([l, f, t]) => `<button class="btn sm" onclick="UI.from='${f}';UI.to='${t}';render()">${l}</button>`).join('') : ''}
    ${R[0] === 'ledger' ? `<label class="field" style="width:240px"><span>Account</span><select onchange="UI.ledgerAcc=this.value;render()">${accOptions(UI.ledgerAcc)}</select></label>` : ''}
    <span class="grow"></span><button class="btn sm" onclick="exportReport()">Export Excel (CSV)</button><button class="btn sm" onclick="printReport()">${ic('print')} Print / PDF</button></div></div>
  <div class="card"><div class="card-head"><h3>${esc(rep.title)}</h3><span class="grow"></span><span class="muted small">${esc(rep.sub || '')}</span></div>${reportTable(rep)}</div>`;
};
function setReport(k) { UI.report = k; render(); }
function setRange(k, v) { UI[k] = v || today(); render(); }
function reportTable(rep) {
  if (!rep.rows.length) return '<div class="empty">No data for this period.</div>';
  return `<div class="table-wrap"><table class="tbl"><thead><tr>${rep.cols.map(c => `<th class="${c.r ? 'r' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>
  ${rep.rows.map(r => `<tr class="${r.cls || ''}">${r.cells.map((v, i) => `<td class="${rep.cols[i]?.r ? 'r' : ''}">${typeof v === 'number' ? fmtN(v) : esc(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function exportReport() {
  const rep = UI.rep;
  if (!rep) return;
  const cell = v => { const s = typeof v === 'number' ? String(r2(v)) : String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [rep.cols.map(c => cell(c.h)).join(','), ...rep.rows.map(r => r.cells.map(cell).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${rep.title.replace(/[^a-z0-9]+/gi, '-')}-${today()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function printReport() {
  const rep = UI.rep;
  printHTML(rep.title, `<p class="muted">${esc(rep.sub || '')}</p><table><thead><tr>${rep.cols.map(c => `<th class="${c.r ? 'r' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>
    ${rep.rows.map(r => `<tr class="${r.cls || ''}">${r.cells.map((v, i) => `<td class="${rep.cols[i]?.r ? 'r' : ''}">${typeof v === 'number' ? fmtN(v) : esc(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
}
const range = () => `${fmtDate(UI.from)} – ${fmtDate(UI.to)}`;
const REPORT_FN = {
  pl() {
    const s = sums(UI.from, UI.to), rows = [];
    const inc = S.accounts.filter(a => a.type === 'income'), cogs = S.accounts.filter(a => a.sys === 'cogs'), exp = S.accounts.filter(a => a.type === 'expense' && a.sys !== 'cogs');
    const block = (title, list) => { rows.push({ cls: 'head', cells: [title, ''] }); let t = 0; list.forEach(a => { const v = natural(a, s.get(a.id)); if (Math.abs(v) > 0.001) { rows.push({ cls: 'indent', cells: [a.name, v] }); t += v; } }); return t; };
    const ti = block('Income', inc); rows.push({ cls: 'total', cells: ['Total income', ti] });
    const tc = block('Cost of goods sold', cogs); rows.push({ cls: 'total', cells: ['Gross profit', ti - tc] });
    const te = block('Operating expenses', exp); rows.push({ cls: 'total', cells: ['Total expenses', te] });
    rows.push({ cls: 'grand', cells: [ti - tc - te >= 0 ? 'Net profit' : 'Net loss', ti - tc - te] });
    return { title: 'Profit & Loss', sub: range(), cols: [{ h: 'Account' }, { h: 'Amount', r: 1 }], rows };
  },
  bs() {
    const s = sums(null, UI.to), rows = [];
    const block = (type, title) => { rows.push({ cls: 'head', cells: [title, ''] }); let t = 0; S.accounts.filter(a => a.type === type).forEach(a => { const v = natural(a, s.get(a.id)); if (Math.abs(v) > 0.001) { rows.push({ cls: 'indent', cells: [a.name, v] }); t += v; } }); return t; };
    const ta = block('asset', 'Assets'); rows.push({ cls: 'grand', cells: ['Total assets', ta] });
    const tl = block('liability', 'Liabilities'); rows.push({ cls: 'total', cells: ['Total liabilities', tl] });
    const te = block('equity', 'Equity');
    const earn = sum(S.accounts.filter(a => a.type === 'income'), a => natural(a, s.get(a.id))) - sum(S.accounts.filter(a => a.type === 'expense'), a => natural(a, s.get(a.id)));
    rows.push({ cls: 'indent', cells: ['Retained earnings (profit to date)', earn] });
    rows.push({ cls: 'total', cells: ['Total equity', te + earn] });
    rows.push({ cls: 'grand', cells: ['Total liabilities + equity', tl + te + earn] });
    return { title: 'Balance Sheet', sub: `As of ${fmtDate(UI.to)}${Math.abs(ta - (tl + te + earn)) < 0.01 ? ' · Balanced ✓' : ''}`, cols: [{ h: 'Account' }, { h: 'Amount', r: 1 }], rows };
  },
  tb() {
    const s = sums(null, UI.to); let td = 0, tc = 0;
    const rows = S.accounts.slice().sort((a, b) => String(a.code).localeCompare(String(b.code))).map(a => {
      const x = s.get(a.id); if (!x) return null; const n = r2(x.dr - x.cr); if (!n) return null;
      if (n > 0) td += n; else tc += -n;
      return { cells: [a.code || '', a.name, TYPE_LABEL[a.type], n > 0 ? n : '', n < 0 ? -n : ''] };
    }).filter(Boolean);
    rows.push({ cls: 'grand', cells: ['', 'Total', '', td, tc] });
    return { title: 'Trial Balance', sub: `As of ${fmtDate(UI.to)}`, cols: [{ h: 'Code' }, { h: 'Account' }, { h: 'Type' }, { h: 'Debit', r: 1 }, { h: 'Credit', r: 1 }], rows };
  },
  cash() {
    const ids = new Set(banks().map(a => a.id));
    const before = sums(null, addDays(UI.from, -1));
    const opening = sum(banks(), a => natural(a, before.get(a.id)));
    const L = { invoice: 'Sales', bill: 'Purchases', expense: 'Expenses paid', payroll: 'Salaries paid', transfer: 'Transfers between accounts', journal: 'Journal entries', opening: 'Opening balances', adjust: 'Adjustments' };
    const g = new Map();
    S.journal_lines.forEach(l => {
      if (!ids.has(l.account_id)) return;
      const e = S.entryById.get(l.entry_id);
      if (!e || e.date < UI.from || e.date > UI.to) return;
      const label = e.ref_type === 'payment' ? (+l.debit > 0 ? 'Received from customers' : 'Paid to suppliers') : (L[e.ref_type] || e.ref_type);
      const x = g.get(label) || [0, 0]; x[0] += +l.debit; x[1] += +l.credit; g.set(label, x);
    });
    const rows = [{ cls: 'head', cells: ['Opening cash & bank', '', '', opening] }];
    let tin = 0, tout = 0;
    [...g].forEach(([k, [i, o]]) => { tin += i; tout += o; rows.push({ cls: 'indent', cells: [k, i || '', o || '', ''] }); });
    rows.push({ cls: 'total', cells: ['Total', tin, tout, tin - tout] });
    rows.push({ cls: 'grand', cells: ['Closing cash & bank', '', '', opening + tin - tout] });
    return { title: 'Cash Flow', sub: range(), cols: [{ h: 'Details' }, { h: 'Money in', r: 1 }, { h: 'Money out', r: 1 }, { h: 'Net', r: 1 }], rows };
  },
  ar() { return agingReport('invoice', 'Receivables Aging (who owes you)'); },
  ap() { return agingReport('bill', 'Payables Aging (who you owe)'); },
  stock() {
    const whs = S.warehouses;
    const rows = S.products.slice().sort(byName).map(p => {
      const q2 = whs.map(w => stockOf(p.id, w.id)); const tq = sum(q2, x => x);
      return { cells: [p.name, p.sku || '', ...q2.map(x => String(x)), String(tq), +p.cost, tq * +p.cost, +p.reorder_level > 0 && tq <= +p.reorder_level ? 'LOW' : ''] };
    });
    rows.push({ cls: 'grand', cells: ['Total', '', ...whs.map(() => ''), '', '', sum(S.products, p => stockOf(p.id) * +p.cost), ''] });
    return { title: 'Stock Report', sub: 'Current stock', cols: [{ h: 'Product' }, { h: 'SKU' }, ...whs.map(w => ({ h: w.name, r: 1 })), { h: 'Total qty', r: 1 }, { h: 'Cost', r: 1 }, { h: 'Value', r: 1 }, { h: '' }], rows };
  },
  salesc() {
    const m = new Map();
    S.documents.filter(d => d.kind === 'invoice' && d.date >= UI.from && d.date <= UI.to).forEach(d => {
      const x = m.get(d.contact_id) || [0, 0, 0]; x[0]++; x[1] += +d.subtotal - +d.discount; x[2] += balOf(d); m.set(d.contact_id, x);
    });
    const rows = [...m].sort((a, b) => b[1][1] - a[1][1]).map(([id, [n, v, b]]) => ({ cells: [byId('contacts', id)?.name || '—', String(n), v, b] }));
    rows.push({ cls: 'grand', cells: ['Total', String(sum([...m.values()], x => x[0])), sum([...m.values()], x => x[1]), sum([...m.values()], x => x[2])] });
    return { title: 'Sales by Customer', sub: range(), cols: [{ h: 'Customer' }, { h: 'Invoices', r: 1 }, { h: 'Sales (excl. tax)', r: 1 }, { h: 'Unpaid', r: 1 }], rows };
  },
  salesp() {
    const m = new Map();
    S.documents.filter(d => d.kind === 'invoice' && d.date >= UI.from && d.date <= UI.to).forEach(d => d.items.forEach(i => {
      const key = i.product_id || 'custom:' + i.description;
      const x = m.get(key) || { name: byId('products', i.product_id)?.name || i.description || 'Custom', qty: 0, v: 0, cost: 0 };
      x.qty += i.qty; x.v += i.qty * i.price; x.cost += i.product_id ? i.qty * (+byId('products', i.product_id)?.cost || 0) : 0; m.set(key, x);
    }));
    const list = [...m.values()].sort((a, b) => b.v - a.v);
    const rows = list.map(x => ({ cells: [x.name, String(r2(x.qty)), x.v, x.cost, x.v - x.cost] }));
    rows.push({ cls: 'grand', cells: ['Total', '', sum(list, x => x.v), sum(list, x => x.cost), sum(list, x => x.v - x.cost)] });
    return { title: 'Sales by Product', sub: range() + ' · profit uses current cost', cols: [{ h: 'Product' }, { h: 'Qty', r: 1 }, { h: 'Sales', r: 1 }, { h: 'Est. cost', r: 1 }, { h: 'Est. profit', r: 1 }], rows };
  },
  exp() {
    const s = sums(UI.from, UI.to);
    const list = S.accounts.filter(a => a.type === 'expense').map(a => [a.name, natural(a, s.get(a.id))]).filter(x => Math.abs(x[1]) > 0.001).sort((a, b) => b[1] - a[1]);
    const t = sum(list, x => x[1]);
    const rows = list.map(([n, v]) => ({ cells: [n, v, t ? `${Math.round(v / t * 100)}%` : ''] }));
    rows.push({ cls: 'grand', cells: ['Total', t, '100%'] });
    return { title: 'Expenses by Category', sub: range(), cols: [{ h: 'Category' }, { h: 'Amount', r: 1 }, { h: 'Share', r: 1 }], rows };
  },
  tax() {
    const inv = S.documents.filter(d => d.kind === 'invoice' && d.date >= UI.from && d.date <= UI.to);
    const bills = S.documents.filter(d => d.kind === 'bill' && d.date >= UI.from && d.date <= UI.to);
    const out = sum(inv, d => d.tax), inp = sum(bills, d => d.tax);
    return { title: 'Tax Summary', sub: range(), cols: [{ h: 'Details' }, { h: 'Taxable amount', r: 1 }, { h: 'Tax', r: 1 }], rows: [
      { cells: [`Sales tax collected (${inv.length} invoices)`, sum(inv, d => +d.subtotal - +d.discount), out] },
      { cells: [`Tax paid on purchases (${bills.length} bills)`, sum(bills, d => +d.subtotal - +d.discount), inp] },
      { cls: 'grand', cells: [out - inp >= 0 ? 'Net tax payable' : 'Net tax refundable', '', out - inp] },
    ] };
  },
  channel() { return channelReport(); },
  margin() { return marginReport(); },
  vat() { return vatReport(); },
  ledger() {
    if (!byId('accounts', UI.ledgerAcc)) UI.ledgerAcc = banks()[0]?.id || S.accounts[0]?.id;
    const a = byId('accounts', UI.ledgerAcc);
    if (!a) return { title: 'Account Ledger', cols: [{ h: '' }], rows: [] };
    const sign = ['asset', 'expense'].includes(a.type) ? 1 : -1;
    let bal = natural(a, sums(null, addDays(UI.from, -1)).get(a.id));
    const rows = [{ cls: 'head', cells: ['', 'Opening balance', '', '', bal] }];
    S.journal_lines.filter(l => l.account_id === a.id).map(l => ({ l, e: S.entryById.get(l.entry_id) }))
      .filter(x => x.e && x.e.date >= UI.from && x.e.date <= UI.to)
      .sort((x, y) => x.e.date.localeCompare(y.e.date) || String(x.e.created_at).localeCompare(String(y.e.created_at)))
      .forEach(({ l, e }) => { bal += sign * (+l.debit - +l.credit); rows.push({ cells: [fmtDate(e.date), e.memo || '', +l.debit || '', +l.credit || '', bal] }); });
    rows.push({ cls: 'grand', cells: ['', 'Closing balance', '', '', bal] });
    return { title: `Ledger — ${a.name}`, sub: range(), cols: [{ h: 'Date' }, { h: 'Details' }, { h: 'Debit', r: 1 }, { h: 'Credit', r: 1 }, { h: 'Balance', r: 1 }], rows };
  },
};
function agingReport(kind, title) {
  const t = UI.to, m = new Map();
  S.documents.filter(d => d.kind === kind && d.date <= t).forEach(d => {
    const bal = balOf(d); if (bal <= 0.009) return;
    const late = daysBetween(d.due_date || d.date, t);
    const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    const name = byId('contacts', d.contact_id)?.name || '—';
    const row = m.get(name) || [0, 0, 0, 0, 0]; row[i] += bal; m.set(name, row);
  });
  const rows = [...m].sort((a, b) => sum(b[1], x => x) - sum(a[1], x => x)).map(([n, b]) => ({ cells: [n, ...b, sum(b, x => x)] }));
  const tot = [0, 1, 2, 3, 4].map(i => sum([...m.values()], b => b[i]));
  rows.push({ cls: 'grand', cells: ['Total', ...tot, sum(tot, x => x)] });
  return { title, sub: `As of ${fmtDate(t)} · days past due date`, cols: [{ h: 'Name' }, { h: 'Not due', r: 1 }, { h: '1–30', r: 1 }, { h: '31–60', r: 1 }, { h: '61–90', r: 1 }, { h: '90+', r: 1 }, { h: 'Total', r: 1 }], rows: m.size ? rows : [] };
}

/* ===================== Settings ===================== */
PAGES.settings = () => {
  const b = S.business || {};
  const own = isOwner();
  const currencies = ['PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'INR', 'CAD', 'AUD'];
  const patchNote = !S.patch ? `<div class="card mb"><div class="alert warn"><span class="dot"></span><div><b>One more step to unlock new features.</b> Run <b>supabase-update.sql</b> in Supabase → SQL Editor to enable business type, accountant access and PVC/carton costing.</div></div></div>` : '';
  const team = own && S.patch ? `<div class="card"><div class="card-head">${ic('shield')}<h3>Team & access</h3></div>
    <p class="muted small" style="margin:-6px 0 14px">Add your accountant's email. They create their own account with that email and see your business.
    <b>Accountant can:</b> view everything, add and edit entries, print reports. <b>Accountant cannot:</b> delete anything, change settings, lock date, business type or team.</p>
    <form onsubmit="addMember(event)" class="row-in mb"><input name="email" type="email" required placeholder="accountant@email.com"><button class="btn primary" type="submit">Add accountant</button></form>
    ${table([
      { h: 'Email', f: m => `<b>${esc(m.member_email)}</b>` },
      { h: 'Role', f: () => '<span class="badge b-open">Accountant</span>' },
      { h: 'Added', f: m => fmtDate(String(m.created_at).slice(0, 10)) },
      { h: '', r: 1, f: m => `<div class="acts">${actBtn('trash', `removeMember('${m.id}')`, 'Remove access')}</div>` },
    ], S.team, { empty: 'No accountant added yet.' })}</div>` : '';
  const type = S.patch ? `<div class="card"><div class="card-head"><h3>Business type</h3></div>
    <p style="margin:0 0 12px">${bizType() ? `<b>${BIZ_TYPES[bizType()].label}</b> — <span class="muted small">${esc(BIZ_TYPES[bizType()].desc)}</span>` : '<span class="muted">Not selected yet.</span>'}</p>
    ${own ? `<button class="btn" onclick="chooseBusinessType()">Change business type</button>` : ''}</div>` : '';
  return `${patchNote}<div class="grid g2">
  <div class="card"><div class="card-head"><h3>Business details</h3>${own ? '' : '<span class="badge">View only</span>'}</div>
    <p class="muted small" style="margin:-6px 0 14px">Shown on invoices, statements, costings and payslips.</p>
    <form onsubmit="saveSettings(event)" class="stack"><fieldset ${own ? '' : 'disabled'} style="border:0;padding:0;margin:0">
      <div class="form-grid">
        ${fieldHTML({ k: 'name', label: 'Business name', required: true, full: true }, b.name)}
        ${fieldHTML({ k: 'phone', label: 'Phone' }, b.phone)}
        ${fieldHTML({ k: 'email', label: 'Email', type: 'email' }, b.email)}
        ${fieldHTML({ k: 'address', label: 'Address', full: true }, b.address)}
        ${fieldHTML({ k: 'tax_no', label: 'NTN / Tax number' }, b.tax_no)}
        ${fieldHTML({ k: 'currency', label: 'Currency', type: 'select', placeholder: false, options: currencies.map(c => [c, c]) }, b.currency)}
        ${fieldHTML({ k: 'lock_date', label: 'Lock books up to (optional)', type: 'date', full: true, hint: 'No one can add, edit or delete entries on or before this date. Leave empty to keep books open.' }, b.lock_date)}
      </div></fieldset>
      ${own ? '<div><button class="btn primary" type="submit">Save settings</button></div>' : ''}
    </form></div>
  <div>${type}${team}
  <div class="card"><div class="card-head"><h3>Account</h3></div>
    <p style="margin:0 0 12px">Signed in as <b>${esc(user?.email || '')}</b> · ${own ? 'Owner' : 'Accountant'}</p>
    <div class="toolbar" style="margin:0"><button class="btn" onclick="askNewPassword()">Change password</button><button class="btn" onclick="toggleTheme()">${ic('moon')} Light / dark mode</button><button class="btn danger" onclick="signOut()">Sign out</button></div></div>
  <div class="card"><div class="card-head"><h3>Database</h3></div>
    <p class="muted small" style="margin:0 0 12px">Your data is saved in your own Supabase project. Each business only sees its own records.</p>
    <div class="grid g3 mb">${kpi('Documents', String(S.documents.length))}${kpi('Products', String(S.products.length))}${kpi('Costings', String(S.costings.length))}</div>
    ${fixedConnection() || !isOwner() ? '' : '<button class="btn" onclick="resetConnection()">Change Supabase project</button>'}</div></div>
  </div>`;
};
async function saveSettings(e) {
  e.preventDefault();
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const f = e.target;
  const v = readForm(f, ['name', 'phone', 'email', 'address', 'tax_no', 'currency', 'lock_date'].map(k => ({ k })));
  try {
    await q(sb.from('business').update(v).eq('user_id', user.id));
    await refresh(); toast('Settings saved');
  } catch (err) { toast(err.message, 'err'); }
}
async function addMember(e) {
  e.preventDefault();
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const email = e.target.email.value.trim().toLowerCase();
  if (email === String(user?.email || '').toLowerCase()) return toast('That is your own email.', 'err');
  try {
    await ins('team_members', { owner_id: user.id, member_email: email, role: 'accountant' });
    await refresh(); toast(`${email} can now sign in as your accountant`);
  } catch (err) { toast(/duplicate|unique/i.test(err.message) ? 'This email is already added.' : err.message, 'err'); }
}
async function removeMember(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  const m = S.team.find(x => x.id === id);
  if (!confirm(`Remove access for ${m?.member_email}?`)) return;
  try { await q(sb.from('team_members').delete().eq('id', id)); await refresh(); toast('Access removed'); }
  catch (err) { toast(err.message, 'err'); }
}

/* ===================== PVC & Carton costing ===================== */
const COST = {
  pvc: {
    label: 'PVC Costing', short: 'PVC',
    sections: [
      ['Job', [
        { k: 'name', label: 'Job / product name', required: true, full: true, ph: 'e.g. PVC window box 6×8' },
        { k: 'contact_id', label: 'Customer (optional)', type: 'select', options: () => S.contacts.filter(c => c.type === 'customer').sort(byName).map(c => [c.id, c.name]), placeholder: '— none —' },
        { k: 'qty', label: 'Quantity (pieces)', type: 'number', default: 1000, min: 0 },
        { k: 'unit', label: 'Size unit', type: 'select', placeholder: false, options: [['inch', 'Inch'], ['cm', 'Centimetre']], default: 'inch' },
      ]],
      ['PVC sheet', [
        { k: 'sheet_l', label: 'Sheet length', type: 'number', default: 28 },
        { k: 'sheet_w', label: 'Sheet width', type: 'number', default: 40 },
        { k: 'micron', label: 'Thickness (micron)', type: 'number', default: 250, hint: '0.25 mm = 250 micron' },
        { k: 'density', label: 'Density (g/cm³)', type: 'number', default: 1.38, hint: 'Rigid PVC ≈ 1.38, PET ≈ 1.33' },
        { k: 'rate_kg', label: 'PVC rate per kg', type: 'number', default: 450 },
        { k: 'wastage', label: 'Wastage %', type: 'number', default: 5 },
      ]],
      ['Piece (flat / blank size)', [
        { k: 'piece_l', label: 'Piece length', type: 'number', default: 6 },
        { k: 'piece_w', label: 'Piece width', type: 'number', default: 8 },
        { k: 'ups', label: 'Ups per sheet (0 = auto)', type: 'number', default: 0, min: 0, hint: 'How many pieces come from one sheet' },
      ]],
      ['Conversion', [
        { k: 'print_sheet', label: 'Printing per sheet', type: 'number', default: 0 },
        { k: 'die', label: 'Die / block (one-time)', type: 'number', default: 3000 },
        { k: 'cut_1000', label: 'Cutting / creasing per 1000 pcs', type: 'number', default: 300 },
        { k: 'paste_pc', label: 'Pasting / gluing per piece', type: 'number', default: 1 },
        { k: 'extra_pc', label: 'Other per piece (foil, hanger…)', type: 'number', default: 0 },
        { k: 'packing', label: 'Packing & transport (total)', type: 'number', default: 0 },
        { k: 'overhead', label: 'Overheads %', type: 'number', default: 5 },
        { k: 'profit', label: 'Profit margin %', type: 'number', default: 20 },
      ]],
    ],
    calc(v) {
      const k = v.unit === 'cm' ? 1 : 2.54;
      const sL = v.sheet_l * k, sW = v.sheet_w * k, pL = v.piece_l * k, pW = v.piece_w * k;
      const autoUps = pL > 0 && pW > 0 ? Math.max(Math.floor(sL / pL) * Math.floor(sW / pW), Math.floor(sL / pW) * Math.floor(sW / pL)) : 0;
      const ups = v.ups > 0 ? Math.floor(v.ups) : autoUps;
      const sheetKg = sL * sW * (v.micron / 10000) * v.density / 1000;
      const sheets = ups > 0 ? Math.ceil(v.qty / ups * (1 + v.wastage / 100)) : 0;
      const pvcKg = sheets * sheetKg;
      const lines = [
        ['PVC material', pvcKg * v.rate_kg], ['Printing', sheets * v.print_sheet], ['Die / block', v.die],
        ['Cutting / creasing', v.qty / 1000 * v.cut_1000], ['Pasting / gluing', v.qty * v.paste_pc],
        ['Other per piece', v.qty * v.extra_pc], ['Packing & transport', v.packing],
      ];
      const info = [
        ['Ups per sheet', `${ups}${v.ups > 0 ? '' : ' (auto)'}`], ['Weight per sheet', `${sheetKg.toFixed(3)} kg`],
        ['Sheets needed (incl. wastage)', String(sheets)], ['Total PVC', `${pvcKg.toFixed(2)} kg`],
        ['PVC per piece', `${v.qty ? (pvcKg / v.qty * 1000).toFixed(2) : 0} g`],
      ];
      const spec = `${v.piece_l}×${v.piece_w} ${v.unit === 'cm' ? 'cm' : 'in'}, ${v.micron} micron PVC`;
      return finishCost(v, lines, info, spec, ups > 0 ? '' : 'Piece is bigger than the sheet — check sizes.');
    },
  },
  carton: {
    label: 'Carton Costing', short: 'Carton',
    sections: [
      ['Job', [
        { k: 'name', label: 'Job / carton name', required: true, full: true, ph: 'e.g. Master carton 12×10×8 5-ply' },
        { k: 'contact_id', label: 'Customer (optional)', type: 'select', options: () => S.contacts.filter(c => c.type === 'customer').sort(byName).map(c => [c.id, c.name]), placeholder: '— none —' },
        { k: 'qty', label: 'Quantity (cartons)', type: 'number', default: 500, min: 0 },
        { k: 'unit', label: 'Size unit', type: 'select', placeholder: false, options: [['inch', 'Inch'], ['cm', 'Centimetre']], default: 'inch' },
      ]],
      ['Carton size (inside) — regular slotted carton', [
        { k: 'l', label: 'Length', type: 'number', default: 12 },
        { k: 'w', label: 'Width', type: 'number', default: 10 },
        { k: 'h', label: 'Height', type: 'number', default: 8 },
        { k: 'ply', label: 'Ply', type: 'select', placeholder: false, options: [['3', '3 ply'], ['5', '5 ply'], ['7', '7 ply']], default: '5' },
        { k: 'glue', label: 'Joint / glue flap', type: 'number', default: 1.5 },
        { k: 'trim', label: 'Trim allowance', type: 'number', default: 0.5 },
      ]],
      ['Paper', [
        { k: 'top_gsm', label: 'Top liner GSM', type: 'number', default: 150 },
        { k: 'liner_gsm', label: 'Other liners GSM (each)', type: 'number', default: 120 },
        { k: 'flute_gsm', label: 'Flute paper GSM (each)', type: 'number', default: 120 },
        { k: 'takeup', label: 'Flute take-up factor', type: 'number', default: 1.45, hint: 'B flute ≈ 1.35–1.45, C flute ≈ 1.45–1.55' },
        { k: 'liner_rate', label: 'Liner paper rate per kg', type: 'number', default: 180 },
        { k: 'flute_rate', label: 'Flute paper rate per kg', type: 'number', default: 140 },
        { k: 'wastage', label: 'Wastage %', type: 'number', default: 5 },
      ]],
      ['Conversion', [
        { k: 'conv_kg', label: 'Conversion per kg (corrugation, labour, power)', type: 'number', default: 25 },
        { k: 'print_pc', label: 'Printing per carton', type: 'number', default: 0 },
        { k: 'stitch_pc', label: 'Stitching / gluing per carton', type: 'number', default: 2 },
        { k: 'die', label: 'Die / plate (one-time)', type: 'number', default: 0 },
        { k: 'packing', label: 'Transport (total)', type: 'number', default: 0 },
        { k: 'overhead', label: 'Overheads %', type: 'number', default: 0 },
        { k: 'profit', label: 'Profit margin %', type: 'number', default: 15 },
      ]],
    ],
    calc(v) {
      const k = v.unit === 'cm' ? 1 : 2.54;
      const L = v.l * k, W = v.w * k, H = v.h * k, glue = v.glue * k, trim = v.trim * k;
      const blankL = 2 * (L + W) + glue + trim, blankW = H + W + trim;
      const area = blankL * blankW / 10000;
      const ply = +v.ply || 5, liners = (ply + 1) / 2, flutes = (ply - 1) / 2;
      const linerKg = area * (v.top_gsm + (liners - 1) * v.liner_gsm) / 1000;
      const fluteKg = area * (flutes * v.flute_gsm * v.takeup) / 1000;
      const wf = 1 + v.wastage / 100, kgPer = (linerKg + fluteKg) * wf;
      const lines = [
        ['Liner paper', v.qty * linerKg * wf * v.liner_rate], ['Flute paper', v.qty * fluteKg * wf * v.flute_rate],
        ['Conversion', v.qty * kgPer * v.conv_kg], ['Printing', v.qty * v.print_pc], ['Stitching / gluing', v.qty * v.stitch_pc],
        ['Die / plate', v.die], ['Transport', v.packing],
      ];
      const u = v.unit === 'cm' ? 'cm' : 'in', back = x => (x / k).toFixed(2);
      const info = [
        ['Blank size (sheet)', `${back(blankL)} × ${back(blankW)} ${u}`], ['Board area per carton', `${area.toFixed(3)} m²`],
        ['Weight per carton (incl. wastage)', `${kgPer.toFixed(3)} kg`], ['Total paper', `${(kgPer * v.qty).toFixed(1)} kg`],
        ['Layers', `${liners} liners + ${flutes} flutes`],
      ];
      const spec = `${v.l}×${v.w}×${v.h} ${u}, ${ply} ply`;
      return finishCost(v, lines, info, spec, area > 0 ? '' : 'Enter carton size.');
    },
  },
};
function finishCost(v, lines, info, spec, warn) {
  const sub = sum(lines, l => l[1]);
  const overhead = sub * v.overhead / 100, total = sub + overhead, profit = total * v.profit / 100, sell = total + profit;
  return {
    lines: lines.map(([a, b]) => [a, r2(b)]), info, spec, warn, sub: r2(sub), overhead: r2(overhead), total: r2(total),
    profit: r2(profit), sell: r2(sell), perPc: v.qty ? total / v.qty : 0, pricePerPc: v.qty ? sell / v.qty : 0,
  };
}
const costFields = kind => COST[kind].sections.flatMap(s => s[1]);
function readCost(kind, f) {
  const v = readForm(f, costFields(kind));
  costFields(kind).forEach(x => { if (x.type === 'number' && v[x.k] == null) v[x.k] = 0; });
  return v;
}
function costResultHTML(r) {
  const row = (a, b, cls = '') => `<div class="${cls}"><span>${a}</span><b>${b}</b></div>`;
  return `${r.warn ? `<div class="alert warn"><span class="dot"></span>${esc(r.warn)}</div>` : ''}
    <div class="totals">${r.info.map(([a, b]) => row(esc(a), esc(b))).join('')}</div>
    <div class="totals" style="margin-top:12px">${r.lines.filter(l => l[1]).map(([a, b]) => row(esc(a), fmtN(b))).join('')}
      ${row('Subtotal', fmtN(r.sub))}${r.overhead ? row('Overheads', fmtN(r.overhead)) : ''}
      ${row('Total cost', money(r.total), 'grand')}${row('Cost per piece', fmtN(r.perPc))}
      ${row('Profit', fmtN(r.profit))}${row('Selling price (total)', money(r.sell), 'grand')}
      ${row('Price per piece', `<span class="up">${cur()} ${fmtN(r.pricePerPc)}</span>`, 'grand')}</div>`;
}
function recalcCost(kind) {
  const f = $('#mform');
  if (!f || !$('#costRes')) return;
  $('#costRes').innerHTML = costResultHTML(COST[kind].calc(readCost(kind, f)));
}
function openCostingForm(kind, id = null, copy = false) {
  if (!S.patch) return toast('Run supabase-update.sql in Supabase first to save costings.', 'err');
  const C = COST[kind], ex = id ? S.costings.find(x => x.id === id) : null;
  const vals = ex ? { ...ex.inputs, name: copy ? ex.name + ' (copy)' : ex.name, contact_id: ex.contact_id, qty: +ex.qty } : {};
  const body = `<div class="cost-wrap"><div>${C.sections.map(([title, fields]) => `<h4 class="cost-h">${esc(title)}</h4>
      <div class="form-grid">${fields.map(fl => fieldHTML(typeof fl.options === 'function' ? { ...fl, options: fl.options() } : fl, vals[fl.k])).join('')}</div>`).join('')}</div>
    <div class="cost-side"><h4 class="cost-h">Result</h4><div id="costRes"></div></div></div>`;
  openModal(`${ex && !copy ? 'Edit' : 'New'} ${C.label}`, body, {
    wide: true, submit: 'Save costing',
    after: f => { f.addEventListener('input', () => recalcCost(kind)); f.addEventListener('change', () => recalcCost(kind)); recalcCost(kind); },
    onSubmit: async f => {
      const v = readCost(kind, f), r = C.calc(v);
      const { name, contact_id: contactId, qty, ...inputs } = v;
      const row = { kind, name, contact_id: contactId || null, qty, inputs: { ...inputs, qty }, result: { total: r.total, perPc: r2(r.perPc), sell: r.sell, pricePerPc: r2(r.pricePerPc), spec: r.spec } };
      if (ex && !copy) await upd('costings', ex.id, row); else await ins('costings', row);
      await refresh(); toast('Costing saved');
    },
  });
}
function costingPage(kind) {
  const C = COST[kind];
  if (!S.patch) return `<div class="card"><div class="alert warn"><span class="dot"></span><div><b>One more step.</b> Run <b>supabase-update.sql</b> in Supabase → SQL Editor, then reload this page to use ${C.label}.</div></div></div>`;
  const list = S.costings.filter(c => c.kind === kind).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return `<div class="toolbar"><span class="muted">${kind === 'pvc'
    ? 'PVC cost = sheet weight × rate per kg ÷ pieces per sheet, plus printing, die, cutting, pasting and overheads.'
    : 'Carton cost = blank size × (liner GSM + flute GSM × take-up) × paper rate, plus conversion, printing and stitching.'}</span><span class="grow"></span>
    <button class="btn primary" onclick="openCostingForm('${kind}')">${ic('plus')} New ${C.short} Costing</button></div>
  <div class="grid g3 mb">${kpi('Saved costings', String(list.length))}${kpi('Total quoted value', money0(sum(list, c => c.result?.sell)))}${kpi('Avg. margin', list.length ? `${Math.round(sum(list, c => c.inputs?.profit) / list.length)}%` : '—')}</div>
  <div class="card"><div class="card-head"><h3>${C.label}s</h3><span class="grow"></span>${searchBox()}</div>
  ${table([
    { h: 'Job', f: c => `<b>${esc(c.name)}</b><div class="muted small">${esc(c.result?.spec || '')}</div>` },
    { h: 'Customer', f: c => esc(byId('contacts', c.contact_id)?.name || '—') },
    { h: 'Qty', r: 1, f: c => fmt0(c.qty) },
    { h: 'Cost / pc', r: 1, f: c => fmtN(c.result?.perPc) },
    { h: 'Price / pc', r: 1, f: c => `<b>${fmtN(c.result?.pricePerPc)}</b>` },
    { h: 'Total price', r: 1, f: c => fmtN(c.result?.sell) },
    { h: '', r: 1, f: c => `<div class="acts">${actBtn('receipt', `costToQuote('${c.id}')`, 'Make quotation')}${actBtn('print', `printCosting('${c.id}')`, 'Print')}${actBtn('copy', `openCostingForm('${kind}','${c.id}',true)`, 'Duplicate')}${actBtn('trash', `deleteCosting('${c.id}')`, 'Delete')}</div>` },
  ], list, { click: c => `openCostingForm('${kind}','${c.id}')`, empty: `No ${C.short.toLowerCase()} costings yet. Click “New ${C.short} Costing”.` })}</div>`;
}
PAGES.pvc = () => costingPage('pvc');
PAGES.carton = () => costingPage('carton');
function costToQuote(id) {
  const c = S.costings.find(x => x.id === id);
  openDocForm('quotation', null, {
    contact_id: c.contact_id, notes: `Based on ${COST[c.kind].short.toLowerCase()} costing: ${c.name}`,
    items: [{ product_id: null, description: `${c.name} — ${c.result?.spec || ''}`, qty: +c.qty, price: r2(c.result?.pricePerPc || 0) }],
  });
}
function printCosting(id) {
  const c = S.costings.find(x => x.id === id), C = COST[c.kind];
  const r = C.calc({ ...c.inputs, qty: +c.qty });
  const labels = Object.fromEntries(costFields(c.kind).map(f => [f.k, f.label]));
  const inputs = Object.entries(c.inputs).filter(([k]) => labels[k] && !['qty'].includes(k)).map(([k, v]) => `<tr><td>${esc(labels[k])}</td><td class="r">${esc(v)}</td></tr>`).join('');
  printHTML(`${C.label}`, `<div class="meta"><div><div class="muted">Job</div><b>${esc(c.name)}</b><br>${esc(r.spec)}<br>Customer: ${esc(byId('contacts', c.contact_id)?.name || '—')}</div><div style="text-align:right">Quantity: <b>${fmt0(c.qty)}</b><br>Date: ${fmtDate(String(c.created_at).slice(0, 10))}</div></div>
    <table><thead><tr><th>Input</th><th class="r">Value</th></tr></thead><tbody>${inputs}</tbody></table>
    <table><thead><tr><th>Calculation</th><th class="r">Value</th></tr></thead><tbody>${r.info.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="r">${esc(b)}</td></tr>`).join('')}</tbody></table>
    <table><thead><tr><th>Cost</th><th class="r">Amount</th></tr></thead><tbody>${r.lines.filter(l => l[1]).map(([a, b]) => `<tr><td>${esc(a)}</td><td class="r">${fmtN(b)}</td></tr>`).join('')}
    ${r.overhead ? `<tr><td>Overheads</td><td class="r">${fmtN(r.overhead)}</td></tr>` : ''}
    <tr class="total"><td>Total cost</td><td class="r">${money(r.total)}</td></tr><tr><td>Cost per piece</td><td class="r">${fmtN(r.perPc)}</td></tr>
    <tr><td>Profit (${+c.inputs.profit}%)</td><td class="r">${fmtN(r.profit)}</td></tr><tr class="grand"><td>Selling price</td><td class="r">${money(r.sell)}</td></tr>
    <tr class="grand"><td>Price per piece</td><td class="r">${cur()} ${fmtN(r.pricePerPc)}</td></tr></tbody></table>`);
}
async function deleteCosting(id) {
  if (!isOwner()) return toast(OWNER_MSG, 'err');
  if (!confirm('Delete this costing?')) return;
  try { await del('costings', id); await refresh(); toast('Costing deleted'); } catch (e) { toast(e.message, 'err'); }
}

/* ===================== Start ===================== */
boot();
