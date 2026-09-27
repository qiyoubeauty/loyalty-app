// Demo backend: keeps everything in this browser's localStorage so the app can be
// tried before Firebase is set up. Same functions as db-firebase.js.
import { monthKey, newCustomer, randomId, DEFAULT_SETTINGS } from './logic.js';

const KEY = 'loyalty-demo-v2';
const channel = 'BroadcastChannel' in self ? new BroadcastChannel(KEY) : null;
const listeners = new Set();

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked or corrupt — fall through to seed data */ }
  // Save the sample data straight away so card links work in other tabs too.
  const fresh = seed();
  try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch { /* ignore */ }
  return fresh;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  channel?.postMessage('changed');
  notify();
}

function notify() {
  for (const l of listeners) l();
}

// Another tab (e.g. the customer card open next to the staff app) changed the data.
function reloadFromStorage() {
  state = load();
  notify();
}
if (channel) channel.onmessage = reloadFromStorage;
addEventListener('storage', e => { if (e.key === KEY) reloadFromStorage(); });

function subscribe(read, cb) {
  let last;
  const run = () => {
    const v = read();
    const json = JSON.stringify(v);
    if (json !== last) { last = json; cb(v === undefined ? null : structuredClone(v)); }
  };
  listeners.add(run);
  queueMicrotask(run);
  return () => listeners.delete(run);
}

const clone = v => (v === undefined ? undefined : structuredClone(v));

export function watchSettings(cb) { return subscribe(() => state.settings || null, cb); }

export async function saveSettings(settings) {
  state.settings = { ...clone(settings), updatedAt: Date.now() };
  save();
}

export function watchCustomers(cb) {
  return subscribe(() => Object.entries(state.customers).map(([id, c]) => ({ id, ...c })), cb);
}

export function watchCustomer(id, cb) {
  return subscribe(() => (state.customers[id] ? { id, ...state.customers[id] } : null), cb);
}

export function watchEvents(cid, cb, max = 30) {
  return subscribe(() => Object.entries(state.events[cid] || {})
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => b.at - a.at)
    .slice(0, max), cb);
}

export function watchStats(key, cb) { return subscribe(() => state.stats[key] || {}, cb); }

function bumpStats(key, stats) {
  const s = state.stats[key] || (state.stats[key] = {});
  for (const [k, v] of Object.entries(stats || {})) if (v) s[k] = (s[k] || 0) + v;
}

export async function addCustomer(id, data, joinEvent) {
  state.customers[id] = { ...clone(data), lastEventId: joinEvent.id };
  state.events[id] = { [joinEvent.id]: clone(joinEvent.data) };
  bumpStats(monthKey(data.createdAt), { newCustomers: 1 });
  save();
}

export async function updateCustomer(id, fields) {
  Object.assign(state.customers[id], clone(fields));
  save();
}

export async function deleteCustomer(id) {
  delete state.customers[id];
  delete state.events[id];
  save();
}

export async function transact(cid, fn, opts = {}) {
  const c = state.customers[cid];
  if (!c) throw new Error('customer-missing');
  const ev = opts.eventId && state.events[cid]?.[opts.eventId];
  const r = fn({ customer: { id: cid, ...clone(c) }, event: ev ? { id: opts.eventId, ...clone(ev) } : null });
  Object.assign(c, clone(r.patch));
  if (r.newEvent) (state.events[cid] ||= {})[r.newEvent.id] = clone(r.newEvent.data);
  if (r.eventPatch && ev) Object.assign(ev, clone(r.eventPatch));
  bumpStats(r.statsMonth || monthKey(Date.now()), r.stats);
  save();
  return r;
}

// ---------- staff login (demo: any email/password works) ----------
const authListeners = new Set();
let user = null;
try { user = JSON.parse(sessionStorage.getItem(KEY + '-user')); } catch { /* ignore */ }

export function onAuth(cb) {
  authListeners.add(cb);
  queueMicrotask(() => cb(user));
  return () => authListeners.delete(cb);
}

export async function signIn(email) {
  user = { email: email.trim() || 'demo@staff' };
  try { sessionStorage.setItem(KEY + '-user', JSON.stringify(user)); } catch { /* ignore */ }
  authListeners.forEach(cb => cb(user));
}

export async function signOut() {
  user = null;
  try { sessionStorage.removeItem(KEY + '-user'); } catch { /* ignore */ }
  authListeners.forEach(cb => cb(null));
}

export async function changePassword() { /* demo: nothing to change */ }

export async function resetPassword() { /* demo: no emails are sent */ }

export function resetDemo() {
  state = seed();
  save();
}

// ---------- sample data ----------
function seed() {
  const day = 864e5;
  const now = Date.now();
  const s = { settings: structuredClone(DEFAULT_SETTINGS), customers: {}, events: {}, stats: {} };
  const people = [
    ['Aisyah Rahman', '60123456789', 4, 9, 20],
    ['Mei Ling Tan', '60167788990', 5, 5, 12],
    ['Priya Devi', '60193344556', 10, 10, 3],
    ['Nurul Huda', '60112233445', 2, 2, 75],
    ['Chloe Wong', '60135566778', 7, 17, 1],
    ['Siti Aminah', '60148899001', 1, 1, 0],
  ];
  for (const [name, phone, stamps, visits, lastAgo] of people) {
    const id = randomId();
    const created = now - (visits * 30 + 5) * day;
    const c = newCustomer({ name, phone, note: '' }, created);
    const events = {};
    const joinId = randomId(12);
    events[joinId] = { type: 'join', at: created, by: 'demo@staff' };
    let lastId = joinId;
    for (let i = visits - 1; i >= 0; i--) {
      const at = now - (lastAgo + i * 21) * day;
      const eid = randomId(12);
      events[eid] = { type: 'stamp', at, count: 1, amount: 128, expired: 0, by: 'demo@staff', undone: false, prev: null };
      lastId = eid;
      const mk = monthKey(at);
      s.stats[mk] = s.stats[mk] || {};
      s.stats[mk].visits = (s.stats[mk].visits || 0) + 1;
      s.stats[mk].stamps = (s.stats[mk].stamps || 0) + 1;
      s.stats[mk].spent = (s.stats[mk].spent || 0) + 128;
    }
    const lastAt = visits ? now - lastAgo * day : null;
    Object.assign(c, {
      stamps, cycle: visits > 10 ? 2 : 1, redeemed: stamps >= 5 && name.startsWith('Priya') ? ['r5'] : [],
      totalVisits: visits, totalStamps: visits, totalRedeemed: visits > 10 ? 2 : (name.startsWith('Priya') ? 1 : 0),
      totalSpent: visits * 128, lastStampAt: lastAt, lastVisitAt: lastAt, lastEventId: lastId,
      dayKey: null, dayStamps: 0,
    });
    s.customers[id] = c;
    s.events[id] = events;
    const mk = monthKey(created);
    s.stats[mk] = s.stats[mk] || {};
    s.stats[mk].newCustomers = (s.stats[mk].newCustomers || 0) + 1;
  }
  return s;
}
