---
name: bizdyali-darija-localization
description: Localize the BizDyali Moroccan business platform into natural Arabic-script Darija. Use for any Darija translation, glossary, or Arabic-copy work inside /home/papillion/bizdyali/. Builds on the general arabic-darija-translator skill (sentence-level idiom and pitfalls) and overrides it with product tone, terminology, and software-safety rules.
---

# BizDyali Darija Localization

## Relationship to the general skill

The general `arabic-darija-translator` skill remains the authority on
**sentence-level** Darija: idiomatic equivalents, religious-connotation
judgment, regional variants, gender/negation grammar, MSA-vs-Darija and
neighbor-dialect guards. Consult it for any single-sentence doubt.

This skill **overrides** it wherever they conflict:

| Conflict | General skill says | BizDyali rule (wins) |
|---|---|---|
| UI script | Prefer Latin transliteration for UI/app | **Arabic script is primary.** Arabizi only as a secondary aid, never shipped UI |
| Verbosity | Ultra-concise, no explanations | Glossary entries carry a 1-line Why; marketing adaptations carry a 1-line note |
| Register | Ask user for registre each time | Default register is fixed (see Tone) — do not ask per string |
| Output format | Triple-line arabe/translittération/FR per sentence | Ship **Arabic-script value only**; log the FR source as a code comment or glossary row |

Do not modify the general skill for project needs. If it contains an outright
linguistic error, flag it — otherwise extend here.

## Tone (fixed register — do not ask)

Modern, trustworthy, professional, warm, simple, distinctly Moroccan.
The reader is an ordinary Moroccan business owner (Laayoune to Tangier),
not a student and not a CEO.

- Write like a polished Moroccan digital product (think Glovo/Yassir MA tone).
- Second person, warm imperative for buttons: `زيد`، `سجّل`، `كمّل`، `شوف`.
- Success = past-tense verb + ✓ (`تسجّل ✓`); errors open soft (`كاين شي مشكل:`).
- Marketing is **adapted, not translated**: keep the promise, rewrite the
  sentence. Keep natural loanwords (`أونلاين`، `الكونت`، `البرودوي`، `فابور`).
- Never: MSA stiffness (`يرجى`، `قم بـ`، `مجاني`) · word-for-word calques ·
  French-heavy sentences · slang overload · childish diminutives ·
  machine-translation filler.

## Terminology — the glossary is law

`DARIJA-GLOSSARY.md` (repo root) is the persistent source of truth. Rules:

1. Use glossary wording **verbatim** for recurring concepts. No synonyms.
2. Missing concept → add it to the glossary first (with a Why note), then use it.
3. Never "improve" a glossary entry inside a translation pass — propose the
   change to the glossary instead, so all surfaces stay consistent.
4. `BizDyali`, `WhatsApp`, `Facebook`, `Instagram`, `QR` are never translated.

## String inventory (localize everything, miss nothing)

Surfaces and their string sources:

| Surface | Where strings live |
|---|---|
| Public page UI (badges, buttons, gallery, hours) | `js/i18n.js` `STRINGS` table (~35 keys; current `ar` column is MSA — it is the translation target, key by key) |
| Homepage marketing | `index.html` (hero, features, how-it-works, services, pricing, footer) |
| Wizard (6 steps) | `create.html` + validation messages in `js/wizard.js` (`Please enter…`, confirm-empty-publish) |
| Owner dashboard | `dashboard.html` + lifecycle banners in `js/dashboard.js` (trial/active/expired/disabled/draft states) |
| Auth | `auth.html` + `js/store.js` auth errors |
| Admin (platform, internal) | `admin.html` — Darija optional here; owner-facing tone matters less. Localize only if asked |
| Platform states | `b.html` directory / not-found / unavailable + `poweredBy`-style attribution |
| System messages | `js/store.js` errors, `js/dashboard.js` confirmations, empty states |

Workflow: **glossary deltas → `i18n.js` `ar` column → page copy → marketing
adaptation**. Marketing last, because it needs the glossary stable first.

## Technical preservation rules (functionality first)

Never translate or alter:

- i18n **keys** (`openNow`, `orderBar`…), only their values.
- **Placeholders**: `{name}` `{n}` `{a}` `{b}` `{t}` `{total}` — keep exact,
  keep position natural in the Darija sentence.
- HTML tags, attributes, `dir`/`lang`, CSS classes, `data-*` attributes.
- JS identifiers, function names, object paths, storage keys.
- URLs, slugs (`b.html?slug=…`), emails, numbers, `100 MAD/month` inside logic.
- Emoji/✓ markers unless the string is fully rewritten (then re-add deliberately).
- The `en`/`fr` columns in `i18n.js` — Darija work touches the `ar` column
  (and hardcoded Arabic copy) only.

Also preserve: `dir="rtl" lang="ar"` behavior (`BizI18n.dirOf`, `render.js`
already switches fonts to the Arabic stack + RTL for `ar` — no font/CSS
changes needed for Darija); `waLink`/`mapsLink` messages (owner-composed,
out of scope); zero-`BizDyali`-branding rule on business pages stays.

## Verification (standing project bar)

- Full render pass: public page + wizard + dashboard at 390px and 1440px,
  RTL, no clipping/overflow (`scrollWidth <= innerWidth`).
- Zero console errors (CDP harness, real browser — never synthetic-only).
- Placeholder check: every localized string with `{x}` still contains it.
- Key-parity check: `ar` column has exactly the keys of `en` (no missing,
  no extra).
- Read every localized screen aloud-test: does it sound like a Moroccan
  product, not a textbook? Fix calques before shipping.
- Commit + push to `main` when green.

## Worked mini-examples

- EN `Open now` → `حال دابا` (badge-short, verb, not `مفتوح الآن`).
- EN `Publish my page — start 14 free days` → `نشر الصفحة ديالي — بدا بـ14 يوم فابور`
  (keeps structure, swaps "free" → `فابور`, "start" → `بدا`).
- EN validation `Please enter your business name.` → `كتب سمية المشروع ديالك.`
  (verb-first, no `من فضلك`, `سمية` per glossary).
- EN `Your page has no products or services yet` →
  `الصفحة ديالك ما زال ما فيها لا برودويات لا خدمات`
  (double-negative is correct Darija emphasis, not an error).
