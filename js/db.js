// Picks the storage backend. Both backends expose the same functions:
//   watchSettings(cb) saveSettings(settings)
//   watchCustomers(cb) watchCustomer(id, cb) watchEvents(id, cb, max)
//   watchStats(monthKey, cb)
//   addCustomer(id, data, joinEvent) updateCustomer(id, fields) deleteCustomer(id)
//   transact(customerId, fn, { eventId })   fn({ customer, event }) -> { patch, event?, eventPatch?, stats?, statsMonth? }
//   onAuth(cb) signIn(email, password) signOut() changePassword(current, next) resetPassword(email)
import { isDemo } from './config.js';

const backend = isDemo ? await import('./db-demo.js') : await import('./db-firebase.js');

export const mode = isDemo ? 'demo' : 'firebase';
export const {
  watchSettings, saveSettings,
  watchCustomers, watchCustomer, watchEvents, watchStats,
  addCustomer, updateCustomer, deleteCustomer, transact,
  onAuth, signIn, signOut, changePassword, resetPassword,
} = backend;
