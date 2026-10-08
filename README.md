# nale eth shirt

A production-ready, mobile-first web app where teammates in an office pick tomorrow's shirt colour so nobody twins ("First come, first dressed. No twins allowed!").

Built with **Node 18+**, **Express 4**, **MongoDB (official driver, Atlas)**, and plain static HTML/CSS/JS with zero build steps or frontend frameworks. Features live updates via **Server-Sent Events (SSE)**, 20s polling fallback, refresh on tab focus, playful sticker styling, PWA offline capability, and atomic race-free claim logic.

---

## 🎨 Design & Aesthetic

- **Playful sticker style**: Thick ink borders (`2.5px` elements, `3px` cards), hard offset shadows (`3px 3px 0` items, `7px 7px 0` cards), rounded pills (`99px`), swatch tiles (`20px`), pressed states (`translate(3px, 3px)`).
- **Typography**: `Bagel Fat One` for headings, `DM Sans` (500 / 700) for body, with system fallbacks.
- **Color tokens**:
  - **Light**: `bg #d9d3ff`, `surface #ffffff`, `ink #17142b`, `muted #5b5680`, `pop #ff4f8b`, `mint #2fd39a`, `sun #ffd84a`, `shadow #17142b`.
  - **Dark** (`prefers-color-scheme: dark` or manual toggle): `bg #17142b`, `surface #241f42`, `ink #f4f1ff`, `muted #a9a3d6`, `shadow #000000`.
- **Top row**: Two tilted pills:
  - Left (sun yellow, rotate -2deg): `"For <Weekday, D Mon>"` showing tomorrow's date.
  - Right (mint, rotate 2deg): `"X of Y ready"`.
  - Theme toggle pill for quick light/dark preview.
- **Clothesline**: Horizontally scrollable row with a dashed 3px ink line across the top. Each teammate is an 88px SVG hanging shirt (collar and 3 buttons) pinned with a pink peg. Shirts sway gently (`rotate -4deg to 4deg, 3.6s alternate, staggered delays`). Current user has a yellow highlight. Unpicked shirts have dashed outlines.
- **Responsive 10-colour grid**:
  - Navy (`#1f3a68`), White (`#f4f4f1`), Sky blue (`#8fc1e8`), Black (`#1c1c1e`), Grey (`#9a9fa6`), Olive (`#6b7a46`), Maroon (`#7a2336`), Pink (`#ff8fb3`), Lavender (`#b9a6e0`), Beige (`#d9c3a0`).
  - Taken tiles get diagonal stripes and faded swatches; tapping shakes the tile and shows a witty alert with the holder's name.
  - Claiming a colour fires a confetti burst (22 small bordered squares in palette colors).
  - Current pick turns mint with `"Yours!"`.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js 18+ (tested on Node 22)
- npm 9+

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(If `MONGODB_URI` is omitted during local development, the app automatically runs in built-in in-memory MongoDB mode with full unique index and atomic upsert support!)*

### 4. Start the application
```bash
npm start
```
Visit `http://localhost:3000` in your browser.

### 5. Test Multiple Users
- **Option A (URL Tokens in side-by-side tabs)**:
  - Tab 1: `http://localhost:3000/?token=alice` (Join as Alice)
  - Tab 2: `http://localhost:3000/?token=bob` (Join as Bob)
  Watch Server-Sent Events update live on both screens when either user picks a colour!
- **Option B (Seed Script)**:
  Run `npm run seed` in a separate terminal while the server is running to instantly populate 5 teammates (Meera, Rohan, Vikram, Alice, Arjun).
- **Option C (Incognito / Different Browsers)**:
  Open one regular window and one Incognito / Private window to get two isolated user sessions.

---

## 🧪 Testing

The test suite runs with Node's native test runner (`node:test`):

```bash
npm test
```

### What is tested:
1. **Atomic Concurrency & Claiming (`test/claim.test.js`)**:
   - Two teammates simultaneously claim the exact same colour at the exact same millisecond: **only one succeeds (200)** and the other receives a conflict **(409 `{ error: "taken", by: name }`)**.
   - Changing own pick frees the old colour for others.
   - Clearing pick (`DELETE /api/pick`) removes claim.
   - Case-insensitive name uniqueness rejection (`409`).
2. **Smoke & Endpoint Tests (`test/smoke.test.js`)**:
   - `GET /healthz` returns `200` with status, uptime, and timestamp.
   - `GET /api/palette` returns the 10 official colours.
   - `GET /api/state` returns structured state (`day`, `needCode`, `me`, `members`).
   - `POST /api/join` sanitizes input, validates lengths, and verifies optional `TEAM_CODE` using constant-time comparison (`crypto.timingSafeEqual`).
   - `POST /api/leave` cleans up member and their claims.
3. **Viewport & Responsive Verification**:
   - Verified at **360px** (mobile), **768px** (tablet), and **1280px** (desktop) across both **Light** and **Dark** modes.
   - Verified zero horizontal overflow on mobile, safe-area insets, and `prefers-reduced-motion` compliance.

---

## 🛡️ Production Hardening & Architecture

- **No Read-then-Write Races**:
  Changes to colour are performed with **one atomic upsert** on `{ day, memberId }`. Because the `claims` collection has a unique compound index on `{ day, color }`, MongoDB's engine atomically rejects duplicate claims with error code `11000`.
- **Identity & Security**:
  - Browser creates a random UUID token in `localStorage` and transmits it in the `X-Token` header.
  - Server stores **only its SHA-256 hash** (`tokenHash`). Raw tokens are never logged or stored.
  - Constant-time verification for `TEAM_CODE` via `crypto.timingSafeEqual` prevents timing attacks.
  - `helmet` security headers with Content Security Policy (CSP).
  - `compression` for gzip transmission.
  - `express-rate-limit` limits join attempts (~30/hour/IP).
  - Body limit enforced to `2kb`.
  - All client rendering uses `textContent` and DOM nodes — **never `innerHTML`** — eliminating XSS vectors.
  - Graceful shutdown handles `SIGTERM` and `SIGINT` (closes SSE connections, HTTP server, and DB pool).
  - Centralized error handler masks all internal error details behind clean 500 responses.

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Optional | `3000` | Port for Express server (automatically set on Render/Railway). |
| `NODE_ENV` | Optional | `development` | Environment mode (`production`, `development`, `test`). |
| `MONGODB_URI` | **Required in Prod** | In-memory fallback | MongoDB connection string (Atlas or local). |
| `TEAM_CODE` | Optional | `""` | Optional password teammates must enter when joining. |
| `TZ_NAME` | Optional | `Asia/Kolkata` | IANA timezone used to calculate tomorrow's date. |

---

## ☁️ Deployment Guide

### Deploying to MongoDB Atlas
1. Create a free M0 cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Under **Security > Database Access**, create a user with read/write privileges.
3. Under **Security > Network Access**, add `0.0.0.0/0` (allow access from anywhere) so cloud hosts can connect.
4. Click **Connect > Drivers > Node.js** and copy your connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/nale_shirt?retryWrites=true&w=majority
   ```
5. All indexes (unique `{ day, color }`, unique `{ day, memberId }`, unique `{ tokenHash }`, unique `{ nameLower }`, and 3-day TTL `{ createdAt }`) are automatically created on server startup!

---

### Deploying to Render
1. Push this repository to GitHub or GitLab.
2. Sign in to [Render](https://render.com) and click **New + > Web Service**.
3. Select your repository.
4. Configure service settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Under **Environment Variables**, add:
   - `MONGODB_URI`: `<Your MongoDB Atlas connection string>`
   - `TZ_NAME`: `Asia/Kolkata` (or your office's timezone)
   - `TEAM_CODE`: *(optional secret team code)*
   - `NODE_ENV`: `production`
6. Under **Advanced**:
   - Set **Health Check Path** to `/healthz`.
7. Click **Create Web Service**. Render will build and deploy the app with zero-downtime healthcheck monitoring!

---

### Deploying to Railway
1. Sign in to [Railway](https://railway.app) and select **New Project > Deploy from GitHub repo**.
2. Select your repository.
3. Under **Variables**, add:
   - `MONGODB_URI`: `<Your MongoDB Atlas connection string>`
   - `TZ_NAME`: `Asia/Kolkata`
   - `TEAM_CODE`: *(optional)*
   - `NODE_ENV`: `production`
4. Railway will automatically detect Node.js, run `npm install`, and launch `npm start` on the allocated `$PORT`.

---

## 📱 PWA Features

- Registered service worker (`/sw.js`) caches the application static shell for instant loading.
- Never caches `/api/*` or SSE streams.
- Full offline detection: displays a friendly sticker offline banner (`"Cannot reach the server — Check your connection. Retrying..."`) and automatically recovers when connectivity returns.
- Manifest and icons (`192x192`, `512x512`, and SVG) configured for installation on iOS and Android home screens.

---

## 📄 License

MIT
