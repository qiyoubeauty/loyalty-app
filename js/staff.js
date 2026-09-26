// Staff app: log in, find/register customers, add stamps, redeem rewards, dashboard, settings.
import * as db from './db.js';
import {
  withDefaults, DEFAULT_SETTINGS, activeRewards, cardSize, rewardName, effectiveCard, rewardStates,
  readyRewards, stampsForVisit, ruleNeedsAmount, dailyLimitCheck, applyStamp, applyRedeem, applyAdjust,
  applyUndo, canUndo, forfeitedBy, newCustomer, normalizePhone, formatPhone, randomId, memberCode, monthKey,
  expiresAt,
} from './logic.js';
import { t, lang, fmtDate, fmtDateTime, fmtMoney, relDay } from './i18n.js';
import {
  icon, esc, $, toast, confirmBox, applyTheme, brandHtml, langSwitchHtml, bindLangSwitch,
  stampGridHtml, initials, registerSW, eventLabel, setHtmlKeepToasts,
} from './ui.js';
import qrcode from './vendor/qrcode.mjs';

const DAY = 864e5;
const app = $('#app');
const S = {
  user: null,
  settings: withDefaults(null),
  authReady: false,
  settingsMissing: false,
  seeded: false,
  customers: [],
  loaded: false,
  denied: false,
  tab: 'customers',
  q: '',
  filter: 'all',
  lapsedDays: 60,
  month: monthKey(Date.now()),
  stats: {},
  draft: null,     // settings being edited
  dirty: false,
  open: null,      // customer sheet state { id, amount, count, events }
};
let dataUnsubs = [];
let statsUnsub = null;
let statsKey = null;

const PRESET_COLORS = ['#e29ab8', '#b69be6', '#f0a487', '#79c2a4', '#86b3e6', '#e0b25a', '#d98c8c'];
const cardBase = () => new URL('./', location.href).href;
const cardLink = id => `${cardBase()}?c=${id}`;

// ─────────────────────────── boot ───────────────────────────
registerSW();

// Settings are public, so the login screen can show the shop brand.
db.watchSettings(s => {
  S.settingsMissing = !s;
  seedSettings();
  S.settings = withDefaults(s);
  if (!S.dirty) S.draft = null;
  applyTheme(S.dirty ? S.draft : S.settings);
  render();
}, err => console.warn(err));

// First staff login on a fresh database: save the default settings once.
function seedSettings() {
  if (S.settingsMissing && S.user && !S.seeded) {
    S.seeded = true;
    db.saveSettings(DEFAULT_SETTINGS).catch(() => { /* not a staff account — ignore */ });
  }
}

db.onAuth(user => {
  S.user = user;
  S.authReady = true;
  seedSettings();
  dataUnsubs.forEach(u => u());
  dataUnsubs = [];
  stopStats();
  S.loaded = false;
  S.denied = false;
  S.customers = [];
  if (user) {
    dataUnsubs.push(db.watchCustomers(list => {
      S.customers = list;
      S.loaded = true;
      render();
      if (S.open) renderCustomer();
    }, onDataError));
  }
  render(true);
});

addEventListener('online', () => render());
addEventListener('offline', () => render());
addEventListener('beforeunload', e => { if (S.dirty) e.preventDefault(); });

function onDataError(err) {
  if (err?.code === 'permission-denied') {
    S.denied = true;
    render(true);
  } else {
    toast(t('error', { msg: err?.message || err }), { type: 'err' });
  }
}

// ─────────────────────────── render root ───────────────────────────
let shellFor = '';

function render(full = false) {
  if (!S.authReady) { app.innerHTML = '<div class="spin"></div>'; return; }
  if (!S.user) return renderLogin();
  if (S.denied) return renderDenied();
  const key = `${S.tab}|${lang}`;
  if (full || shellFor !== key || !$('#view')) {
    shellFor = key;
    app.innerHTML = `
      <div class="wrap wide staff-main">
        <header class="topbar"><div id="brand" style="flex:1;min-width:0"></div>${langSwitchHtml()}</header>
        <div id="banner"></div>
        <main id="view"></main>
      </div>
      <nav class="bottom-nav" aria-label="Sections">
        ${navBtn('customers', icon.users, t('customers'))}
        ${navBtn('dashboard', icon.chart, t('dashboard'))}
        ${navBtn('settings', icon.gear, t('settings'))}
      </nav>`;
    renderView(true);
  } else {
    renderView(false);
  }
  $('#brand').innerHTML = brandHtml(S.settings, `${t('staff')} · ${S.user.email}`);
  $('#banner').innerHTML = bannerHtml();
}

function navBtn(tab, ic, label) {
  return `<button type="button" data-tab="${tab}" ${S.tab === tab ? 'aria-current="page"' : ''}>${ic}<span>${esc(label)}</span></button>`;
}

function bannerHtml() {
  let h = '';
  if (db.mode === 'demo') h += `<div class="notice demo" style="margin-bottom:12px">${icon.info}<span>${esc(t('demoBanner'))}</span></div>`;
  if (!navigator.onLine) h += `<div class="notice warn" style="margin-bottom:12px">${icon.alert}<span>${esc(t('offlineStaff'))}</span></div>`;
  return h;
}

function renderView(full) {
  if (S.tab === 'customers') viewCustomers(full);
  else if (S.tab === 'dashboard') viewDashboard();
  else viewSettings(full);
}

bindLangSwitch(app, () => { render(true); if (S.open) renderCustomer(); });

app.addEventListener('click', async e => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    if (S.tab === 'settings' && S.dirty && tabBtn.dataset.tab !== 'settings') {
      if (!await confirmBox(t('unsaved') + '\n' + t('cancel') + '?', { ok: t('close') })) return;
      discardDraft();
    }
    S.tab = tabBtn.dataset.tab;
    if (S.tab !== 'dashboard') stopStats();
    render(true);
    scrollTo({ top: 0 });
  }
});

// ─────────────────────────── login ───────────────────────────
function renderLogin() {
  shellFor = '';
  app.innerHTML = `
    <div class="wrap" style="max-width:440px">
      <header class="topbar">${brandHtml(S.settings, t('staff'))}${langSwitchHtml()}</header>
      <form class="panel" id="loginForm" style="margin-top:24px">
        <h2>${icon.sparkle} ${esc(t('staffLogin'))}</h2>
        ${db.mode === 'demo' ? `<div class="notice demo" style="margin-bottom:14px">${icon.info}<span>${esc(t('demoLogin'))}</span></div>` : ''}
        <label class="field"><span>${esc(t('email'))}</span><input class="input" name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>${esc(t('password'))}</span><input class="input" name="password" type="password" autocomplete="current-password" ${db.mode === 'demo' ? '' : 'required'}></label>
        <p class="notice danger" id="loginErr" hidden></p>
        <button class="btn primary big block" type="submit">${esc(t('signIn'))}</button>
      </form>
    </div>`;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await db.signIn(f.email.value, f.password.value);
    } catch (err) {
      const box = $('#loginErr');
      box.hidden = false;
      box.textContent = /invalid|wrong|not-found|credential/i.test(err.code || '') ? t('loginFailed') : t('error', { msg: err.code || err.message });
      btn.disabled = false;
    }
  });
}

function renderDenied() {
  shellFor = '';
  app.innerHTML = `
    <div class="wrap" style="max-width:440px">
      <header class="topbar">${brandHtml(S.settings, t('staff'))}${langSwitchHtml()}</header>
      <div class="panel" style="margin-top:24px">
        <div class="notice danger">${icon.alert}<span>${esc(t('notStaff'))}</span></div>
        <p class="muted small">${esc(S.user.email)}</p>
        <button class="btn block" id="outBtn">${icon.logout} ${esc(t('signOut'))}</button>
      </div>
    </div>`;
  $('#outBtn').onclick = () => db.signOut();
}

// ─────────────────────────── helpers ───────────────────────────
async function run(fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    const m = err?.message || String(err);
    if (m === 'undo-expired') toast(t('undoExpired'), { type: 'err' });
    else if (!navigator.onLine || err?.code === 'unavailable') toast(t('offlineStaff'), { type: 'err' });
    else toast(t('error', { msg: err?.code || m }), { type: 'err' });
    return false;
  }
}

function openSheet(id, html) {
  let d = document.getElementById(id);
  if (!d) {
    d = document.createElement('dialog');
    d.id = id;
    d.className = 'sheet';
    document.body.append(d);
    // Tap on the dim backdrop closes the sheet.
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  }
  setHtmlKeepToasts(d, html);
  if (!d.open) d.showModal();
  return d;
}

function sheetHead(title, sub = '', avatar = '') {
  return `<div class="sheet-head">${avatar}
    <div style="flex:1;min-width:0"><h2>${esc(title)}</h2>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>
    <button type="button" class="btn icon ghost" data-close aria-label="${esc(t('close'))}">${icon.x}</button></div>`;
}

function lastSeen(c) { return c.lastVisitAt || c.createdAt || 0; }

function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function sendCardWa(c) {
  window.open(waLink(c.phone, t('waMessage', { name: c.name.split(' ')[0], shop: S.settings.shop.name, link: cardLink(c.id) })), '_blank', 'noopener');
}

function remindWa(c) {
  const card = effectiveCard(c, S.settings);
  window.open(waLink(c.phone, t('waRemind', { name: c.name.split(' ')[0], shop: S.settings.shop.name, n: card.stamps, link: cardLink(c.id) })), '_blank', 'noopener');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'), { type: 'ok' });
  } catch {
    prompt(t('copyLink'), text);
  }
}

function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function showQr(c) {
  const d = openSheet('qrSheet', `${sheetHead(c.name, esc(t('showQr')))}
    <div class="sheet-body center">
      <div class="qr-box">${qrSvg(cardLink(c.id))}</div>
      <p class="muted">${esc(t('scanQr'))}</p>
    </div>`);
  d.onclick = e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); };
}

// ─────────────────────────── customers tab ───────────────────────────
function matches(c, q) {
  if (!q) return true;
  const s = q.toLowerCase().trim();
  if (c.name.toLowerCase().includes(s)) return true;
  if (memberCode(c.id) === s.toUpperCase()) return true;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3) {
    const local = '0' + c.phone.slice(S.settings.countryCode.length);
    if (c.phone.includes(digits) || local.includes(digits)) return true;
  }
  return false;
}

function isLapsed(c, now = Date.now()) {
  return now - lastSeen(c) > S.lapsedDays * DAY;
}

function viewCustomers(full) {
  const v = $('#view');
  if (full || !$('#q', v)) {
    v.innerHTML = `
      <div class="toolbar">
        <label class="search">${icon.search}<span class="sr-only">${esc(t('search'))}</span>
          <input id="q" class="input lg" type="search" autocomplete="off" enterkeyhint="search" placeholder="${esc(t('search'))}" value="${esc(S.q)}"></label>
        <button type="button" class="btn primary big" data-act="new">${icon.plus}<span class="hide-sm">${esc(t('newCustomer'))}</span></button>
      </div>
      <div class="filters" id="filters"></div>
      <div class="panel" style="margin-top:8px"><ul class="rows cust-list" id="list"></ul></div>`;
    $('#q').addEventListener('input', e => { S.q = e.target.value; viewCustomers(false); });
    v.onclick = onCustomersClick;
  }
  if (!S.loaded) { $('#list').innerHTML = '<div class="spin"></div>'; return; }

  const now = Date.now();
  const st = S.settings;
  const size = cardSize(st);
  const readyCount = S.customers.filter(c => readyRewards(c, st, now).length).length;
  const lapsedCount = S.customers.filter(c => isLapsed(c, now)).length;
  $('#filters').innerHTML = [
    ['all', `${t('all')} · ${S.customers.length}`],
    ['ready', `🎁 ${t('rewardReady')} · ${readyCount}`],
    ['lapsed', `${t('lapsed', { n: S.lapsedDays })} · ${lapsedCount}`],
  ].map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${S.filter === k}">${esc(label)}</button>`).join('');

  let list = S.customers.filter(c => matches(c, S.q));
  if (S.filter === 'ready') list = list.filter(c => readyRewards(c, st, now).length);
  if (S.filter === 'lapsed') list = list.filter(c => isLapsed(c, now));
  list.sort((a, b) => lastSeen(b) - lastSeen(a));

  if (!list.length) {
    const none = !S.customers.length;
    $('#list').innerHTML = `<li class="empty">${icon.heart}<div>${esc(none ? t('noCustomers') : t('noResults'))}</div>
      ${!none && S.q ? `<button type="button" class="btn soft mt" data-act="new">${icon.plus} ${esc(t('newCustomer'))}</button>` : ''}</li>`;
    return;
  }
  $('#list').innerHTML = list.slice(0, 150).map(c => {
    const card = effectiveCard(c, st, now);
    const ready = readyRewards(c, st, now).length;
    return `<li class="row" data-open="${c.id}">
      <div class="avatar">${esc(initials(c.name))}</div>
      <div class="grow"><div class="title">${esc(c.name)}</div>
        <div class="sub">${esc(formatPhone(c.phone, st.countryCode))} · ${esc(relDay(c.lastVisitAt, now))}</div></div>
      ${ready ? `<span class="chip gold">${icon.gift}</span>` : ''}
      <span class="chip accent">${card.stamps}/${size}</span>
    </li>`;
  }).join('');
}

function onCustomersClick(e) {
  const f = e.target.closest('[data-filter]');
  if (f) { S.filter = f.dataset.filter; viewCustomers(false); return; }
  if (e.target.closest('[data-act="new"]')) { openNewCustomer(); return; }
  const row = e.target.closest('[data-open]');
  if (row) openCustomer(row.dataset.open);
}

// ---------- new customer ----------
function openNewCustomer() {
  const q = S.q.trim();
  const looksPhone = /^[\d\s+\-()]{6,}$/.test(q);
  const needs = ruleNeedsAmount(S.settings);
  const d = openSheet('newSheet', `${sheetHead(t('newCustomer'))}
    <form id="newForm" class="sheet-body" novalidate>
      <label class="field"><span>${esc(t('name'))}</span><input class="input lg" name="name" autocomplete="off" value="${looksPhone ? '' : esc(q)}"></label>
      <label class="field"><span>${esc(t('phone'))}</span><input class="input lg" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="012-345 6789" value="${looksPhone ? esc(q) : ''}"></label>
      <label class="field"><span>${esc(t('note'))}</span><input class="input" name="note" placeholder="${esc(t('notePh'))}"></label>
      <label class="check"><input type="checkbox" name="consent"><span>${esc(t('consent'))}</span></label>
      <label class="check"><input type="checkbox" name="first" checked><span>${esc(t('giveFirstStamp'))}</span></label>
      <label class="field" id="firstAmt"><span>${esc(t(needs ? 'amountSpent' : 'amountOptional', { cur: S.settings.currency }))}</span>
        <div class="input-affix"><span class="affix">${esc(S.settings.currency)}</span><input class="input" name="amount" type="number" inputmode="decimal" min="0" step="0.01"></div></label>
      <p class="notice danger" id="newErr" hidden></p>
    </form>
    <div class="sheet-foot btn-row">
      <button type="button" class="btn" data-close>${esc(t('cancel'))}</button>
      <button type="submit" form="newForm" class="btn primary">${icon.sparkle} ${esc(t('create'))}</button>
    </div>`);
  const form = $('#newForm', d);
  form.first.onchange = () => { $('#firstAmt', d).hidden = !form.first.checked; };
  d.onclick = e => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
    const open = e.target.closest('[data-open-existing]');
    if (open) { d.close(); openCustomer(open.dataset.openExisting); }
  };
  setTimeout(() => (looksPhone ? form.name : q ? form.phone : form.name).focus(), 50);

  form.onsubmit = async e => {
    e.preventDefault();
    const err = $('#newErr', d);
    const fail = html => { err.hidden = false; err.innerHTML = html; };
    const name = form.name.value.trim();
    const phone = normalizePhone(form.phone.value, S.settings.countryCode);
    if (!name) return fail(esc(t('nameRequired')));
    if (phone.length < 9 || phone.length > 15) return fail(esc(t('phoneInvalid')));
    if (!form.consent.checked) return fail(esc(t('consentRequired')));
    const dup = S.customers.find(c => c.phone === phone);
    if (dup) {
      return fail(`${esc(t('phoneExists', { name: dup.name }))} <button type="button" class="btn sm soft" data-open-existing="${dup.id}">${esc(t('openIt'))}</button>`);
    }
    const amount = form.amount.value;
    if (form.first.checked && needs && amount === '') return fail(esc(t('amountSpent', { cur: S.settings.currency })));
    d.querySelector('button[type=submit]').disabled = true;

    const id = randomId();
    const now = Date.now();
    const joinId = randomId(12);
    const ok = await run(async () => {
      await db.addCustomer(id, newCustomer({ name, phone, note: form.note.value }, now),
        { id: joinId, data: { type: 'join', at: now, by: S.user.email } });
      if (form.first.checked) await stampNow(id, stampsForVisit(S.settings, amount), amount, true);
    });
    if (!ok) { d.querySelector('button[type=submit]').disabled = false; return; }
    S.q = '';
    showCreated(d, { id, name, phone });
  };
}

function showCreated(d, c) {
  setHtmlKeepToasts(d, `${sheetHead(t('cardCreated', { name: c.name }))}
    <div class="sheet-body center">
      <div class="hero" style="padding:12px 0 4px"><div class="art">${icon.check}</div>
        <h1>${esc(t('cardCreated', { name: c.name.split(' ')[0] }))}</h1><p>${esc(t('sendNow'))}</p></div>
      <div class="btn-row mt">
        <button type="button" class="btn wa big" data-x="wa">${icon.whatsapp} ${esc(t('whatsapp'))}</button>
      </div>
      <div class="btn-row mt">
        <button type="button" class="btn soft" data-x="qr">${icon.qr} ${esc(t('showQr'))}</button>
        <button type="button" class="btn soft" data-x="copy">${icon.copy} ${esc(t('copyLink'))}</button>
      </div>
    </div>
    <div class="sheet-foot btn-row">
      <button type="button" class="btn" data-close>${esc(t('done'))}</button>
      <button type="button" class="btn primary" data-x="open">${esc(t('openCustomer'))}</button>
    </div>`);
  d.onclick = e => {
    if (e.target === d || e.target.closest('[data-close]')) return d.close();
    const x = e.target.closest('[data-x]')?.dataset.x;
    if (x === 'wa') sendCardWa(c);
    if (x === 'qr') showQr(c);
    if (x === 'copy') copyText(cardLink(c.id));
    if (x === 'open') { d.close(); openCustomer(c.id); }
  };
}

// ---------- stamping / redeeming ----------
async function stampNow(cid, count, amount, silent = false) {
  const eid = randomId(12);
  const ok = await run(() => db.transact(cid, ({ customer }) => {
    const r = applyStamp(customer, S.settings, { count, amount, now: Date.now(), eventId: eid, by: S.user.email });
    return { patch: r.patch, newEvent: { id: eid, data: r.event }, stats: r.stats };
  }));
  if (ok && !silent) {
    const msg = count === 0 ? t('visitLogged') : count === 1 ? t('stampAdded') : t('stampsAdded', { n: count });
    toast(msg, { type: 'ok', action: t('undo'), onAction: () => undoEvent(cid, eid) });
  }
  return ok;
}

async function undoEvent(cid, eid) {
  const ok = await run(() => db.transact(cid, ({ customer, event }) => {
    const r = applyUndo(customer, event, Date.now());
    return { patch: r.patch, eventPatch: r.eventPatch, stats: r.stats, statsMonth: r.statsMonth };
  }, { eventId: eid }));
  if (ok) toast(t('undone'));
}

async function redeem(c, rid) {
  const reward = activeRewards(S.settings).find(r => r.id === rid);
  if (!reward) return;
  let msg = t('redeemConfirm', { reward: rewardName(reward, lang), name: c.name });
  const lost = forfeitedBy(c, S.settings, rid);
  if (lost.length) msg += '\n\n' + t('forfeitWarn', { list: lost.map(r => rewardName(r, lang)).join(', ') });
  if (!await confirmBox(msg, { ok: t('redeem') })) return;
  const eid = randomId(12);
  const ok = await run(() => db.transact(c.id, ({ customer }) => {
    const r = applyRedeem(customer, S.settings, rid, { now: Date.now(), eventId: eid, by: S.user.email });
    return { patch: r.patch, newEvent: { id: eid, data: r.event }, stats: r.stats };
  }));
  if (ok) toast(t('redeemed'), { type: 'ok', action: t('undo'), onAction: () => undoEvent(c.id, eid) });
}

// ---------- customer sheet ----------
function openCustomer(id) {
  if (S.open?.unsub) S.open.unsub();
  S.open = { id, amount: '', count: null, events: [], unsub: null };
  S.open.unsub = db.watchEvents(id, list => {
    if (S.open?.id !== id) return;
    S.open.events = list;
    renderHistory();
  }, 30, onDataError);
  renderCustomer();
  const d = $('#custSheet');
  d.addEventListener('close', () => {
    S.open?.unsub?.();
    S.open = null;
  }, { once: true });
}

function currentCustomer() {
  return S.open && S.customers.find(c => c.id === S.open.id);
}

function renderCustomer() {
  const c = currentCustomer();
  const existing = $('#custSheet');
  if (!c) { if (existing?.open) existing.close(); return; }
  const st = S.settings;
  const now = Date.now();
  const size = cardSize(st);
  const card = effectiveCard(c, st, now);
  const states = rewardStates(c, st, now);
  const milestones = new Map(states.map(x => [Number(x.reward.stamps), x.state]));
  const exp = card.expiresAt;
  const needs = ruleNeedsAmount(st);
  const scrollTop = existing?.querySelector('.sheet-body')?.scrollTop || 0;

  const d = openSheet('custSheet', `
    ${sheetHead(c.name, `${esc(formatPhone(c.phone, st.countryCode))} · ${esc(memberCode(c.id))}`, `<div class="avatar">${esc(initials(c.name))}</div>`)}
    <div class="sheet-body">
      <div class="stamp-card">
        <div class="card-head">
          <div><div class="card-kicker">${esc(t('cardNo', { n: c.cycle || 1 }))}</div>
            <div class="card-name">${esc(t('stampsOf', { n: card.stamps, total: size }))}</div></div>
          ${exp ? `<span class="chip">${icon.clock} ${esc(fmtDate(exp))}</span>` : ''}
        </div>
        ${stampGridHtml(card.stamps, size, milestones, { small: size > 10 })}
        ${card.stamps > size ? `<p class="small" style="margin:12px 0 0;font-weight:700">+${card.stamps - size}</p>` : ''}
      </div>
      ${card.expired ? `<div class="notice warn mt">${icon.clock}<span>${esc(t('expiredNote'))}</span></div>` : ''}

      <div class="panel">
        <label class="field"><span>${esc(t(needs ? 'amountSpent' : 'amountOptional', { cur: st.currency }))}</span>
          <div class="input-affix"><span class="affix">${esc(st.currency)}</span>
          <input class="input lg" id="amt" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(S.open.amount)}"></div></label>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
          <span class="small muted" id="earnHint"></span>
          <div class="stepper">
            <button type="button" class="btn icon soft" data-act="dec" aria-label="-1">${icon.minus}</button>
            <span class="val" id="countVal"></span>
            <button type="button" class="btn icon soft" data-act="inc" aria-label="+1">${icon.plus}</button>
          </div>
        </div>
        <button type="button" class="btn primary big block" data-act="stamp" id="stampBtn"></button>
      </div>

      <div class="panel">
        <h2>${icon.gift} ${esc(t('rewards'))}</h2>
        <ul class="rows">${states.map(x => `
          <li class="row">
            <div class="icon-bubble ${x.state === 'ready' ? 'gold' : x.state === 'claimed' ? 'ok' : 'muted'}">${x.state === 'claimed' ? icon.check : icon.gift}</div>
            <div class="grow"><div class="title">${esc(rewardName(x.reward, lang))}</div>
              <div class="sub">${esc(t('stampsNeeded', { n: x.reward.stamps }))}</div></div>
            ${x.state === 'ready' ? `<button type="button" class="btn gold sm" data-act="redeem" data-rid="${esc(x.reward.id)}">${esc(t('redeem'))}</button>`
              : x.state === 'claimed' ? `<span class="chip ok">${esc(t('claimed'))}</span>`
              : `<span class="chip">${esc(t('toGo', { n: x.remaining }))}</span>`}
          </li>`).join('')}</ul>
      </div>

      <div class="panel">
        <h2>${icon.heart} ${esc(t('shareCard'))}</h2>
        <div class="btn-row">
          <button type="button" class="btn wa" data-act="wa">${icon.whatsapp} ${esc(t('whatsapp'))}</button>
          <button type="button" class="btn soft" data-act="qr">${icon.qr} QR</button>
          <button type="button" class="btn soft" data-act="copy">${icon.copy} ${esc(t('copyLink'))}</button>
        </div>
      </div>

      <div class="panel">
        <h2>${icon.clock} ${esc(t('history'))}</h2>
        <ul class="rows" id="hist"></ul>
      </div>

      <div class="panel">
        <ul class="rows">
          ${c.note ? `<li class="row"><div class="grow"><div class="sub">${esc(t('note'))}</div><div>${esc(c.note)}</div></div></li>` : ''}
          <li class="row"><div class="grow"><div class="sub">${esc(t('totalVisits'))}</div><b>${c.totalVisits || 0}</b></div>
            <div class="grow"><div class="sub">${esc(t('totalSpent'))}</div><b>${esc(fmtMoney(c.totalSpent, st.currency))}</b></div>
            <div class="grow"><div class="sub">${esc(t('rewardsRedeemed'))}</div><b>${c.totalRedeemed || 0}</b></div></li>
          <li class="row"><div class="grow"><div class="sub">${esc(t('lastVisit'))}</div>${esc(c.lastVisitAt ? fmtDate(c.lastVisitAt) : t('never'))}</div>
            <div class="grow"><div class="sub">${esc(t('memberSince', { date: '' }).trim())}</div>${esc(fmtDate(c.createdAt))}</div></li>
        </ul>
        <div class="btn-row mt">
          <button type="button" class="btn soft sm" data-act="edit">${icon.edit} ${esc(t('edit'))}</button>
          <button type="button" class="btn soft sm" data-act="adjust">${icon.sparkle} ${esc(t('adjustStamps'))}</button>
          <button type="button" class="btn danger sm" data-act="delete">${icon.trash} ${esc(t('delete'))}</button>
        </div>
      </div>
    </div>`);

  d.querySelector('.sheet-body').scrollTop = scrollTop;
  updateStampControls();
  renderHistory();
  $('#amt', d).addEventListener('input', e => {
    S.open.amount = e.target.value;
    S.open.count = null;
    updateStampControls();
  });
  d.onclick = onCustomerClick;
}

function currentCount() {
  const needs = ruleNeedsAmount(S.settings);
  return S.open.count ?? (needs ? stampsForVisit(S.settings, S.open.amount) : 1);
}

function updateStampControls() {
  const st = S.settings;
  const count = currentCount();
  const r = st.rule;
  let hint = '';
  if (r.mode === 'minSpend' && S.open.amount !== '' && Number(S.open.amount) < Number(r.minSpend)) {
    hint = t('belowMin', { cur: st.currency, n: r.minSpend });
  } else if (ruleNeedsAmount(st)) {
    hint = S.open.amount === '' ? t(r.mode === 'minSpend' ? 'howMinSpend' : 'howPerAmount', { cur: st.currency, n: r.mode === 'minSpend' ? r.minSpend : r.perAmount }) : t('earns', { n: count });
  } else {
    hint = t('howVisit');
  }
  $('#earnHint').textContent = hint;
  $('#countVal').textContent = count;
  const btn = $('#stampBtn');
  const waiting = ruleNeedsAmount(st) && S.open.amount === '';
  btn.innerHTML = count === 0 && !waiting ? `${icon.check} ${esc(t('logVisit'))}`
    : `${icon.flower} ${esc(count <= 1 ? t('addStamp') : t('addStamps', { n: count }))}`;
  btn.disabled = waiting;
}

function renderHistory() {
  const box = $('#hist');
  const c = currentCustomer();
  if (!box || !c) return;
  const st = S.settings;
  const now = Date.now();
  if (!S.open.events.length) { box.innerHTML = `<li class="empty">${esc(t('noHistory'))}</li>`; return; }
  box.innerHTML = S.open.events.map(e => {
    const { ic, cls, title } = eventLabel(e);
    const sub = [fmtDateTime(e.at), e.amount ? fmtMoney(e.amount, st.currency) : '', e.by ? t('by', { who: e.by.split('@')[0] }) : '']
      .filter(Boolean).join(' · ');
    const undo = canUndo(c, e, now) ? `<button type="button" class="btn soft sm" data-act="undo" data-eid="${e.id}">${icon.undo} ${esc(t('undo'))}</button>` : '';
    return `<li class="row" style="${e.undone ? 'opacity:.45;text-decoration:line-through' : ''}">
      <div class="icon-bubble ${cls}">${ic}</div>
      <div class="grow"><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div>${undo}</li>`;
  }).join('');
}

async function onCustomerClick(e) {
  const d = $('#custSheet');
  if (e.target === d || e.target.closest('[data-close]')) return d.close();
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const c = currentCustomer();
  if (!c) return;
  const act = btn.dataset.act;
  if (act === 'inc' || act === 'dec') {
    S.open.count = Math.max(0, Math.min(50, currentCount() + (act === 'inc' ? 1 : -1)));
    updateStampControls();
  } else if (act === 'stamp') {
    const count = currentCount();
    const lim = dailyLimitCheck(c, S.settings, count);
    if (count > 0 && lim.over && !await confirmBox(t('alreadyToday', { n: lim.today, max: lim.max }), { ok: t('addStamp') })) return;
    btn.disabled = true;
    if (await stampNow(c.id, count, S.open.amount)) {
      S.open.amount = '';
      S.open.count = null;
      renderCustomer();
      popLastStamp();
    } else btn.disabled = false;
  } else if (act === 'redeem') redeem(c, btn.dataset.rid);
  else if (act === 'undo') undoEvent(c.id, btn.dataset.eid);
  else if (act === 'wa') sendCardWa(c);
  else if (act === 'qr') showQr(c);
  else if (act === 'copy') copyText(cardLink(c.id));
  else if (act === 'edit') editCustomer(c);
  else if (act === 'adjust') adjustStamps(c);
  else if (act === 'delete') {
    if (!await confirmBox(t('deleteConfirm', { name: c.name }), { ok: t('delete'), danger: true })) return;
    d.close();
    if (await run(() => db.deleteCustomer(c.id))) toast(t('deleted'));
  }
}

// Little celebration: animate the newest stamp after the card re-renders.
function popLastStamp() {
  requestAnimationFrame(() => {
    const filled = document.querySelectorAll('#custSheet .stamp.filled:not(.claimed)');
    filled[filled.length - 1]?.classList.add('pop');
  });
}

function editCustomer(c) {
  const d = openSheet('editSheet', `${sheetHead(t('editCustomer'))}
    <form id="editForm" class="sheet-body" novalidate>
      <label class="field"><span>${esc(t('name'))}</span><input class="input lg" name="name" value="${esc(c.name)}"></label>
      <label class="field"><span>${esc(t('phone'))}</span><input class="input lg" name="phone" type="tel" inputmode="tel" value="${esc(formatPhone(c.phone, S.settings.countryCode))}"></label>
      <label class="field"><span>${esc(t('note'))}</span><input class="input" name="note" value="${esc(c.note || '')}" placeholder="${esc(t('notePh'))}"></label>
      <p class="notice danger" id="editErr" hidden></p>
    </form>
    <div class="sheet-foot btn-row">
      <button type="button" class="btn" data-close>${esc(t('cancel'))}</button>
      <button type="submit" form="editForm" class="btn primary">${esc(t('save'))}</button>
    </div>`);
  d.onclick = e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); };
  const form = $('#editForm', d);
  form.onsubmit = async e => {
    e.preventDefault();
    const err = $('#editErr', d);
    const name = form.name.value.trim();
    const phone = normalizePhone(form.phone.value, S.settings.countryCode);
    if (!name) { err.hidden = false; err.textContent = t('nameRequired'); return; }
    if (phone.length < 9 || phone.length > 15) { err.hidden = false; err.textContent = t('phoneInvalid'); return; }
    const dup = S.customers.find(x => x.phone === phone && x.id !== c.id);
    if (dup) { err.hidden = false; err.textContent = t('phoneExists', { name: dup.name }); return; }
    if (await run(() => db.updateCustomer(c.id, { name, phone, note: form.note.value.trim() }))) {
      d.close();
      toast(t('saved'), { type: 'ok' });
    }
  };
}

function adjustStamps(c) {
  const card = effectiveCard(c, S.settings);
  const d = openSheet('adjSheet', `${sheetHead(t('adjustStamps'), esc(c.name))}
    <form id="adjForm" class="sheet-body">
      <label class="field"><span>${esc(t('adjustTo'))}</span><input class="input lg" name="n" type="number" inputmode="numeric" min="0" max="999" value="${card.stamps}"></label>
      <label class="field"><span>${esc(t('reason'))}</span><input class="input" name="reason"></label>
    </form>
    <div class="sheet-foot btn-row">
      <button type="button" class="btn" data-close>${esc(t('cancel'))}</button>
      <button type="submit" form="adjForm" class="btn primary">${esc(t('save'))}</button>
    </div>`);
  d.onclick = e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); };
  const form = $('#adjForm', d);
  form.onsubmit = async e => {
    e.preventDefault();
    const eid = randomId(12);
    const ok = await run(() => db.transact(c.id, ({ customer }) => {
      const r = applyAdjust(customer, S.settings, form.n.value, { now: Date.now(), eventId: eid, by: S.user.email, reason: form.reason.value.trim() });
      return { patch: r.patch, newEvent: { id: eid, data: r.event }, stats: r.stats };
    }));
    if (ok) { d.close(); toast(t('saved'), { type: 'ok', action: t('undo'), onAction: () => undoEvent(c.id, eid) }); }
  };
}

// ─────────────────────────── dashboard tab ───────────────────────────
function stopStats() {
  statsUnsub?.();
  statsUnsub = null;
  statsKey = null;
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1).getTime());
}

function viewDashboard() {
  if (statsKey !== S.month) {
    stopStats();
    statsKey = S.month;
    S.stats = {};
    statsUnsub = db.watchStats(S.month, s => { S.stats = s || {}; if (S.tab === 'dashboard') viewDashboard(); }, onDataError);
  }
  const v = $('#view');
  const st = S.settings;
  const now = Date.now();
  const [y, m] = S.month.split('-').map(Number);
  const isCurrent = S.month === monthKey(now);
  const s = S.stats;
  const waiting = S.customers.map(c => ({ c, ready: readyRewards(c, st, now) })).filter(x => x.ready.length)
    .sort((a, b) => lastSeen(b.c) - lastSeen(a.c));
  const top = [...S.customers].sort((a, b) => (b.totalVisits || 0) - (a.totalVisits || 0)).slice(0, 8);
  const lapsed = S.customers.filter(c => isLapsed(c, now)).sort((a, b) => lastSeen(a) - lastSeen(b)).slice(0, 30);
  const rowOf = (c, right) => `<li class="row" data-open="${c.id}" style="cursor:pointer">
      <div class="avatar">${esc(initials(c.name))}</div>
      <div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">${esc(formatPhone(c.phone, st.countryCode))} · ${esc(relDay(c.lastVisitAt, now))}</div></div>${right}</li>`;
  const empty = `<li class="empty">${esc(t('nothing'))}</li>`;

  v.innerHTML = `
    <div class="panel" style="margin-top:0;display:flex;align-items:center;gap:8px;justify-content:space-between">
      <h2 style="margin:0">${icon.chart} ${esc(isCurrent ? t('thisMonth') : '')}</h2>
      <div class="month-nav">
        <button type="button" class="btn icon soft" data-month="-1" aria-label="Previous month">${icon.left}</button>
        <b>${esc(fmtDate(new Date(y, m - 1, 1).getTime(), { month: 'long', year: 'numeric' }))}</b>
        <button type="button" class="btn icon soft" data-month="1" ${isCurrent ? 'disabled' : ''} aria-label="Next month">${icon.right}</button>
      </div>
    </div>
    <div class="kpis mt">
      <div class="kpi"><b>${s.visits || 0}</b><span>${esc(t('visits'))}</span></div>
      <div class="kpi"><b>${s.stamps || 0}</b><span>${esc(t('stampsGiven'))}</span></div>
      <div class="kpi"><b>${s.redemptions || 0}</b><span>${esc(t('rewardsRedeemed'))}</span></div>
      <div class="kpi"><b>${s.newCustomers || 0}</b><span>${esc(t('newCustomers'))}</span></div>
      <div class="kpi"><b>${esc(fmtMoney(s.spent || 0, st.currency))}</b><span>${esc(t('revenue'))}</span></div>
      <div class="kpi"><b>${S.customers.length}</b><span>${esc(t('members'))}</span></div>
    </div>
    <div class="dash-cols">
      <div class="panel"><h2>${icon.gift} ${esc(t('waiting'))}<span class="count">${waiting.length}</span></h2>
        <ul class="rows">${waiting.slice(0, 20).map(x => rowOf(x.c, `<span class="chip gold">${esc(x.ready.map(r => rewardName(r.reward, lang)).join(', '))}</span>`)).join('') || empty}</ul></div>
      <div class="panel"><h2>${icon.star} ${esc(t('topCustomers'))}</h2>
        <ul class="rows">${top.map(c => rowOf(c, `<span class="chip accent">${c.totalVisits || 0} ${esc(t('visits'))}</span>`)).join('') || empty}</ul></div>
      <div class="panel"><h2>${icon.clock} ${esc(t('lapsedHead'))}
          <select class="input" id="lapsedSel" style="width:auto;min-height:34px;padding:4px 10px;margin-left:auto;font-size:.85rem">
            ${[30, 60, 90, 180].map(n => `<option value="${n}" ${n === S.lapsedDays ? 'selected' : ''}>${n}+ ${esc(t('days'))}</option>`).join('')}
          </select></h2>
        <ul class="rows">${lapsed.map(c => rowOf(c, `<button type="button" class="btn wa sm" data-remind="${c.id}">${icon.whatsapp} ${esc(t('remind'))}</button>`)).join('') || empty}</ul></div>
      <div class="panel"><h2>${icon.download} ${esc(t('exportCsv'))}</h2>
        <p class="hint">${esc(t('backupHint'))}</p>
        <button type="button" class="btn soft block" data-export>${icon.download} ${esc(t('exportCsv'))}</button>
        ${db.mode === 'demo' ? `<button type="button" class="btn ghost block mt" data-reset>${esc(t('resetDemo'))}</button>` : ''}
      </div>
    </div>`;

  v.onclick = async e => {
    const mb = e.target.closest('[data-month]');
    if (mb) { S.month = shiftMonth(S.month, Number(mb.dataset.month)); viewDashboard(); return; }
    const rem = e.target.closest('[data-remind]');
    if (rem) { remindWa(S.customers.find(c => c.id === rem.dataset.remind)); return; }
    if (e.target.closest('[data-export]')) return exportCsv();
    if (e.target.closest('[data-reset]')) {
      if (await confirmBox(t('resetDemo') + '?', { danger: true })) { (await import('./db-demo.js')).resetDemo(); }
      return;
    }
    const row = e.target.closest('[data-open]');
    if (row) openCustomer(row.dataset.open);
  };
  $('#lapsedSel').onchange = e => { S.lapsedDays = Number(e.target.value); viewDashboard(); };
}

function exportCsv() {
  const st = S.settings;
  const rows = [['Name', 'Phone', 'Member code', 'Current stamps', 'Card #', 'Rewards claimed on this card', 'Total visits',
    'Total stamps', 'Total rewards', `Total spent (${st.currency})`, 'Last visit', 'Stamps expire', 'Member since', 'Note', 'Card link']];
  const iso = ts => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
  for (const c of [...S.customers].sort((a, b) => a.name.localeCompare(b.name))) {
    const card = effectiveCard(c, st);
    const claimed = card.redeemed.map(id => rewardName(st.rewards.find(r => r.id === id), 'en')).filter(Boolean).join('; ');
    rows.push([c.name, formatPhone(c.phone, st.countryCode), memberCode(c.id), card.stamps, c.cycle || 1, claimed,
      c.totalVisits || 0, c.totalStamps || 0, c.totalRedeemed || 0, c.totalSpent || 0, iso(c.lastVisitAt),
      iso(expiresAt(c, st)), iso(c.createdAt), c.note || '', cardLink(c.id)]);
  }
  const csv = '﻿' + rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `loyalty-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ─────────────────────────── settings tab ───────────────────────────
function discardDraft() {
  S.draft = null;
  S.dirty = false;
  applyTheme(S.settings);
}

function draft() {
  if (!S.draft) S.draft = structuredClone(S.settings);
  return S.draft;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

function markDirty() {
  S.dirty = true;
  const bar = $('#savebar');
  if (bar) bar.hidden = false;
}

function viewSettings(full) {
  const v = $('#view');
  if (!full && $('#settingsForm', v) && S.dirty) return; // don't wipe what staff are typing
  const s = draft();
  const sh = s.shop;
  const r = s.rule;
  const ex = s.expiry;
  const cur = esc(s.currency);
  v.innerHTML = `
  <form id="settingsForm" autocomplete="off">
    <div class="settings-cols">
    <div>
      <div class="panel" style="margin-top:0">
        <h2>${icon.heart} ${esc(t('shopProfile'))}</h2>
        <div class="field"><span>${esc(t('logo'))}</span>
          <div class="logo-edit"><div class="brand-logo">${sh.logo ? `<img src="${esc(sh.logo)}" alt="">` : icon.flower}</div>
            <label class="btn soft sm">${icon.upload} ${esc(t('uploadLogo'))}<input type="file" accept="image/*" id="logoFile" hidden></label>
            ${sh.logo ? `<button type="button" class="btn ghost sm" data-s="nologo">${esc(t('removeLogo'))}</button>` : ''}
          </div></div>
        <label class="field"><span>${esc(t('shopName'))}</span><input class="input" data-k="shop.name" value="${esc(sh.name)}"></label>
        <label class="field"><span>${esc(t('tagline'))}</span><input class="input" data-k="shop.tagline" value="${esc(sh.tagline)}"></label>
        <div class="field"><span>${esc(t('accent'))}</span>
          <div class="color-row">${PRESET_COLORS.map(c => `<button type="button" class="swatch" style="background:${c}" data-color="${c}" aria-pressed="${c === sh.color}" aria-label="${c}"></button>`).join('')}
            <input type="color" id="colorPick" value="${esc(sh.color)}" aria-label="Custom colour"></div></div>
        <label class="field"><span>${esc(t('address'))}</span><textarea class="input" data-k="shop.address" rows="2">${esc(sh.address)}</textarea></label>
        <label class="field"><span>${esc(t('mapsUrl'))}</span><input class="input" data-k="shop.mapsUrl" type="url" inputmode="url" value="${esc(sh.mapsUrl)}" placeholder="https://maps.app.goo.gl/…"><small class="muted small">${esc(t('mapsUrlHint'))}</small></label>
        <label class="field"><span>${esc(t('hours'))}</span><textarea class="input" data-k="shop.hours" rows="4" placeholder="${esc(t('hoursPh'))}">${esc(sh.hours)}</textarea></label>
        <label class="field"><span>${esc(t('shopWhatsapp'))}</span><input class="input" data-k="shop.whatsapp" type="tel" inputmode="tel" value="${esc(sh.whatsapp ? formatPhone(sh.whatsapp, s.countryCode) : '')}" placeholder="012-345 6789"></label>
        <label class="field"><span>${esc(t('instagram'))}</span><input class="input" data-k="shop.instagram" value="${esc(sh.instagram)}" placeholder="yourshop"></label>
      </div>

      <div class="panel">
        <h2>${icon.info} ${esc(t('appLinks'))}</h2>
        <p class="small muted" style="margin:0 0 6px">${esc(t('customerLinkInfo'))}</p>
        <div class="link-box"><code>${esc(cardBase())}?c=…</code></div>
        <p class="small muted" style="margin:12px 0 6px">${esc(t('staffLinkInfo'))}</p>
        <div class="link-box"><code>${esc(new URL('staff.html', cardBase()).href)}</code>
          <button type="button" class="btn soft sm" data-s="copystaff">${icon.copy}</button></div>
        <div class="row mt" style="border:0;padding:0"><div class="grow small muted">${esc(S.user.email)}</div>
          <button type="button" class="btn soft sm" data-s="logout">${icon.logout} ${esc(t('signOut'))}</button></div>
      </div>
    </div>

    <div>
      <div class="panel">
        <h2>${icon.gift} ${esc(t('rewardsTitle'))}</h2>
        <p class="hint">${esc(t('rewardsHint'))}</p>
        ${s.rewards.map((rw, i) => `
          <div class="reward-edit ${rw.active === false ? 'inactive' : ''}">
            <div class="head"><div class="icon-bubble gold">${icon.gift}</div>
              <div class="grow">${esc(rewardName(rw, lang) || '—')}</div>
              <label class="check" style="margin:0"><input type="checkbox" data-r="${i}" data-rk="active" ${rw.active !== false ? 'checked' : ''}><span class="small">${esc(t('active'))}</span></label>
              <button type="button" class="btn icon ghost" data-s="delreward" data-i="${i}" aria-label="${esc(t('delete'))}">${icon.trash}</button></div>
            <label class="field"><span>${esc(t('stampsRequired'))}</span><input class="input" type="number" min="1" max="100" inputmode="numeric" data-r="${i}" data-rk="stamps" value="${esc(rw.stamps)}"></label>
            <label class="field"><span>${esc(t('rewardNameEn'))}</span><input class="input" data-r="${i}" data-rk="name.en" value="${esc(rw.name?.en || '')}"></label>
            <div class="grid2">
              <label class="field" style="margin:0"><span>${esc(t('rewardNameMs'))}</span><input class="input" data-r="${i}" data-rk="name.ms" value="${esc(rw.name?.ms || '')}"></label>
              <label class="field" style="margin:0"><span>${esc(t('rewardNameZh'))}</span><input class="input" data-r="${i}" data-rk="name.zh" value="${esc(rw.name?.zh || '')}"></label>
            </div>
          </div>`).join('')}
        <button type="button" class="btn soft block" data-s="addreward">${icon.plus} ${esc(t('addReward'))}</button>
      </div>

      <div class="panel">
        <h2>${icon.flower} ${esc(t('rulesTitle'))}</h2>
        ${[['visit', 'modeVisit'], ['minSpend', 'modeMinSpend'], ['perAmount', 'modePerAmount']].map(([m, key]) => `
          <label class="radio-card"><input type="radio" name="mode" value="${m}" ${r.mode === m ? 'checked' : ''}>
            <div class="grow"><b>${esc(t(key))}</b>
              ${m === 'minSpend' && r.mode === m ? `<div class="sub-fields"><div class="input-affix"><span class="affix">${cur}</span><input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-k="rule.minSpend" value="${esc(r.minSpend)}" aria-label="${esc(t('minSpend'))}"></div></div>` : ''}
              ${m === 'perAmount' && r.mode === m ? `<div class="sub-fields"><div class="input-affix"><span class="affix">${cur}</span><input class="input" type="number" min="1" step="0.01" inputmode="decimal" data-k="rule.perAmount" value="${esc(r.perAmount)}" aria-label="${esc(t('perAmount'))}"></div></div>` : ''}
            </div></label>`).join('')}
        <div class="grid2 mt">
          <label class="field"><span>${esc(t('maxPerDay'))}</span><input class="input" type="number" min="0" max="50" inputmode="numeric" data-k="rule.maxPerDay" value="${esc(r.maxPerDay)}"></label>
          <label class="field"><span>${esc(t('currency'))}</span><input class="input" data-k="currency" value="${cur}" maxlength="4"></label>
        </div>
      </div>

      <div class="panel">
        <h2>${icon.clock} ${esc(t('expiryTitle'))}</h2>
        <label class="radio-card"><input type="radio" name="expiry" value="off" ${!ex.enabled ? 'checked' : ''}><div class="grow"><b>${esc(t('expiryOff'))}</b></div></label>
        <label class="radio-card"><input type="radio" name="expiry" value="on" ${ex.enabled ? 'checked' : ''}>
          <div class="grow"><b>${esc(t('expiryOn'))}</b>
            ${ex.enabled ? `<div class="sub-fields grid2">
              <input class="input" type="number" min="1" max="999" inputmode="numeric" data-k="expiry.value" value="${esc(ex.value)}">
              <select class="input" data-k="expiry.unit">${['days', 'weeks', 'months'].map(u => `<option value="${u}" ${ex.unit === u ? 'selected' : ''}>${esc(t(u))}</option>`).join('')}</select>
            </div>` : ''}
          </div></label>
      </div>
    </div>
    </div>
    <div class="savebar" id="savebar" ${S.dirty ? '' : 'hidden'}><span>${esc(t('unsaved'))}</span>
      <button type="button" class="btn sm" style="background:rgba(255,255,255,.15);color:#fff" data-s="discard">${esc(t('cancel'))}</button>
      <button type="submit" class="btn primary sm">${esc(t('save'))}</button></div>
  </form>`;

  const form = $('#settingsForm');
  form.addEventListener('input', onSettingsInput);
  form.addEventListener('change', onSettingsChange);
  form.addEventListener('click', onSettingsClick);
  form.addEventListener('submit', e => { e.preventDefault(); saveDraft(); });
}

function numOrStr(el) {
  return el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
}

function onSettingsInput(e) {
  const el = e.target;
  const s = draft();
  if (el.dataset.k) {
    setPath(s, el.dataset.k, numOrStr(el));
    markDirty();
  } else if (el.dataset.r !== undefined) {
    const rw = s.rewards[Number(el.dataset.r)];
    if (el.dataset.rk === 'active') rw.active = el.checked;
    else if (el.dataset.rk === 'stamps') rw.stamps = el.value === '' ? '' : Number(el.value);
    else { rw.name ||= {}; rw.name[el.dataset.rk.split('.')[1]] = el.value; }
    markDirty();
  } else if (el.id === 'colorPick') {
    s.shop.color = el.value;
    applyTheme(s);
    markDirty();
  }
}

async function onSettingsChange(e) {
  const el = e.target;
  const s = draft();
  if (el.name === 'mode') { s.rule.mode = el.value; markDirty(); viewSettings(true); }
  else if (el.name === 'expiry') { s.expiry.enabled = el.value === 'on'; markDirty(); viewSettings(true); }
  else if (el.dataset.rk === 'active') viewSettings(true);
  else if (el.id === 'colorPick') viewSettings(true);
  else if (el.id === 'logoFile' && el.files[0]) {
    try {
      s.shop.logo = await shrinkImage(el.files[0], 192);
      markDirty();
      viewSettings(true);
    } catch { toast(t('error', { msg: 'image' }), { type: 'err' }); }
  }
}

async function onSettingsClick(e) {
  const b = e.target.closest('[data-s], [data-color]');
  if (!b) return;
  const s = draft();
  if (b.dataset.color) { s.shop.color = b.dataset.color; applyTheme(s); markDirty(); viewSettings(true); return; }
  const act = b.dataset.s;
  if (act === 'nologo') { s.shop.logo = ''; markDirty(); viewSettings(true); }
  else if (act === 'addreward') {
    const max = Math.max(0, ...s.rewards.map(r => Number(r.stamps) || 0));
    s.rewards.push({ id: 'r' + randomId(6), stamps: max + 5, active: true, name: { en: '', ms: '', zh: '' } });
    markDirty();
    viewSettings(true);
  } else if (act === 'delreward') {
    const rw = s.rewards[Number(b.dataset.i)];
    if (!await confirmBox(t('deleteRewardConfirm', { reward: rewardName(rw, lang) || '—' }), { ok: t('delete'), danger: true })) return;
    s.rewards.splice(Number(b.dataset.i), 1);
    markDirty();
    viewSettings(true);
  } else if (act === 'discard') { discardDraft(); viewSettings(true); }
  else if (act === 'copystaff') copyText(new URL('staff.html', cardBase()).href);
  else if (act === 'logout') {
    if (S.dirty && !await confirmBox(t('unsaved'), { ok: t('signOut') })) return;
    discardDraft();
    db.signOut();
  }
}

async function saveDraft() {
  const s = structuredClone(draft());
  const act = s.rewards.filter(r => r.active !== false);
  for (const r of s.rewards) {
    r.stamps = Math.max(1, Math.floor(Number(r.stamps) || 1));
    for (const k of ['en', 'ms', 'zh']) r.name[k] = (r.name[k] || '').trim();
  }
  if (!act.length) return toast(t('atLeastOneReward'), { type: 'err' });
  if (act.some(r => !rewardName(r, 'en'))) return toast(t('rewardNameEn'), { type: 'err' });
  const counts = act.map(r => r.stamps);
  if (new Set(counts).size !== counts.length) return toast(t('dupStamps'), { type: 'err' });
  s.shop.whatsapp = s.shop.whatsapp ? normalizePhone(s.shop.whatsapp, s.countryCode) : '';
  s.shop.instagram = String(s.shop.instagram || '').replace(/^@/, '').trim();
  s.shop.mapsUrl = String(s.shop.mapsUrl || '').trim();
  if (s.shop.mapsUrl && !s.shop.mapsUrl.toLowerCase().startsWith('https://')) return toast(t('mapsUrlBad'), { type: 'err' });
  s.rule.minSpend = Math.max(0, Number(s.rule.minSpend) || 0);
  s.rule.perAmount = Math.max(1, Number(s.rule.perAmount) || 1);
  s.rule.maxPerDay = Math.max(0, Math.floor(Number(s.rule.maxPerDay) || 0));
  s.expiry.value = Math.max(1, Math.floor(Number(s.expiry.value) || 1));
  s.currency = String(s.currency || 'RM').trim() || 'RM';
  s.rewards.sort((a, b) => a.stamps - b.stamps);
  delete s.updatedAt;
  if (await run(() => db.saveSettings(s))) {
    S.dirty = false;
    S.draft = null;
    toast(t('settingsSaved'), { type: 'ok' });
    viewSettings(true);
  }
}

// Resize an uploaded logo to a small square-ish PNG so it fits inside the settings document.
function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
