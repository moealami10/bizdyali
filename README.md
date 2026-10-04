# BizDyali — Your business, online.

BizDyali is a platform that lets local business owners create and manage their own
professional online presence — no designer, developer, or technical knowledge needed.
A business owner enters their information, adds products or services with photos and
prices, publishes a page, and shares one professional link with customers.

**Live site:** https://moealami10.github.io/bizdyali/

## Business model

- **Business page:** 14 days free, then **100 MAD/month** to stay publicly visible.
- **Social Media Setup:** **300 MAD one-time** — Facebook + Instagram presence configured for the business (enquiries via WhatsApp contact buttons).
- **Advertising Management:** **500 MAD / 2 weeks or 1,000 MAD / month** (management only — **ad budget is paid separately** by the business).

> Payments, ad-buying, and social-account creation are priced and positioned, not built yet.

## User flow

`Homepage → Create account → 5-step page creator → Preview → Publish (trial starts) → Owner dashboard (edit anytime, share link) → Public customer page`

The platform owner monitors everything from the Admin dashboard.

## Pages

| Page | File | What it does |
|---|---|---|
| Homepage | `index.html` | Hero, features, How It Works, services, pricing, FAQ, final CTA |
| Auth | `auth.html` | Owner sign-in via WhatsApp code (mock on localhost; Supabase in prod — see `docs/AUTH.md`) |
| Page creator | `create.html` | 5-step wizard: info → branding → products/services → preview → publish (autosaving drafts, empty-catalog guard) |
| Owner dashboard | `dashboard.html` | Trial status banner, edit info/branding/catalog, copy & share link, owner preview |
| Public business page | `b.html?slug=…` | Cinematic hero, adaptive catalog (menu/editorial/grid/compact), photo lightbox, sticky contact bar, SEO + LocalBusiness schema |
| Admin dashboard | `admin.html` | Stats, business search/manage, trial extension, suspend/unpublish, two-step delete, trials board, activity log |

## Data & states

All data lives in `localStorage` (per-browser prototype, no backend yet): users,
businesses (each fully independent), sessions, drafts, activity log, admins.
Page status is derived: `draft → trial → expired`, plus `subscribed` (paid
placeholder) and `suspended` (admin-disabled). Each business gets a unique URL slug.
Expired/suspended pages show an unavailable notice — owner data is never lost.

## Tech

Vanilla HTML/CSS/JS — zero frameworks, zero build step, deploys as static files.
Design system: bright ivory, confident jade green, warm gold; Fraunces + Inter type;
20 vendored Lucide icons; bespoke accessible lightbox. Verified with Playwright +
jsdom suites (320–1440 viewport matrix, clipping/overflow/counter/keyboard/RTL checks).

## Admin access

Restricted to a single allowlisted owner email, with memory-only sessions
(re-login on every visit). See `js/store.js` (`BOOTSTRAP_ADMIN_EMAIL`).

## Known limitations (prototype)

- Data is per-browser; production needs a backend (also for real auth enforcement).
- Demo content ships seeded; large videos/photos count against ~5MB browser storage.
- Service CTA WhatsApp number is a placeholder (`TODO` in `index.html`).
- A real-device iOS check (safe-area, toolbar dynamics) is still recommended.
