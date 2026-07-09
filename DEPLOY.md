# Deploy

The Diagram Evolver is a **static, browser-only PWA**: `npm run build` emits a self-contained
`dist/` (HTML + one content-hashed JS bundle + a hand-rolled service worker + manifest + icons).
There is no backend. Any static host that serves the site **at the domain root over HTTPS** works.

Three root-serving hosts are pre-configured. Pick one — you connect the account and publish; no
deploy step is automated here.

## Why the settings matter (all hosts)

- **Served at the root.** The service worker precaches absolute paths (`/sw.js`, `/assets/…`,
  `/manifest.webmanifest`). The app must live at `https://<host>/`, not under a sub-path. All three
  hosts below serve at the root by default, so there is nothing to configure and no Vite `base` to
  change.
- **HTTPS is required.** Service workers only register over HTTPS (or `localhost`). Every host below
  provisions HTTPS automatically.
- **Cache headers are the correctness core** (already written into the config files):
  | Path | Cache-Control | Why |
  |---|---|---|
  | `/sw.js` | `no-cache` | A redeploy's new service worker must always be fetched so it supersedes the old one. Never long-cache the SW. |
  | `/index.html`, `/` | `no-cache` | The HTML references a new hashed JS filename each build; it must be picked up immediately. |
  | `/manifest.webmanifest` | `no-cache` + MIME `application/manifest+json` | Small, may change; served with the correct type. |
  | `/assets/*` | `public, max-age=31536000, immutable` | Filenames are content-hashed ⇒ bytes never change ⇒ cache forever. This is the payoff of the hashed names. |
  | `/icons/*` | `public, max-age=604800` (1 week) | Stable names, safe to cache, occasionally replaced. |
- **First load caches the app shell; later loads work offline.** After the first visit the SW holds
  the shell; subsequent visits (including offline) are served from cache, and a redeploy is picked
  up because the SW and HTML are `no-cache`.

Build command: **`npm run build`** · Output/publish directory: **`dist`** — everywhere.

---

## Netlify

Config: `netlify.toml` (build command, publish dir, and headers — canonical). Netlify also honors
`dist/_headers`; both are kept identical.

1. Push this repo to GitHub.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Netlify reads `netlify.toml`, so the build command (`npm run build`) and publish dir (`dist`)
   are already filled in. Leave them.
4. **Deploy.** You get an `https://<name>.netlify.app` URL with HTTPS.

Drag-and-drop alternative: run `npm run build` locally and drop the `dist/` folder onto Netlify's
**Deploys** page. The `dist/_headers` file carries the cache rules in that path too.

## Vercel

Config: `vercel.json` (build command, output directory, and headers).

1. Push this repo to GitHub.
2. Vercel → **Add New… → Project** → import the repo.
3. Vercel auto-detects Vite; `vercel.json` pins the build command (`npm run build`) and output
   directory (`dist`) explicitly. Leave the detected framework as-is.
4. **Deploy.** You get an `https://<name>.vercel.app` URL with HTTPS.

## Cloudflare Pages

Config: `dist/_headers` (copied from `public/_headers` by the build). Cloudflare Pages has **no
config file for build settings** — set them in the dashboard.

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Framework preset: **None** (or Vite). Set **Build command** = `npm run build`, **Build output
   directory** = `dist`.
4. **Save and Deploy.** You get an `https://<name>.pages.dev` URL with HTTPS. Cloudflare applies the
   cache rules from `dist/_headers`.

---

## After deploying

- Visit the URL, hard-reload once, then go offline and reload — the app should still load (SW shell
  cache).
- To ship an update: push to the connected branch (or re-drop `dist/`). The `no-cache` HTML + SW
  guarantee the new hashed bundle is picked up on the next visit; the SW's `activate` purges the old
  version's cache.
