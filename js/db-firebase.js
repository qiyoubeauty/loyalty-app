// Firebase (Firestore + Authentication) backend.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, orderBy, limit, onSnapshot, setDoc, updateDoc,
  runTransaction, writeBatch, getDocs, increment,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
  setPersistence, browserLocalPersistence,
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

export function watchSettings(cb, onError) {
  return onSnapshot(settingsRef, s => cb(s.exists() ? s.data() : null), onError);
}

export function saveSettings(settings) {
  return setDoc(settingsRef, { ...settings, updatedAt: Date.now() });
}

export function watchCustomers(cb, onError) {
  return onSnapshot(collection(db, 'customers'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
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
  const batch = writeBatch(db);
  batch.set(customerRef(id), { ...data, lastEventId: joinEvent.id });
  batch.set(eventRef(id, joinEvent.id), joinEvent.data);
  batch.set(statsRef(monthKey(data.createdAt)), { newCustomers: increment(1) }, { merge: true });
  await batch.commit();
}

export function updateCustomer(id, fields) {
  return updateDoc(customerRef(id), fields);
}

export async function deleteCustomer(id) {
  // Remove the visit history first, then the customer.
  const events = await getDocs(collection(db, 'customers', id, 'events'));
  const batch = writeBatch(db);
  events.forEach(d => batch.delete(d.ref));
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
