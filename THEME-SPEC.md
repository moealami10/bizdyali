# BizDyali Theme Spec (draft — phase 1: foundations built, looks land in phase 2)

## New / extended data fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `biz.theme` | object | no | auto-derived | Owner/designer override block. Absent = everything automatic. |
| `biz.theme.look` | `editorial \| atelier \| boutique \| workshop \| market` | no | auto from `category` | Explicit look wins over category matching. |
| `biz.theme.accent` | `#rrggbb` | no | sampled, else look default | Owner-picked accent. Still AA-enforced for text. |
| `biz.theme.fontPair` | string (look key) | no | look default | Future: let owner swap pairings. Not read yet. |
| `biz.lang` | `en \| fr \| ar` | no | auto-detected | Detects Arabic script ratio, else French markers, else English. |
| `biz.hoursWeek` | `{ mon: [[open, close], …], … }` | no | null → free-text `hours` | Phase 2: powers the live "Open now" badge. `"HH:MM"` 24h, business tz. |
| `item.section` | string | no | null | Phase 2: groups catalog into sections / filter chips. |
| `item.badge` | `popular \| new` (or free text) | no | null | Phase 2: tasteful badge; never invented by the platform. |
| `item.duration` | string (e.g. `"45 min"`) | no | null | Service duration, shown beside the price. |
| `item.section` | string | no | null | (already listed above; groups catalog + filter chips) |
| `biz.testimonials` | `[{text, author?}]` (max 3 shown) | no | none → section hidden | Owner-entered quotes only; never fabricated. |
| `biz.trust` | string[≤4] | no | none → hidden | Workshop trust strip (warranty, turnaround…). |
| `biz.theme.basket` | boolean | no | off | Experimental WhatsApp order basket. |
| `biz.theme.mode` | `light \| dark` | no | light | Dark surfaces (Atelier). |
| photo focal | `{ src, fx, fy }` (`fx/fy` 0–100) | no | `{src, 50, 50}` | Legacy plain-string photos keep rendering unchanged. Applied as `object-position`. |

All fields are optional. Old businesses (plain-string photos, no `theme`/`lang`) render exactly as today — verified by the legacy smoke test.

## Look defaults (accent · display / body)

| Look | Categories | Accent | Display | Body |
|---|---|---|---|---|
| `editorial` | cafés, restaurants, bakeries, default | `#0A6B4F` jade | Fraunces | Inter |
| `atelier` | salon, barber, beauty, spa | `#8A6D3B` brass | Playfair Display | Jost |
| `boutique` | clothing, shoes, jewellery, artisan | `#B08D57` champagne | Fraunces | Inter |
| `workshop` | repair, electronics, auto, home | `#C2410C` burnt orange | Archivo | Archivo |
| `market` | grocery, hanout, traiteur | `#D97706` amber | **Nunito** | **Nunito** |

Arabic (max 2 families): display roles → **Noto Naskh Arabic**, UI roles → **IBM Plex Sans Arabic**.

## Auto-theme rules (`js/theme.js`)

1. Sample cover (else logo) at 32×32; ignore near-black/white/grey pixels; dominant hue bin must hold ≥8% of chromatic weight or fall back.
2. **Fallback to the look default** when: average chroma < 0.05, hue in harsh magenta-purple (278–335°) or bilious yellow-green (80–115° at high chroma), sampling fails (CORS/taint/offline), or no imagery exists.
3. Accent aims L 0.42–0.62 in OKLCH at the owner's hue; then lightness is nudged until white-on-accent ≥ 4.5 **and** accent-on-paper ≥ 4.5 (max 20 steps each, else fallback). Emitted tokens: `--t-accent/--t-accent-ink/--t-accent-text/--t-tint/--t-hairline/--t-deep` + on-ratio diagnostics.
4. `theme.accent` owner override is respected but still contrast-nudged.

## Font budget (measured, self-hosted `/fonts`, `font-display:swap`)

Per look, latin (+latin-ext where French needs it); the browser only fetches subsets matching page characters:

| Look | EN page | FR page |
|---|---|---|
| Editorial / Boutique (Fraunces+Inter) | 112 KB | **189 KB** (latin-ext French-subsetted with pyftsubset) |
| Atelier (Playfair+Jost) | 57 KB | 98 KB |
| Workshop (Archivo) | 87 KB | 170 KB |
| Market (Nunito) | 38 KB | 72 KB |
| Arabic add-on (Naskh display **or** Plex UI) | +91 / +81 KB | same |

## What the dashboard/wizard must add (phase 3 Owner flows)

- Theme picker: look (5, with live preview), accent (auto/sampled/custom), font-pair swap. Writes `biz.theme`.
- Focal-point picker per photo: writes `{src, fx, fy}` (storage keeps legacy strings valid).
- `hoursWeek` editor (per-day open/close rows + "irregular hours" free-text escape hatch).
- `lang` override (Auto/EN/FR/AR), `item.section` + `item.badge` fields.
- IndexedDB migration checkpoint (later): move `thumb`/`full` blobs out of localStorage behind the same `BizDyali.media` API; keep reading legacy data URLs forever.

## Deferred / backend-blocked (documented, not faked)

- WhatsApp link-preview meta + hosted `og:image` need server rendering (hook: `updateSeo()` in `render.js`).
- Passwords/sessions remain prototype-grade until a backend exists.
