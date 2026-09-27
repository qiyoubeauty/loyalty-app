// Small shared UI helpers: icons, escaping, toasts, confirm dialogs, theming.
import { LANGS, lang, setLang, t } from './i18n.js';
import { rewardName } from './logic.js';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icon = {
  flower: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="6.3" r="3.6"/><circle cx="17.4" cy="10.2" r="3.6"/><circle cx="15.4" cy="16.6" r="3.6"/><circle cx="8.6" cy="16.6" r="3.6"/><circle cx="6.6" cy="10.2" r="3.6"/><circle cx="12" cy="12" r="3" fill="#fff" fill-opacity=".9"/></svg>`,
  gift: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 12 8 12 8s2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 0 1 2.2 12C2.2 6.6 6.6 2.2 12 2.2S21.8 6.6 21.8 12 17.4 21.8 12 21.8zM12 .5C5.7.5.5 5.7.5 12c0 2 .5 4 1.5 5.7L.4 23.5l6-1.6c1.7.9 3.6 1.4 5.6 1.4 6.3 0 11.5-5.2 11.5-11.5S18.3.5 12 .5z"/></svg>`,
  qr: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3h-3z"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pin: svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  heart: svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  star: svg('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>'),
  phone: svg('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  insta: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'),
  foot: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="12.5" cy="15" rx="4.6" ry="6.4"/><circle cx="8.2" cy="5.2" r="1.9"/><circle cx="11.6" cy="3.9" r="1.6"/><circle cx="14.6" cy="4.4" r="1.4"/><circle cx="17" cy="5.9" r="1.2"/><circle cx="18.6" cy="8" r="1.05"/></svg>`,
  more: svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
};

// Links typed into Settings are only used when they are plain https:// links.
export function safeUrl(u) {
  const s = String(u || '').trim();
  return s.toLowerCase().startsWith('https://') ? s : '';
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

// ---------- toasts ----------
let toastBox;
export function toast(msg, { type = '', action, onAction, ms = 3500 } = {}) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    // A popover sits in the browser's top layer, so toasts show above open dialogs too.
    if ('popover' in HTMLElement.prototype) toastBox.popover = 'manual';
    document.body.append(toastBox);
  }
  // An open modal sheet makes the rest of the page untappable, so the toast must live
  // inside the topmost sheet for its Undo button to work.
  const host = [...document.querySelectorAll('dialog[open]')].filter(d => d.matches(':modal')).pop() || document.body;
  if (toastBox.parentNode !== host) {
    host.append(toastBox);
    if (host !== document.body) {
      host.addEventListener('close', () => {
        if (toastBox.parentNode === host) { document.body.append(toastBox); showToastBox(); }
      }, { once: true });
    }
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  const kill = () => { el.remove(); if (!toastBox.childElementCount && toastBox.matches?.(':popover-open')) toastBox.hidePopover(); };
  if (action) el.querySelector('button').onclick = () => { kill(); onAction?.(); };
  toastBox.append(el);
  showToastBox();
  setTimeout(kill, action ? Math.max(ms, 8000) : ms);
}

// Replace an element's content without throwing away toasts living inside it.
export function setHtmlKeepToasts(el, html) {
  const keep = toastBox && toastBox.parentNode === el ? toastBox : null;
  el.innerHTML = html;
  if (keep) { el.append(keep); showToastBox(); }
}

function showToastBox() {
  if (!toastBox.popover) return;
  // Re-open so it stacks above any dialog opened since the last toast.
  if (toastBox.matches(':popover-open')) toastBox.hidePopover();
  if (toastBox.childElementCount) toastBox.showPopover();
}

// ---------- confirm / prompt dialogs ----------
export function confirmBox(message, { ok = t('confirm'), cancel = t('cancel'), danger = false } = {}) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'alert';
    d.innerHTML = `<p>${esc(message)}</p><div class="btn-row">
      <button class="btn" value="no">${esc(cancel)}</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" value="yes">${esc(ok)}</button></div>`;
    d.addEventListener('click', e => {
      const v = e.target.closest('button')?.value;
      if (v) { d.close(v); }
    });
    d.addEventListener('close', () => { resolve(d.returnValue === 'yes'); d.remove(); });
    document.body.append(d);
    d.showModal();
  });
}

// ---------- theming ----------
export function applyTheme(settings) {
  const c = settings?.shop?.color;
  if (c && /^#[0-9a-f]{6}$/i.test(c)) {
    document.documentElement.style.setProperty('--accent', c);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
  }
}

// Bump when the logo files in /icons change, so phones fetch the new image instead of an old saved copy.
const ASSET_VERSION = '2';

// Logos from /icons get a version tag; uploaded logos (data URLs) are used as-is.
export function logoSrc(logo) {
  return String(logo).startsWith('icons/') ? `${logo}?v=${ASSET_VERSION}` : logo;
}

export function brandHtml(settings, sub) {
  const shop = settings.shop;
  const logo = shop.logo ? `<img src="${esc(logoSrc(shop.logo))}" alt="">` : icon.flower;
  return `<div class="brand"><div class="brand-logo">${logo}</div>
    <div style="min-width:0"><div class="brand-name">${esc(shop.name)}</div>
    <div class="brand-tag">${esc(sub ?? shop.tagline)}</div></div></div>`;
}

export function langSwitchHtml() {
  return `<div class="langs" role="group" aria-label="Language">${LANGS.map(l =>
    `<button type="button" data-lang="${l.code}" aria-pressed="${l.code === lang}">${l.label}</button>`).join('')}</div>`;
}

// Wire language buttons anywhere inside root; calls rerender after switching.
export function bindLangSwitch(root, rerender) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang);
    rerender();
  });
}

// Stamp grid. milestones: Map stampNumber -> 'locked' | 'ready' | 'claimed'.
export function stampGridHtml(stamps, size, milestones, { small = false, popIndex = -1, labels } = {}) {
  let html = '';
  for (let i = 1; i <= size; i++) {
    const filled = i <= stamps;
    const ms = milestones.get(i);
    const rot = ((i * 37) % 23) - 11; // stable little tilt so it looks hand-stamped
    const cls = ['stamp', filled ? 'filled' : '', ms ? 'gift' : '', ms === 'claimed' ? 'claimed filled' : '', i === popIndex ? 'pop' : ''].join(' ');
    const inner = ms ? (ms === 'claimed' ? icon.check : icon.gift) : filled ? icon.flower : i;
    const tag = ms && labels?.get(i) ? `<span class="tag">${esc(labels.get(i))}</span>` : '';
    html += `<div class="${cls}" style="--rot:${rot}deg">${inner}${tag}</div>`;
  }
  return `<div class="stamps ${small ? 'small' : ''}">${html}</div>`;
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When a new version is deployed, reload once so nobody keeps running old code.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  }
}

// Icon + text for one history entry (used by both the card and the staff app).
export function eventLabel(e) {
  if (e.type === 'join') return { ic: icon.heart, cls: '', title: t('joined') };
  if (e.type === 'redeem') {
    const title = t('rewardClaimed', { reward: rewardName({ name: e.rewardName }, lang) }) + (e.completesCard ? ` · ${t('newCard')}` : '');
    return { ic: icon.gift, cls: 'gold', title };
  }
  if (e.type === 'adjust') return { ic: icon.sparkle, cls: 'muted', title: t('adjusted', { n: e.to }) + (e.reason ? ` — ${e.reason}` : '') };
  const title = e.count > 0 ? (e.count === 1 ? t('stampsEarned', { n: 1 }) : t('stampsEarnedPl', { n: e.count })) : t('visit');
  return { ic: icon.flower, cls: e.count > 0 ? '' : 'muted', title };
}
