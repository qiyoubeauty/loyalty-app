# 💅 Pedicure Loyalty — PWA stamp card

A pastel, mobile-first loyalty stamp card for a pedicure shop.

- **Customers** get a personal card link (by WhatsApp or QR). They tap *Add to Home Screen* and it works like an app, with no app store download.
- **Staff** search a customer, tap **Add stamp**, and redeem rewards when they're unlocked.
- **Free to run**: GitHub Pages hosts the app and Firebase (free Spark plan) stores the data.
- **3 languages**: English, Bahasa Melayu and 中文. Each person picks their own.

| Page | URL |
|---|---|
| Customer card | `https://riekie3.github.io/pedicure-loyalty/?c=<card-code>` |
| Staff app | `https://riekie3.github.io/pedicure-loyalty/staff.html` |

> Until Firebase is connected the app runs in **demo mode**. Everything works, but data is saved only in that one browser, with sample customers so you can try it out.

---

## Features

**Customer card**
- Stamp grid with gift slots at each reward, a progress bar and "3 more to …" text
- Reward status (ready to claim / claimed / stamps to go), recent visits, stamp expiry date
- Shop info: address with a Maps link, opening hours, WhatsApp, Instagram
- Installable (PWA) and opens offline with the last saved stamps

**Staff app**
- Search by name, phone number (any part of it) or member code
- New customer: name, phone, PDPA consent, and the first stamp in one step. Then send the card link by WhatsApp, QR code or copied link
- Add stamp, with the amount spent if your rule needs it. A daily-limit warning stops double stamping
- Redeem rewards. Redeeming the biggest reward completes the card and starts a new one (extra stamps carry over)
- **Undo** any action within 10 minutes, plus a manual *Adjust stamps* for corrections
- Full visit history per customer, showing who did what and when
- Dashboard: visits, stamps, rewards, new customers and spend per month; rewards waiting to be claimed; most loyal customers; lapsed customers with a one-tap WhatsApp reminder
- Export all customers to CSV (opens in Excel) for backups

**Settings (all editable in the staff app, no code changes)**
- Shop name, tagline, logo, theme colour, address, hours, WhatsApp, Instagram
- Rewards: add, edit or delete them; set the stamps needed; name them in EN, BM and 中文; switch each one on or off
- Stamp rule, one of:
  - every visit = 1 stamp
  - 1 stamp per visit with a minimum spend
  - 1 stamp for every RM X spent
  - plus a maximum number of stamps per customer per day
- Stamp expiry: never, or after N days / weeks / months without a new stamp

---

## One-time setup (about 15 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. **Create a project**. Name it e.g. `pedicure-loyalty`. Google Analytics isn't needed, so switch it off.
3. You stay on the free **Spark** plan. No credit card is needed.

### 2. Turn on the database
1. In the left menu go to **Build → Firestore Database → Create database**.
2. Location: **asia-southeast1 (Singapore)**. It's the closest to Malaysia, and **it can't be changed later**.
3. Choose **Production mode** and click **Create**.
4. Open the **Rules** tab. Delete everything there and paste the whole content of [`firestore.rules`](firestore.rules).
5. In the pasted rules, replace `CHANGE-ME@example.com` with the staff login email (lower-case), then click **Publish**.

### 3. Turn on staff login
1. Go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Email/Password → Enable → Save**.
3. Under **Users**, click **Add user**. Enter the same email as in the rules and a strong password.
4. Under **Settings → Authorized domains**, click **Add domain** and enter `riekie3.github.io`.
5. Under **Settings → User actions**, untick **Enable create (sign-up)** and save. Nobody else can then create accounts.

### 4. Connect the app to Firebase
1. Click ⚙ **Project settings → General → Your apps**, then the **`</>` (Web)** icon.
2. Give it a nickname, e.g. `loyalty-web`. Leave "Firebase Hosting" unticked. Click **Register app**.
3. Copy the values inside `firebaseConfig` into [`js/config.js`](js/config.js), then commit.
   (The `apiKey` here is **not a secret**. It's safe in a public repo because the security rules are what protect the data.)

### 5. GitHub Pages
Go to the repo **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, set the branch to `main` and the folder to `/ (root)`, then click **Save**.
About a minute later the site is live at `https://riekie3.github.io/pedicure-loyalty/`.

### 6. First login
Open `…/staff.html` and log in with the staff account. The default settings are created automatically. Then go to **Settings** and set your shop name, logo, colour and rewards.

---

## Daily use

| Situation | What staff do |
|---|---|
| New customer | **+** → name, phone, tick consent → **Create card** → **WhatsApp** the link (or show the QR) |
| Returning customer | Search the name or last digits of the phone → **Add stamp** |
| Gift unlocked (🎁) | Give the gift → **Redeem** |
| Mistake | Tap **Undo** in the message (within 10 min), or **Adjust stamps** |
| Customer lost their link | Open the customer → **WhatsApp** / **QR** to send it again |
| Monthly | Dashboard → **Export customers** → save the CSV to Google Drive as a backup |

---

## Free plan limits (you won't come close)

| | Firebase Spark free limit | ~150 customers / month |
|---|---|---|
| Reads | 50,000 / day | a few hundred |
| Writes | 20,000 / day | ~20–40 |
| Storage | 1 GB | a few MB after years |

GitHub Pages allows 1 GB of files and ~100 GB of traffic a month. This app is under 1 MB.

No credit card is on file, so there can never be a bill. If a limit were ever hit, the app would simply pause until the next day.

---

## Project structure

```
index.html            customer card page (opened via ?c=<card-code>)
staff.html            staff app
css/app.css           all styles (pastel theme; accent colour comes from Settings)
js/config.js          Firebase settings (demo mode until filled in)
js/logic.js           stamp / reward / expiry rules (pure functions)
js/db.js              picks the Firebase or demo backend
js/db-firebase.js     Firestore + Auth
js/db-demo.js         localStorage backend with sample data
js/i18n.js            English / BM / 中文 text
js/ui.js              icons, toasts, dialogs, stamp grid
js/card.js            customer card page
js/staff.js           staff app
sw.js                 service worker (offline + fast loading)
manifest-*.webmanifest  PWA manifests (card + staff)
firestore.rules       database security rules
```

### Data model (Firestore)

- `settings/main`: shop profile, rewards, stamp rule, expiry (public read)
- `customers/{cardCode}`: name, phone, current stamps, redeemed rewards on this card, totals (read only by someone who has the card link; listed only by staff)
- `customers/{cardCode}/events/{id}`: history (join / stamp / redeem / adjust), each with an undo snapshot
- `stats/{YYYY-MM}`: monthly counters for the dashboard (staff only)

### Run locally
Any static file server works, e.g. `npx serve .`, then open `http://localhost:3000/staff.html`.
If `js/config.js` isn't filled in, it runs in demo mode.
