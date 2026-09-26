// Customer card page: opened from the personal link ?c=<cardId>, installable to the home screen.
import * as db from './db.js';
import {
  withDefaults, cardSize, rewardName, effectiveCard, rewardStates, nextReward, memberCode,
} from './logic.js';
import { t, lang, fmtDate, fmtDateTime, fmtMoney } from './i18n.js';
import {
  icon, esc, $, applyTheme, brandHtml, langSwitchHtml, bindLangSwitch, stampGridHtml, eventLabel, registerSW, safeUrl,
} from './ui.js';

const app = $('#app');
const CARD_KEY = 'loyalty-card';
const INSTALL_KEY = 'loyalty-install-dismissed';
const REVIEW_KEY = 'loyalty-reviewed';
const REVIEW_BOOST_DAYS = 14; // after a gift is redeemed, show the review prompt near the top for 2 weeks

const S = {
  settings: withDefaults(null),
  customer: undefined, // undefined = loading, null = not found
  events: [],
  lastStamps: null,
  installEvt: null,
};

registerSW();

// The link carries the card id. Remember it, so the home-screen icon still works
// on phones that open the app without the ?c= part.
const params = new URLSearchParams(location.search);
let cardId = params.get('c');
try {
  if (cardId) localStorage.setItem(CARD_KEY, cardId);
  else cardId = localStorage.getItem(CARD_KEY);
} catch { /* storage blocked — the link itself still works */ }
if (cardId && !params.get('c')) history.replaceState(null, '', `?c=${encodeURIComponent(cardId)}`);

db.watchSettings(s => {
  S.settings = withDefaults(s);
  applyTheme(S.settings);
  render();
}, () => render());

if (cardId) {
  db.watchCustomer(cardId, c => { S.customer = c; render(); }, () => { S.customer = null; render(); });
  db.watchEvents(cardId, list => { S.events = list; render(); }, 15, () => {});
} else {
  S.customer = null;
}

bindLangSwitch(app, render);
addEventListener('online', render);
addEventListener('offline', render);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; render(); });
addEventListener('appinstalled', () => { S.installEvt = null; render(); });

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function installDismissed() {
  try { return localStorage.getItem(INSTALL_KEY) === '1'; } catch { return false; }
}

function render() {
  const st = S.settings;
  document.title = `${st.shop.name} · ${t('loyaltyCard')}`;
  const top = `<header class="topbar">${brandHtml(st)}${langSwitchHtml()}</header>`;
  const offline = navigator.onLine ? '' : `<div class="notice info" style="margin-bottom:14px">${icon.info}<span>${esc(t('offline'))}</span></div>`;

  if (S.customer === undefined) {
    app.innerHTML = `<div class="wrap">${top}<div class="spin" aria-label="${esc(t('loading'))}"></div></div>`;
    return;
  }
  if (S.customer === null) {
    const title = cardId ? t('notFoundTitle') : t('noCardTitle');
    const body = cardId ? t('notFoundBody') : t('noCardBody');
    app.innerHTML = `<div class="wrap">${top}${offline}
      <div class="panel hero"><div class="art">${cardId ? icon.alert : icon.gift}</div>
        <h1>${esc(title)}</h1><p>${esc(body)}</p></div>
      ${howItWorksHtml(st)}${shopHtml(st)}</div>`;
    return;
  }

  const c = S.customer;
  const now = Date.now();
  const size = cardSize(st);
  const card = effectiveCard(c, st, now);
  const states = rewardStates(c, st, now);
  const milestones = new Map(states.map(x => [Number(x.reward.stamps), x.state]));
  const ready = states.filter(x => x.state === 'ready');
  const next = nextReward(c, st, now);
  const pct = Math.min(100, Math.round((card.stamps / size) * 100));
  // Animate the newest stamp if it arrived while the page is open.
  const popIndex = S.lastStamps !== null && card.stamps > S.lastStamps ? card.stamps : -1;
  S.lastStamps = card.stamps;

  // Ask happy customers for a Google review: prominently right after a redeemed gift, otherwise lower down.
  const canReview = !!safeUrl(st.shop.reviewUrl) && (c.totalVisits || 0) > 0 && !reviewedAlready();
  const recentGift = S.events.some(e => e.type === 'redeem' && !e.undone && now - e.at < REVIEW_BOOST_DAYS * 864e5);
  const reviewNow = canReview && recentGift;
  const reviewLater = canReview && !recentGift;

  let progressText;
  if (next) progressText = next.remaining === 1
    ? t('moreTo1', { reward: rewardName(next.reward, lang) })
    : t('moreTo', { n: next.remaining, reward: rewardName(next.reward, lang) });
  else progressText = t('allEarned');

  app.innerHTML = `<div class="wrap">${top}${offline}
    <div class="greet"><h1>${esc(t('hi', { name: c.name.split(' ')[0] }))} 👋</h1><p>${esc(t('welcomeBack'))}</p></div>

    <section class="stamp-card" aria-label="${esc(t('loyaltyCard'))}">
      <div class="card-head">
        <div><div class="card-kicker">${esc(t('loyaltyCard'))}${(c.cycle || 1) > 1 ? ` · ${esc(t('cardNo', { n: c.cycle }))}` : ''}</div>
          <div class="card-name">${esc(c.name)}</div></div>
        <div class="card-count"><b>${card.stamps}</b><span>/ ${size}</span></div>
      </div>
      ${stampGridHtml(card.stamps, size, milestones, { small: size > 15, popIndex })}
      <div class="progress">
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${size}" aria-valuenow="${card.stamps}"><i style="width:${pct}%"></i></div>
        <p>${esc(progressText)}</p>
      </div>
      <div class="card-foot"><span>${esc(t('memberCode'))}: ${esc(memberCode(c.id))}</span><span>${esc(t('memberSince', { date: fmtDate(c.createdAt, { month: 'short', year: 'numeric' }) }))}</span></div>
    </section>

    ${ready.map(x => `<div class="notice gold mt">${icon.gift}<span><b>${esc(t('readyToClaim'))} ${esc(rewardName(x.reward, lang))}</b><br><span style="font-weight:500">${esc(t('readyHint'))}</span></span></div>`).join('')}
    ${card.expired ? `<div class="notice warn mt">${icon.clock}<span>${esc(t('expiredNote'))}</span></div>` : ''}
    ${card.expiresAt ? `<div class="notice info mt">${icon.clock}<span>${esc(t('validUntil', { date: fmtDate(card.expiresAt) }))}</span></div>` : ''}
    ${reviewNow ? reviewHtml(true) : ''}
    ${installHtml()}

    <div class="panel">
      <h2>${icon.gift} ${esc(t('rewards'))}</h2>
      <ul class="rows">${states.map(x => `
        <li class="row">
          <div class="icon-bubble ${x.state === 'ready' ? 'gold' : x.state === 'claimed' ? 'ok' : ''}">${x.state === 'claimed' ? icon.check : icon.gift}</div>
          <div class="grow"><div class="title">${esc(rewardName(x.reward, lang))}</div>
            <div class="sub">${esc(t('stampsNeeded', { n: x.reward.stamps }))}</div></div>
          ${x.state === 'ready' ? `<span class="chip gold">${icon.sparkle} ${esc(t('readyToClaim'))}</span>`
            : x.state === 'claimed' ? `<span class="chip ok">${icon.check} ${esc(t('claimed'))}</span>`
            : `<span class="chip">${esc(t('toGo', { n: x.remaining }))}</span>`}
        </li>`).join('')}</ul>
    </div>

    ${howItWorksHtml(st)}

    <div class="panel">
      <h2>${icon.clock} ${esc(t('history'))}</h2>
      <ul class="rows">${historyHtml(st)}</ul>
    </div>

    ${reviewLater ? reviewHtml(false) : ''}
    ${shopHtml(st)}
  </div>`;

  const rv = $('#reviewBtn');
  if (rv) rv.onclick = () => { setReviewed(); setTimeout(render, 500); };
  const rvDone = $('#reviewDone');
  if (rvDone) rvDone.onclick = () => { setReviewed(); render(); };

  const btn = $('#installBtn');
  if (btn) btn.onclick = async () => {
    S.installEvt.prompt();
    await S.installEvt.userChoice;
    S.installEvt = null;
    render();
  };
  const no = $('#installNo');
  if (no) no.onclick = () => { try { localStorage.setItem(INSTALL_KEY, '1'); } catch { /* ignore */ } render(); };
}

function reviewedAlready() {
  try { return localStorage.getItem(REVIEW_KEY) === '1'; } catch { return false; }
}

function setReviewed() {
  try { localStorage.setItem(REVIEW_KEY, '1'); } catch { /* ignore */ }
}

function reviewHtml(highlight) {
  const link = safeUrl(S.settings.shop.reviewUrl);
  return `<div class="panel ${highlight ? 'review-hot' : ''}">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div class="icon-bubble gold">${icon.star}</div>
      <div class="grow"><b>${esc(t('rateTitle'))}</b>
        <div class="stars" aria-hidden="true">★★★★★</div>
        <p class="small muted" style="margin:4px 0 12px">${esc(t('rateBody'))}</p>
        <div class="btn-row" style="align-items:center">
          <a class="btn gold sm" id="reviewBtn" target="_blank" rel="noopener" href="${esc(link)}">${icon.star} ${esc(t('rateBtn'))}</a>
          <button type="button" class="btn ghost sm" id="reviewDone" style="flex:none">${esc(t('rateDone'))}</button>
        </div></div></div></div>`;
}

function installHtml() {
  if (isStandalone() || installDismissed()) return '';
  const how = S.installEvt
    ? `<button type="button" class="btn primary sm" id="installBtn">${icon.download} ${esc(t('installBtn'))}</button>`
    : `<span class="small" style="font-weight:500">${esc(isIos() ? t('installIos') : t('installAndroid'))}</span>`;
  return `<div class="panel" style="display:flex;gap:12px;align-items:flex-start">
    <div class="icon-bubble">${icon.phone}</div>
    <div class="grow"><b>${esc(t('installTitle'))}</b><p class="small muted" style="margin:2px 0 10px">${esc(t('installBody'))}</p>
      <div class="btn-row" style="align-items:center">${how}
        <button type="button" class="btn ghost sm" id="installNo" style="flex:none">${esc(t('dismiss'))}</button></div></div>
  </div>`;
}

function historyHtml(st) {
  const list = S.events.filter(e => !e.undone);
  if (!list.length) return `<li class="empty">${esc(t('noHistory'))}</li>`;
  return list.map(e => {
    const { ic, cls, title } = eventLabel(e);
    const sub = [fmtDateTime(e.at), e.amount ? fmtMoney(e.amount, st.currency) : ''].filter(Boolean).join(' · ');
    return `<li class="row"><div class="icon-bubble ${cls}">${ic}</div>
      <div class="grow"><div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div></div></li>`;
  }).join('');
}

function howItWorksHtml(st) {
  const r = st.rule;
  const lines = [];
  if (r.mode === 'minSpend') lines.push(t('howMinSpend', { cur: st.currency, n: r.minSpend }));
  else if (r.mode === 'perAmount') lines.push(t('howPerAmount', { cur: st.currency, n: r.perAmount }));
  else lines.push(t('howVisit'));
  if (st.expiry.enabled) lines.push(t('howExpiry', { n: st.expiry.value, unit: t(st.expiry.unit) }));
  return `<div class="panel"><h2>${icon.sparkle} ${esc(t('howItWorks'))}</h2>
    <ul class="rows">${lines.map(l => `<li class="row"><div class="icon-bubble">${icon.flower}</div><div class="grow">${esc(l)}</div></li>`).join('')}</ul></div>`;
}

function shopHtml(st) {
  const sh = st.shop;
  const items = [];
  // Only ever put https links from Settings into an href.
  const mapsLink = String(sh.mapsUrl || '').toLowerCase().startsWith('https://') ? sh.mapsUrl
    : sh.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sh.address.replace(/\s+/g, ' '))}` : '';
  if (sh.address || mapsLink) {
    items.push(`<li class="row"><div class="icon-bubble">${icon.pin}</div><div class="grow" style="white-space:pre-line">${esc(sh.address || t('findUs'))}</div></li>`);
    items.push(`<li class="row" style="border-top:0;padding-top:0"><div class="btn-row" style="width:100%">
      ${mapsLink ? `<a class="btn soft sm" target="_blank" rel="noopener" href="${esc(mapsLink)}">${icon.pin} ${esc(t('openMap'))}</a>` : ''}
      ${sh.address ? `<a class="btn soft sm" target="_blank" rel="noopener" href="https://waze.com/ul?q=${encodeURIComponent(sh.address.replace(/\s+/g, ' '))}&navigate=yes">${icon.pin} ${esc(t('waze'))}</a>` : ''}</div></li>`);
  }
  if (sh.hours) items.push(`<li class="row"><div class="icon-bubble">${icon.clock}</div><div class="grow" style="white-space:pre-line">${esc(sh.hours)}</div></li>`);
  if (sh.instagram) items.push(`<li class="row"><div class="icon-bubble">${icon.insta}</div><div class="grow"><a target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(sh.instagram)}">@${esc(sh.instagram)}</a></div></li>`);
  const wa = sh.whatsapp ? `<a class="btn wa block mt" target="_blank" rel="noopener" href="https://wa.me/${esc(sh.whatsapp)}">${icon.whatsapp} ${esc(t('whatsappUs'))}</a>` : '';
  if (!items.length && !wa) return '';
  return `<div class="panel"><h2>${icon.heart} ${esc(t('shopInfo'))}</h2><ul class="rows">${items.join('')}</ul>${wa}</div>`;
}
