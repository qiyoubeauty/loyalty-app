// Firebase (Firestore + Authentication) backend.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, orderBy, limit, onSnapshot, setDoc,
  runTransaction, writeBatch, getDocs, increment, deleteField,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
  setPersistence, browserLocalPersistence, EmailAuthProvider, reauthenticateWithCredential,
  updatePassword, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { firebaseConfig } from './config.js';
import { monthKey } from './logic.js';

const app = initializeApp(firebaseConfig);
// Offline cache: the customer card still opens (with the last known stamps) without internet.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const settingsRef = doc(db, 'settings', 'main');
const customerRef = id => doc(db, 'customers', id);
const eventRef = (cid, eid) => doc(db, 'customers', cid, 'events', eid);
const statsRef = key => doc(db, 'stats', key);
// Phone number and staff notes live in a staff-only collection, so a customer's card link
// (which can read their customers/{id} document) never exposes them. See firestore.rules.
const privateRef = id => doc(db, 'private', id);
const PRIVATE_FIELDS = ['phone', 'note'];

function splitPrivate(data) {
  const pub = { ...data };
  const priv = {};
  for (const k of PRIVATE_FIELDS) if (k in pub) { priv[k] = pub[k]; delete pub[k]; }
  return { pub, priv };
}

export function watchSettings(cb, onError) {
  return onSnapshot(settingsRef, s => cb(s.exists() ? s.data() : null), onError);
}

export function saveSettings(settings) {
  return setDoc(settingsRef, { ...settings, updatedAt: Date.now() });
}

// Staff list = public card data merged with the private details.
export function watchCustomers(cb, onError) {
  let pubDocs = null;
  let priv = new Map();
  let privReady = false;
  let privOk = false;
  const emit = () => {
    if (!pubDocs || !privReady) return;
    cb(pubDocs.map(d => ({ id: d.id, ...d.data(), ...(priv.get(d.id) || {}) })));
  };
  const stopPub = onSnapshot(collection(db, 'customers'), snap => {
    pubDocs = snap.docs;
    emit();
    if (privOk) movePrivateFields(snap.docs);
  }, onError);
  const stopPriv = onSnapshot(collection(db, 'private'), snap => {
    priv = new Map(snap.docs.map(d => [d.id, d.data()]));
    privReady = true;
    privOk = true;
    emit();
    if (pubDocs) movePrivateFields(pubDocs);
  }, err => {
    // Rules not updated yet: keep working with the old layout instead of locking staff out.
    console.warn('Private customer details unavailable:', err?.code || err);
    privReady = true;
    emit();
  });
  return () => { stopPub(); stopPriv(); };
}

// One-time move for customers saved before the privacy split: copy phone/note to /private,
// remove them from the public card, and drop the staff email from their visit history.
const moving = new Set();
async function movePrivateFields(docs) {
  for (const d of docs) {
    const data = d.data();
    if (!PRIVATE_FIELDS.some(k => k in data) || moving.has(d.id)) continue;
    moving.add(d.id);
    try {
      const { priv } = splitPrivate(data);
      const events = await getDocs(collection(db, 'customers', d.id, 'events'));
      const batch = writeBatch(db);
      batch.set(privateRef(d.id), priv, { merge: true });
      batch.update(customerRef(d.id), Object.fromEntries(PRIVATE_FIELDS.map(k => [k, deleteField()])));
      events.forEach(e => { if ('by' in e.data()) batch.update(e.ref, { by: deleteField() }); });
      await batch.commit();
    } catch (err) {
      console.warn('Could not move private details for', d.id, err?.code || err);
      moving.delete(d.id);
    }
  }
}

export function watchCustomer(id, cb, onError) {
  return onSnapshot(customerRef(id), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), onError);
}

export function watchEvents(cid, cb, max = 30, onError) {
  const q = query(collection(db, 'customers', cid, 'events'), orderBy('at', 'desc'), limit(max));
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export function watchStats(key, cb, onError) {
  return onSnapshot(statsRef(key), s => cb(s.exists() ? s.data() : {}), onError);
}

function incrementsOf(stats) {
  const out = {};
  for (const [k, v] of Object.entries(stats || {})) if (v) out[k] = increment(v);
  return out;
}

export async function addCustomer(id, data, joinEvent) {
  const { pub, priv } = splitPrivate(data);
  const batch = writeBatch(db);
  batch.set(customerRef(id), { ...pub, lastEventId: joinEvent.id });
  batch.set(privateRef(id), priv);
  batch.set(eventRef(id, joinEvent.id), joinEvent.data);
  batch.set(statsRef(monthKey(data.createdAt)), { newCustomers: increment(1) }, { merge: true });
  await batch.commit();
}

export async function updateCustomer(id, fields) {
  const { pub, priv } = splitPrivate(fields);
  const batch = writeBatch(db);
  if (Object.keys(pub).length) batch.update(customerRef(id), pub);
  if (Object.keys(priv).length) batch.set(privateRef(id), priv, { merge: true });
  await batch.commit();
}

export async function deleteCustomer(id) {
  // Remove the visit history first, then the customer.
  const events = await getDocs(collection(db, 'customers', id, 'events'));
  const batch = writeBatch(db);
  events.forEach(d => batch.delete(d.ref));
  batch.delete(privateRef(id));
  batch.delete(customerRef(id));
  await batch.commit();
}

// Read the customer (and optionally one event), let fn decide the changes, write them atomically.
export function transact(cid, fn, opts = {}) {
  return runTransaction(db, async tx => {
    const cSnap = await tx.get(customerRef(cid));
    if (!cSnap.exists()) throw new Error('customer-missing');
    let event = null;
    if (opts.eventId) {
      const eSnap = await tx.get(eventRef(cid, opts.eventId));
      if (eSnap.exists()) event = { id: eSnap.id, ...eSnap.data() };
    }
    const r = fn({ customer: { id: cSnap.id, ...cSnap.data() }, event });
    tx.update(customerRef(cid), r.patch);
    if (r.newEvent) tx.set(eventRef(cid, r.newEvent.id), r.newEvent.data);
    if (r.eventPatch && event) tx.update(eventRef(cid, event.id), r.eventPatch);
    const inc = incrementsOf(r.stats);
    if (Object.keys(inc).length) tx.set(statsRef(r.statsMonth || monthKey(Date.now())), inc, { merge: true });
    return r;
  });
}

// ---------- staff login ----------
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

export function onAuth(cb) {
  return onAuthStateChanged(auth, u => cb(u ? { email: u.email } : null));
}

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function signOut() {
  return fbSignOut(auth);
}

// Firebase only allows a password change right after the user proves the current password.
export async function changePassword(current, next) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('not signed in'), { code: 'auth/no-current-user' });
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  await updatePassword(user, next);
}

// Emails a reset link (sent by Firebase) to the staff address.
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email.trim());
}
