# MathFlow

**Maths that flows.** A mobile-first, installable math-solving PWA with a local
exact-arithmetic engine, step-by-step explanations, interactive graphs, an
Arabic/English interface, dark mode, and optional (clearly separated) online
image recognition.

Unlike Photomath, MathFlow has its own identity: a midnight-blue shell, teal
flowing wave mark, warm-cream canvas, topic library and a workspace-style
layout. All maths runs **in your browser** — no cloud solver, no account, no
tracking.

---

## 1. Quick start

Requirements: **Node.js 20.19+** (22 LTS recommended) and npm.

```bash
npm install
npm run dev        # http://localhost:3000  (Vite dev server + API on ONE origin)
```

For a production-like run (installable PWA, service worker, offline mode):

```bash
npm run build
npm start          # http://localhost:3000
```

Then open the URL on your phone (over HTTPS or `localhost` for camera access),
or use **Settings → Install MathFlow** / your browser's "Add to Home Screen".

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Express + Vite middleware on one port; HMR, API proxying, no SW |
| `npm run build` | Typecheck → Vite production build → generate `dist/sw.js` |
| `npm start` | Production server: static `dist/` + `/api/*` OCR proxy |
| `npm test` | Full Vitest suite (math, UI, OCR, storage, PWA, server) |
| `npm run test:build` | Build, run all tests, check the generated SW/bundle |
| `npm run typecheck` | TypeScript only |
| `npm run icons` | Regenerate the PWA icons with pure Python |

---

## 2. What actually works

### Local maths engine (100% offline, no network calls)
- Exact rational arithmetic with `BigInt` — `1/2 + 1/3` is exactly `5/6`,
  never a rounded float. Order of operations, implicit multiplication (`2x`,
  `2(x+1)`), powers, negative/right-associative powers, roots, parentheses,
  Unicode maths (`×`, `÷`, `−`, `²`, `√`, `π`) and Arabic-Indic digits.
- Generated, **real** step-by-step solutions. Every printed step is produced
  by the computation itself (common denominators, expansion, collecting like
  terms, isolating the variable, the discriminant, factorisation, …). Results
  are verified independently — exact substitution for rational roots, numeric
  substitution otherwise — and failures are reported rather than hidden.
- Equations: constant equalities (`2+3×4=14`), linear and quadratic equations
  with exact rational/radical roots, repeated roots, no-real-root cases,
  identities (`0 = 0`) and contradictions.
- Higher-degree and non-polynomial equations are **not** claimed as exact:
  real roots are found numerically in `x ∈ [−20, 20]`, labelled approximate,
  verified, and shown on the graph.
- Simplification/expansion of polynomials in one variable and an exact
  power-rule derivative for polynomial expressions.
- Common functions for numeric evaluation and graphing: `sqrt`, `abs`, `sin`,
  `cos`, `tan`, `asin`, `acos`, `atan`, `ln`, `log`, `log2`, `exp`, `floor`,
  `ceil`, `round`, `sign`, plus `π`, `e`, `τ`.

### Interactive graphs
- Canvas renderer with pan (drag), zoom (wheel, pinch, buttons, double-click
  reset), adaptive grid/ticks, domain gaps (no false vertical lines at
  asymptotes), two curves for equations (`y = LHS`, `y = RHS`) and clickable
  useful points: roots/intersections, y-intercept and turning points.
- Points are computed numerically inside the current viewport and labelled as
  approximate. Works offline.

### Input
- Large math textarea with a four-tab touch keyboard (Basic, Fractions,
  Functions, Variables), caret-aware templates (`()/()`, `sqrt()`, `^`, …),
  backspace/clear, Enter to solve.
- Topic library with ~35 working examples grouped into eight topics, plus
  quick-example chips and recent problems.
- Camera capture (`getUserMedia`), image upload, draggable/resizable crop frame,
  retake, and an editable recognition-correction screen.

### Data & settings (persistent, local only)
- History with favourites, search, date groups, delete, clear, JSON export,
  copy/share (Web Share with clipboard fallback). Stored only in
  `localStorage` — never uploaded.
- Settings: English/Arabic with full RTL, light/dark/system theme, default
  step/graph visibility. Survives reloads and corrupted/quota-limited storage.
- Loading states, useful errors, offline banner, online/offline transitions,
  toasts, confirmation dialogs, keyboard accessibility and reduced-motion
  support.

### PWA / offline
- Generated service worker precaches **every** built asset (HTML, JS, CSS,
  fonts, icons, manifest) after the first successful load; navigation uses a
  network-first shell with a cached fallback; assets are cache-first.
- `/api/*` is always network-only and returns a clear offline error — cached
  or invented OCR results are impossible.
- Manual input, local calculations, graphs, history and settings all work with
  no connection. Image recognition requires internet **and** a configured
  provider; the UI says so and offers manual input instead.
- Installable manifest with 192/512/maskable icons and app shortcuts. Update
  prompt when a new build is detected.

---

## 3. OCR setup (secure, optional)

Scanning is **off until you configure a provider**. Without credentials the
server returns `503 ocr.notConfigured`, the app shows a clear explanation, and
manual input works normally. MathFlow never fabricates a recognition result.

```bash
cp .env.example .env
# edit .env, then restart the server
```

### Option A — Mathpix (default)

1. Create an account at <https://mathpix.com/ocr> and get an **App ID** and
   **App Key**.
2. Put them in `.env`:

   ```dotenv
   OCR_PROVIDER=mathpix
   MATHPIX_APP_ID=your_app_id
   MATHPIX_APP_KEY=your_app_key
   # OCR_ENDPOINT=https://api.mathpix.com/v3/text   # optional override
   ```

3. Restart `npm start` (or `npm run dev`). Settings → Image recognition should
   show **Ready (mathpix)**.

### Option B — any custom LaTeX-OCR service

Set `OCR_PROVIDER=custom`, `OCR_ENDPOINT` and `OCR_API_KEY`. The server sends:

```http
POST <OCR_ENDPOINT>
Authorization: Bearer <OCR_API_KEY>
Content-Type: application/json

{ "image": "data:image/jpeg;base64,...", "formats": ["latex"] }
```

and expects `200` JSON:

```json
{ "latex": "\\frac{1}{2} + x^2 = 0", "confidence": 0.93 }
```

`confidence` is optional (0–1 or 0–100). `http://` is allowed only for
`localhost`/`127.0.0.1`; production endpoints must use HTTPS. A minimal
reference implementation is in `tests/server.test.ts` (the mock upstream), and
`server/ocr.mjs` documents the request/response mapping.

### How keys are protected

- Credentials are read **only** in `server/*.mjs` from environment variables
  (`.env` is git-ignored). They are never imported into `src/`, never appear in
  the JS bundle, and are never returned by `/api/ocr/status`.
- The browser talks only to same-origin `/api/ocr`; the server adds the
  credentials and calls the provider. Upstream error bodies are never
  forwarded (they can contain account details); only short status logs are
  written.
- Images are validated (PNG/JPEG/WebP data URL, ≤ 8 MB by default), kept in
  memory for one request, and **never written to disk or logged**. No image or
  history is stored by default.
- `/api/ocr` has an in-memory rate limit (20 requests / 10 min per IP by
  default), a 25 s upstream timeout, a strict JSON body limit, and production
  security headers (CSP, `nosniff`, referrer, permissions policy).
- Low-confidence results and conversion warnings are shown to the user, who
  must confirm/correct the equation before solving.

---

## 4. Project layout

```
index.html                     App shell, manifest + meta
vite.config.ts                 Vite + Vitest config
server/
  index.mjs                    Express API + Vite middleware (dev) / static (prod)
  config.mjs                   Server-side env config (no secrets in client)
  ocr.mjs                      Image validation + provider adapter
scripts/
  build-sw.mjs                 Generates dist/sw.js with the precache list
  check-build.mjs              Bundle/SW smoke checks
  make-icons.py                Pure-Python PWA icon generator
public/
  manifest.webmanifest, favicon.svg, icons/*.png
src/
  App.tsx                      Shell, state, navigation, history, settings
  i18n.ts                      English + Arabic dictionaries
  styles.css                   Design system (RTL logical properties, dark mode)
  lib/math/                    Rational, parser, polynomial, numeric, graph, solver
  lib/{storage,ocr,share,pwa}.ts
  components/                  Icons, keyboard, graph canvas, result card, topics
  views/                       Solve, Graph, History, Settings, Scan
tests/                         Math, UI, OCR, storage, PWA, server integration
```

---

## 5. Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for VPS/systemd, Docker,
Render/Railway/Fly, Nginx + HTTPS, static-frontend + separate OCR backend,
and the environment-variable checklist. In short:

```bash
npm ci --omit=dev && npm run build   # build needs devDependencies, so build first
NODE_ENV=production PORT=3000 npm start
```

The Node process must stay running: it serves both the SPA and the OCR proxy.
Serve it over **HTTPS** (camera access and PWA installation require a secure
context). The SPA itself has no runtime backend dependency — if the server is
down after installation, cached maths still works.

---

## 6. Limitations (deliberate and explicit)

- **Exact symbolic solving** covers linear and quadratic equations in one
  variable with rational coefficients. Cubics, trig/log equations, equations
  with the variable in a denominator, systems of equations, inequalities,
  matrices, limits, integrals and complex-number arithmetic are **not**
  supported symbolically. Where possible MathFlow gives clearly labelled
  *approximate numerical* roots and a graph instead — it does not pretend.
- **Derivatives** are computed exactly only for polynomials (power rule).
- **Math notation** is plain text with Unicode rendering, not a full LaTeX or
  WYSIWYG stacked-fraction editor. Use `(a)/(b)` for fractions and `^` for
  powers. Multi-line OCR results use only the first line, with a warning.
- **Graphs** are sampled numerically: extremely steep functions, removable
  discontinuities or roots outside the visible window may be missed. Zoom/pan
  to inspect. Points are approximate.
- **OCR** quality depends entirely on the configured provider. Recognition can
  be wrong; the app always shows an editable correction step, confidence (when
  provided) and warnings. Nothing is auto-solved from a scan without the user
  pressing **Solve this**.
- **Offline OCR is impossible** by design: the image must reach the provider.
  The app explains this and falls back to manual input.
- **History is local to one browser** (no sync, no account). Clearing browser
  data removes it; use JSON export for a backup. Photos are never persisted.
- **Service worker** is registered only in production builds (`npm start`),
  not in `npm run dev`, so HMR stays predictable. Offline mode needs one
  successful online production load first.
- **Arabic** uses Western math notation (LTR) inside expressions and graphs,
  which is the conventional way to write maths; the surrounding UI is fully
  RTL.

---

## 7. Verification performed

```bash
npm run test:build     # 52 automated tests + bundle checks + production-bundle browser smoke
```

The suite (52 tests) covers the four required examples (`2+3×4=14`,
`1/2+1/3=5/6`, `2x+3=11 → x=4`, `x²−5x+6=0 → x=2 or 3`), parser edge cases,
exact rational arithmetic, radical/quadratic/transcendental handling, graph root finding,
LaTeX conversion, camera permission denial, OCR failure/not-configured/
offline/success flows, offline manual solving, history persistence after
remount, favourites, RTL/dark-mode persistence, PWA asset caching, and the
real production server + OCR proxy (including that credentials never reach the
browser).

---

## 8. Privacy summary

No analytics, no cookies, no account, no third-party font/CDN requests (fonts
are bundled). Calculations and history never leave the device. A photo leaves
the device **only** when you choose to scan, goes to your own server, then to
the OCR provider you configured, and is discarded immediately afterwards.
