// Pure business rules for the stamp card. No database or DOM code here —
// both the Firebase backend and the demo backend call these functions, so the
// rules behave identically everywhere.

export const UNDO_WINDOW_MS = 10 * 60 * 1000; // staff can undo an action for 10 minutes
export const DEFAULT_CARD_SIZE = 10;

export const DEFAULT_SETTINGS = {
  shop: {
    name: 'QI·You 奇遇',
    tagline: 'Beauty & Nails',
    logo: 'icons/logo-256.png', // file path, or a small data-URL image uploaded from Settings
    color: '#e8889c',    // accent colour (logo pink)
    address: '',
    hours: '',
    whatsapp: '',        // shop WhatsApp number, e.g. 60123456789
    instagram: '',
    mapsUrl: 'https://share.google/OmFUosUKcdbtyfmYD', // Google Maps / Business Profile share link
  },
  currency: 'RM',
  countryCode: '60',
  rewards: [
    { id: 'r5', stamps: 5, active: true, name: { en: 'Free foot scrub', ms: 'Scrub kaki percuma', zh: '免费足部磨砂' } },
    { id: 'r10', stamps: 10, active: true, name: { en: 'Free basic pedicure', ms: 'Pedikur asas percuma', zh: '免费基础修脚' } },
  ],
  rule: {
    mode: 'minSpend', // 'visit' = 1 per visit, 'minSpend' = 1 per visit if spend >= minSpend, 'perAmount' = 1 per every perAmount spent
    minSpend: 100,
    perAmount: 100,
    maxPerDay: 1,    // 0 = no limit
  },
  expiry: {
    enabled: true,
    value: 12,
    unit: 'months',  // 'days' | 'weeks' | 'months'
  },
};

// Merge saved settings over defaults so older/partial settings docs never break the app.
export function withDefaults(s) {
  s = s || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    shop: { ...DEFAULT_SETTINGS.shop, ...(s.shop || {}) },
    rule: { ...DEFAULT_SETTINGS.rule, ...(s.rule || {}) },
    expiry: { ...DEFAULT_SETTINGS.expiry, ...(s.expiry || {}) },
    rewards: Array.isArray(s.rewards) ? s.rewards : DEFAULT_SETTINGS.rewards,
  };
}

export function activeRewards(settings) {
  return settings.rewards
    .filter(r => r.active !== false && Number(r.stamps) > 0)
    .sort((a, b) => a.stamps - b.stamps);
}

// Card size = the biggest active reward. Redeeming that reward completes the card.
export function cardSize(settings) {
  const list = activeRewards(settings);
  return list.length ? Number(list[list.length - 1].stamps) : DEFAULT_CARD_SIZE;
}

export function rewardName(reward, lang) {
  if (!reward) return '';
  const n = reward.name || {};
  return n[lang] || n.en || n.ms || n.zh || '';
}

// ---------- dates ----------

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addDuration(ts, value, unit) {
  const d = new Date(ts);
  if (unit === 'months') d.setMonth(d.getMonth() + value);
  else d.setDate(d.getDate() + value * (unit === 'weeks' ? 7 : 1));
  return d.getTime();
}

// When the customer's current stamps expire (null = never).
export function expiresAt(customer, settings) {
  const e = settings.expiry;
  if (!e.enabled || !customer.lastStampAt || !(Number(e.value) > 0)) return null;
  return addDuration(customer.lastStampAt, Number(e.value), e.unit);
}

// The card as it really stands right now, after applying expiry.
export function effectiveCard(customer, settings, now = Date.now()) {
  const exp = expiresAt(customer, settings);
  const expired = exp !== null && now > exp && (customer.stamps || 0) > 0;
  return {
    stamps: expired ? 0 : (customer.stamps || 0),
    redeemed: expired ? [] : (customer.redeemed || []),
    expired,
    expiredCount: expired ? customer.stamps : 0,
    expiresAt: expired ? null : exp,
  };
}

// Each active reward with its state for this customer: 'claimed' | 'ready' | 'locked'.
export function rewardStates(customer, settings, now = Date.now()) {
  const card = effectiveCard(customer, settings, now);
  return activeRewards(settings).map(r => {
    const claimed = card.redeemed.includes(r.id);
    const ready = !claimed && card.stamps >= r.stamps;
    return {
      reward: r,
      state: claimed ? 'claimed' : ready ? 'ready' : 'locked',
      remaining: Math.max(0, r.stamps - card.stamps),
    };
  });
}

export function readyRewards(customer, settings, now = Date.now()) {
  return rewardStates(customer, settings, now).filter(x => x.state === 'ready');
}

// The next reward still to be earned (for "3 more visits to ..." text).
export function nextReward(customer, settings, now = Date.now()) {
  return rewardStates(customer, settings, now).find(x => x.state === 'locked') || null;
}

// ---------- stamp rules ----------

// How many stamps a visit earns under the current rule. amount may be null/'' for 'visit' mode.
export function stampsForVisit(settings, amount) {
  const r = settings.rule;
  const amt = Number(amount) || 0;
  if (r.mode === 'minSpend') return amt >= Number(r.minSpend || 0) ? 1 : 0;
  if (r.mode === 'perAmount') {
    const per = Number(r.perAmount) || 0;
    return per > 0 ? Math.floor(amt / per) : 0;
  }
  return 1;
}

export function ruleNeedsAmount(settings) {
  return settings.rule.mode === 'minSpend' || settings.rule.mode === 'perAmount';
}

// Would this stamp go over the daily limit? Returns how many were already given today.
export function dailyLimitCheck(customer, settings, count, now = Date.now()) {
  const max = Number(settings.rule.maxPerDay) || 0;
  const today = customer.dayKey === dayKey(now) ? (customer.dayStamps || 0) : 0;
  return { over: max > 0 && today + count > max, today, max };
}

// ---------- mutations (return patches, never touch storage) ----------

// Fields snapshotted into each event so the action can be undone exactly.
const UNDO_FIELDS = ['stamps', 'redeemed', 'cycle', 'totalVisits', 'totalStamps', 'totalRedeemed',
  'totalSpent', 'lastStampAt', 'lastVisitAt', 'dayKey', 'dayStamps', 'lastEventId'];

function snapshot(c) {
  const out = {};
  for (const f of UNDO_FIELDS) out[f] = c[f] === undefined ? null : c[f];
  return out;
}

export function newCustomer({ name, phone, note }, now = Date.now()) {
  return {
    name: name.trim(),
    phone,
    note: (note || '').trim(),
    consent: true,
    createdAt: now,
    stamps: 0,
    redeemed: [],
    cycle: 1,
    totalVisits: 0,
    totalStamps: 0,
    totalRedeemed: 0,
    totalSpent: 0,
    lastStampAt: null,
    lastVisitAt: null,
    dayKey: null,
    dayStamps: 0,
    lastEventId: null,
  };
}

// Record a visit. count may be 0 (visit logged, e.g. spend below minimum).
export function applyStamp(customer, settings, { count, amount, now, eventId, by }) {
  const card = effectiveCard(customer, settings, now);
  const amt = amount === '' || amount === null || amount === undefined ? null : Number(amount);
  const sameDay = customer.dayKey === dayKey(now);
  const patch = {
    stamps: card.stamps + count,
    redeemed: card.redeemed,
    totalVisits: (customer.totalVisits || 0) + 1,
    totalStamps: (customer.totalStamps || 0) + count,
    totalSpent: (customer.totalSpent || 0) + (amt || 0),
    lastVisitAt: now,
    lastStampAt: count > 0 ? now : (card.expired ? null : customer.lastStampAt),
    dayKey: dayKey(now),
    dayStamps: (sameDay ? customer.dayStamps || 0 : 0) + count,
    lastEventId: eventId,
  };
  const event = {
    type: 'stamp', at: now, count, amount: amt, expired: card.expiredCount || 0,
    by: by || null, prev: snapshot(customer), undone: false,
  };
  const stats = { visits: 1, stamps: count, spent: amt || 0 };
  return { patch, event, stats };
}

export function applyRedeem(customer, settings, rewardId, { now, eventId, by, lang }) {
  const card = effectiveCard(customer, settings, now);
  const reward = activeRewards(settings).find(r => r.id === rewardId);
  if (!reward) throw new Error('reward-missing');
  if (card.redeemed.includes(rewardId)) throw new Error('reward-claimed');
  if (card.stamps < reward.stamps) throw new Error('reward-locked');

  const size = cardSize(settings);
  const completesCard = Number(reward.stamps) >= size;
  const patch = {
    totalRedeemed: (customer.totalRedeemed || 0) + 1,
    lastEventId: eventId,
    // Card complete: start a new one and carry over any extra stamps.
    stamps: completesCard ? Math.max(0, card.stamps - size) : card.stamps,
    redeemed: completesCard ? [] : [...card.redeemed, rewardId],
    cycle: completesCard ? (customer.cycle || 1) + 1 : (customer.cycle || 1),
  };
  const event = {
    type: 'redeem', at: now, rewardId, rewardName: reward.name, rewardStamps: reward.stamps,
    completesCard, by: by || null, prev: snapshot(customer), undone: false,
  };
  return { patch, event, stats: { redemptions: 1 } };
}

// Unclaimed rewards that would be lost if the card-completing reward is redeemed now.
export function forfeitedBy(customer, settings, rewardId, now = Date.now()) {
  const reward = activeRewards(settings).find(r => r.id === rewardId);
  if (!reward || Number(reward.stamps) < cardSize(settings)) return [];
  return readyRewards(customer, settings, now).filter(x => x.reward.id !== rewardId).map(x => x.reward);
}

// Manual correction by staff: set the current stamp count directly.
export function applyAdjust(customer, settings, newStamps, { now, eventId, by, reason }) {
  const card = effectiveCard(customer, settings, now);
  const n = Math.max(0, Math.floor(Number(newStamps) || 0));
  const patch = {
    stamps: n,
    redeemed: card.redeemed,
    lastStampAt: n > 0 ? (card.expired || !customer.lastStampAt ? now : customer.lastStampAt) : customer.lastStampAt,
    lastEventId: eventId,
  };
  const event = {
    type: 'adjust', at: now, from: card.stamps, to: n, reason: reason || '',
    by: by || null, prev: snapshot(customer), undone: false,
  };
  return { patch, event, stats: {} };
}

export function canUndo(customer, event, now = Date.now()) {
  return !!event && !event.undone && event.type !== 'join' && event.prev
    && customer.lastEventId === event.id && now - event.at <= UNDO_WINDOW_MS;
}

// Restore the customer to exactly how they were before the event.
export function applyUndo(customer, event, now = Date.now()) {
  if (!canUndo(customer, event, now)) throw new Error('undo-expired');
  const patch = { ...event.prev };
  let stats = {};
  if (event.type === 'stamp') stats = { visits: -1, stamps: -event.count, spent: -(event.amount || 0) };
  if (event.type === 'redeem') stats = { redemptions: -1 };
  return { patch, eventPatch: { undone: true, undoneAt: now }, stats, statsMonth: monthKey(event.at) };
}

// ---------- helpers ----------

// Normalise a phone number to international digits, e.g. "012-345 6789" -> "60123456789".
export function normalizePhone(input, countryCode = '60') {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  else if (!d.startsWith(countryCode) && d.length <= 10) d = countryCode + d;
  return d;
}

// Friendly local display, e.g. "60123456789" -> "012-345 6789".
export function formatPhone(digits, countryCode = '60') {
  if (!digits) return '';
  if (!digits.startsWith(countryCode)) return '+' + digits;
  const local = '0' + digits.slice(countryCode.length);
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)} ${local.slice(6)}`;
  if (local.length === 11) return `${local.slice(0, 3)}-${local.slice(3, 7)} ${local.slice(7)}`;
  return local;
}

// Unguessable id — the customer's card link is their "password", so keep it long.
export function randomId(len = 20) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => abc[b % abc.length]).join('');
}

// Short code printed on the card, handy for staff to search.
export function memberCode(id) {
  return String(id || '').slice(0, 6).toUpperCase();
}
