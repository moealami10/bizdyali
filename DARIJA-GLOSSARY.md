# BizDyali — Darija Glossary (source of truth)

All UI copy uses **Arabic-script Moroccan Darija** (Casa reference; understood
in Laayoune and everywhere in Morocco). French/English loanwords are kept where
Moroccans actually say them — never force an unnatural Arabic word.

**How to use this file:** check the `Use` column before applying any entry.

- 🔒 **Fixed** — use consistently whenever the concept appears. Never synonym-swap.
- 🔀 **Contextual** — preferred default, but the wording may change with the
  sentence. Read the Why/note and pick the variant that fits.
- 💬 **Example** — a useful phrasing for one specific string, not a rule.
  Do not substitute it into other sentences mechanically.

If a concept is missing, add it here first (with Use + Why) before using it.
Never "improve" an entry inside a translation pass — change the glossary so
all surfaces stay consistent.

Conventions: `فابور` = free · `دابا` = now · `ديال` = of/belonging to ·
`غـ` prefix = future · `تـ...ـت`/`تسـ` = passive.

## Context rules (read before translating)

BizDyali serves **physical shops AND service providers** (salons, artisans,
repair, freelancers). The language must never imply every user owns a shop.

1. **The abstract business = المشروع** (🔒). Name, description, category,
   dashboard, lifecycle — always المشروع, never المحل.
2. **المحل only for the physical place** (address, "find us", QR poster,
   "visit us" copy). A plumber has a مشروع but no محل customers visit.
3. **Prefer 2nd person over nouns for the owner.** UI speaks to "you"
   (`ديالك`، `نتا`) instead of naming "the owner". `مول المحل` appears only
   in shop-specific marketing, never as a UI label.
4. **Product vs. service tracks already exist in the UI** (wizard step 3,
   dashboard tabs). Respect the track: food/menu items lean طبق, goods lean
   برودوي, everything bookable is خدمة.
5. **Source copy that already covers both, keep both.** E.g. "photos of your
   shop, your work, your team" must stay dual ("المحل، خدمتك، الفرقة") —
   do not collapse it to shop-only.

## Core product concepts

| Concept | Darija | Use | Why |
|---|---|---|---|
| business (abstract entity) | المشروع | 🔒 | Neutral for shops AND services; "البيزنس" sounds childish in writing |
| physical shop / venue | المحل | 🔀 | Only where a physical place is meant (rule 2); never for the business itself |
| business page (the product) | الصفحة | 🔒 | "الصفحة ديال المشروع ديالك"; spoken "لا پاج" — never in UI |
| owner (UI label) | 2nd person (`ديالك`) | 🔒 | Rule 3: "شوفة خاصة بيك", not "معاينة المالك" |
| owner (shop marketing only) | مول المحل | 💬 | Warm + Moroccan, but shop-assuming — marketing copy for venues only |
| customer (sing./pl.) | الزبون / الزبناء | 🔒 | Fully naturalized; spoken "الكليان" — never in UI |
| product (goods, default) | البرودوي / البرودويات | 🔀 | What merchants say; "المنتج" is textbook |
| product (food/menu item) | الطبق / الأطباق | 🔀 | Restaurant/café track: "زيد طبق", not "زيد برودوي" |
| service (sing./pl.) | الخدمة / الخدمات | 🔒 | Native word, no change needed |
| category (business type) | النشاط | 🔒 | "شنو هو النشاط ديالك؟" — how Moroccans describe a trade |
| menu (restaurant) | المينيو | 🔒 | Universal loanword; "القائمة" reads MSA |
| price | الثمن | 🔒 | Moroccan word; "السعر" is MSA |
| prices (section, Pricing) | الأثمنة | 🔒 | Natural Darija plural |
| offer | العرض | 🔒 | Understood everywhere |
| promotion / promo | البرومو | 🔒 | The word on every Moroccan storefront; "ترويج" is MSA |
| order (generic) | الطلب | 🔀 | Neutral default |
| order (restaurant/café) | الكوموند | 🔀 | Borrowed "commande" — what staff and customers say |
| description (label) | الوصف | 🔒 | Neutral label; spoken "الديسكريپسيون" — never in UI |

## Contact & location

| Concept | Darija | Use | Why |
|---|---|---|---|
| contact (verb) | تواصل | 🔒 | "تواصل معانا" — warm, standard |
| phone | التيليفون | 🔒 | Loanword Moroccans use; "الهاتف" is MSA |
| phone number | نمرة التيليفون | 🔒 | "نمرة" is the Moroccan word for number |
| WhatsApp (number/button) | واتساب / نمرة الواتساب | 🔒 | Never translate the brand |
| location (label) | البلاصة | 🔀 | "بلاصة المحل" for venues; service-area copy uses "فين خدام" instead |
| find us | فين تلقانا | 🔒 | Idiomatic, not literal (venue contexts) |
| address | العنوان | 🔒 | Naturalized, keep |
| directions / get directions | الطريق / شوف الطريق | 🔒 | "Itinéraire" is French-heavy; "الاتجاهات" is MSA |
| call (button) | عيّط | 🔒 | "عيّط لينا" — the Moroccan verb for phoning |
| ask on WhatsApp | سول فواتساب | 🔒 | "سول" is the Darija verb for asking |
| opening hours (label) | التوقيت | 🔒 | What Moroccans say; "أوقات العمل" is MSA |
| open now (badge) | حال دابا | 🔒 | Live, short, natural |
| closed now (badge) | ساد دابا | 🔒 | Matches "حال دابا" |
| closes at {t} | كيسد مع {t} | 🔒 | Verb form, not noun form |
| opens at {t} | كيحل مع {t} | 🔒 | Verb form, not noun form |

## Media & content

| Concept | Darija | Use | Why |
|---|---|---|---|
| photo (sing./pl.) | التصويرة / التصاور | 🔒 | Distinctly Darija; "الصور" is MSA |
| video (sing./pl.) | الفيديو / الفيديوهات | 🔒 | Natural loanword plural |
| logo | اللوڭو | 🔒 | Universal loanword, keep |
| cover image | تصويرة الغلاف | 🔒 | Descriptive, no MSA stiffness |
| previous / next photo | التصويرة اللي قبل / اللي من بعد | 🔒 | Relative phrasing Moroccans use |
| fullscreen | كبّر | 🔒 | Short verb; "ملء الشاشة" is MSA |
| close (lightbox/dialog) | سدّ | 🔒 | Matches "كبّر" |
| focal point hint | برك على البلاصة المهمة فالتصويرة | 💬 | Full-sentence hint; "برك" = tap in Darija |
| testimonials heading | شنو كيقولو الزبناء | 💬 | Warm question for that one heading, not a reusable noun |
| good to know | معلومات تنفعك | 💬 | Useful-to-you framing for that section title |
| follow us | تبعنا | 🔒 | Darija verb; "تابعنا" is MSA |
| QR poster | لآفيش ديال QR | 🔒 | "Affiche" is the Moroccan word for poster |

## Actions (buttons — 2nd person, warm imperative)

| Concept | Darija | Use | Why |
|---|---|---|---|
| save | سجّل | 🔒 | Short, natural; "احفظ" is MSA |
| save changes | سجّل التبديلات | 🔒 | |
| edit | بدّل | 🔒 | "بدّل المعلومات" — the Moroccan verb for changing |
| publish | نشر | 🔒 | Naturalized (socials); keep |
| preview (my page) | شوف الصفحة ديالك | 💬 | Verb-first; "معاينة" is MSA — adapt per button length |
| owner preview link | شوفة خاصة بيك | 💬 | Dodges the owner noun entirely (rule 3) |
| create (page/account) | صايب | 🔒 | "صايب الصفحة ديالك" — distinctly Darija |
| add | زيد | 🔒 | "زيد برودوي / زيد خدمة" — short, warm |
| delete | مسح | 🔒 | Understood everywhere |
| remove (logo/cover) | حيّد | 🔒 | "حيّد اللوڭو" — Darija for taking off |
| cancel (abort an edit) | حبّس | 🔀 | Item-editor Cancel: aborts input. Read aloud — if harsh, fallback سدّ |
| cancel (dismiss dialog) | سدّ | 🔀 | Pure dismissal is closing, not stopping |
| continue | كمّل | 🔒 | "كمّل →" |
| back | رجع | 🔒 | "← رجع" |
| done | صافي | 🔒 | The Moroccan "done/fine" |
| copy (link) | نسخ | 🔒 | Understood; spoken "كوپي" — never in UI |
| copied ✓ | تنسخ ✓ | 🔒 | Verb + checkmark (see Success below) |
| share (button label) | پارطاجي | 🔀 | The word Moroccans use on buttons; "شارك" reads MSA. Button-length only |
| share (sending a link) | سيفط الرابط | 🔀 | Sending ≠ labeling: "سيفط الرابط للزبناء"، "سيفط فواتساب" |
| send (order) | سيفط | 🔒 | "سيفط الكوموند" — Darija for sending |
| refresh | عاود | 🔒 | "↻ عاود" — short, natural |

## Account & lifecycle

| Concept | Darija | Use | Why |
|---|---|---|---|
| account | الكونت | 🔒 | Universal loanword; "الحساب" reads bank-formal |
| sign in / login | دخل | 🔒 | "دخل للكونت ديالك" — simplest verb |
| sign out / logout | خرج | 🔒 | "خرج من الكونت" |
| sign up / create account | صايب الكونت ديالك | 🔒 | Matches "صايب" verb family |
| your name | السمية | 🔒 | Distinctly Darija; "الاسم" is MSA |
| email | الإيميل | 🔒 | Loanword, keep |
| password | الكود السري | 🔒 | What Moroccans say; "كلمة المرور" is MSA |
| dashboard | الداشبورد | 🔒 | No natural Darija equivalent; loanword is professional |
| design (section) | الديزاين | 🔒 | Loanword; "التصميم" reads MSA-manual |
| look (theme option) | الستايل | 🔒 | "الشكل" is vague; الستايل is what Moroccans say |
| auto (theme default) | أوطو | 🔒 | Short loanword; "تلقائي" is MSA |
| dark / light mode | ليلي / نهاري | 🔒 | Plain adjectives; label stays "المود الليلي" |
| on / off (toggle) | خدّام / طافي | 🔒 | "خدّام" = running, "طافي" = off — appliance verbs, natural |
| all (filter) | كولشي | 🔒 | Warmer than "الكل" |
| both (products+services) | بجوج | 🔒 | Distinctly Darija; "الاثنان" unthinkable in UI |
| section (menu grouping) | القسم | 🔒 | Neutral, understood |
| badge | العلامة | 🔒 | Values stay fixed: الأكثر طلبا / جديد / والو (none) |
| duration (services) | المدة | 🔒 | Neutral |
| settings | الإعدادات | 🔒 | Understood in apps; spoken "الريڭلاج" — never in UI |
| profile | البروفيل | 🔒 | Loanword, keep |
| trial (14 free days) | الفترة الفابور | 🔒 | Product frames it as "14 يوم فابور"; "التجربة المجانية" is MSA |
| subscription | الاشتراك | 🔒 | Naturalized; spoken "الأبونمون" — never in UI |
| per month (100 MAD) | 100 درهم فالشهر | 🔒 | "درهم" not "MAD"/"د.م." in Darija copy |
| free | فابور | 🔒 | The Moroccan word; "مجاني" is MSA — always فابور |
| no card required | بلا كارت بنكية | 💬 | Plain spoken phrasing for that reassurance line |
| active page | الصفحة خدامة | 💬 | "خدامة" = working — for the subscribed-state banner |
| expired page | سالات الفترة الفابور | 💬 | Event phrasing for the expired banner, not an adjective |
| locked/disabled page | الصفحة واقفة دابا | 💬 | "واقفة" = paused — soft, not punitive; banner-specific |
| draft | البرويون | 🔀 | Borrowed "brouillon"; longer reassurance copy uses "خدمتك المحفوظة" |
| payment | الخلاص | 🔒 | "ما تخلّص والو اليوم" — Darija; "الدفع" is MSA |
| advertisement | الإشهار | 🔒 | The Moroccan word (FR influence), keep |
| delete business (danger) | مسح المشروع كامل | 💬 | Blunt on purpose for that button |
| this cannot be undone | هادي ما كترجعش | 💬 | Plain warning for that line, no legalese |
| danger zone | رد البال | 💬 | "Pay attention" for that heading — warmer than "منطقة الخطر" |

## System messages

| Concept | Darija pattern | Use | Why |
|---|---|---|---|
| success | past-tense verb + ✓ ("تسجّل ✓"، "تنشرات ✓") | 🔀 | Verbs, not nouns — adapt the verb to the action |
| error | "كاين شي مشكل: …" | 🔀 | Soft opener; "خطأ" alone sounds harsh — follow with the specific cause |
| confirmation ("are you sure?") | "متأكد؟" | 🔒 | One word, natural |
| empty catalog | "ما زال ما زدتي لا برودوي لا سيرڤيس" | 💬 | That wizard empty-state only; dashboard variant names its own tab |
| empty list (generic) | "ما زال ما كاين والو هنا" | 💬 | Fallback phrasing, adapt per screen |
| validation ("please enter X") | "دخل …" / "كتب …" (no "please") | 🔀 | Verb-first; "من فضلك" in every error is MSA stiffness — pick دخل/كتب/ختار per field |
| draft autosaved | "خدمتك كتحفظ بوحدها" / "تحفظات ✓" | 💬 | Reassurance lines, not labels |
| welcome/onboarding | "مرحبا!" | 🔒 | Keep it short |

## Marketing (adapt, never word-for-word)

| Concept | Darija direction | Use | Why |
|---|---|---|---|
| hero "Your business, online" | "المشروع ديالك، أونلاين" | 💬 | Keep "أونلاين" — Moroccans say it; المشروع covers all trades |
| "How it works" | "كيفاش خدامة؟" | 💬 | Idiomatic question for that heading |
| "What's inside" | "شنو فيها؟" | 💬 | Short, curious — that heading only |
| "No technical skills needed" | "بلا ما تكون معلّم فالتكنولوجيا" | 💬 | Plainspoken > literal, for that reassurance line |
| trade list ("cafés, salons, shops…") | Keep the list inclusive — every trade named stays named | 🔒 | Deleting a trade deletes its owners; adapt words, never drop trades |
| shop-or-work duality | "المحل، خدمتك، الفرقة" style pairs | 🔀 | Where source says "your shop, your work", keep both halves |
| QR poster blurb | "لصّقها فالمحل ولا فين كيبانو الزبناء" | 💬 | Generalizes "storefront window" to services too |
| religious-natural touches | Sparingly, only where the general skill allows; never forced | 🔀 | Warmth without piety-signaling |
| brand attribution | "من BizDyali" | 🔒 | Minimal; never translate "BizDyali" |

## Authentication (WhatsApp code flow)

| Concept | Darija | Use | Why |
|---|---|---|---|
| verification code | الكود | 🔒 | Short, universal; "رمز التحقق" is MSA |
| send (the code) | سيفط الكود | 🔒 | Matches سيفط verb family |
| resend the code | عاود سيفط الكود | 🔒 | عاود = again, natural |
| change number | بدّل النمرة | 🔒 | Matches بدّل family |
| your name (first-run step) | شنو سميتك؟ | 💬 | Warm direct question for that one screen |
| terms (link) | الشروط | 🔒 | Short label; full legal text is owner's job |
| privacy (link) | الخصوصية | 🔒 | Short label |
| WhatsApp number (login) | نمرة الواتساب | 🔒 | Already the product term |
| opening soon (auth gate) | جاي قريب | 💬 | Title when sign-in is not open yet on this host |
| contact on WhatsApp (gate) | سولنا فواتساب | 💬 | Button linking to the BizDyali WhatsApp contact |
| human verification (CAPTCHA) | التحقق | 🔒 | Short label; never transliterate "captcha" |
| paste (code) | لصّق الكود | 🔒 | Button label next to the code field |

## Backend notices (server round-trips)

| Concept | Darija | Use | Why |
|---|---|---|---|
| publish landed on an used-up trial | الصفحة تنشرات، ولكن الفترة الفابور سالات — خلّص الاشتراك باش تبان للزبناء. | 💬 | For the publish redirect when the trial window is already over; states fact + next step, no blame |
| page limit (5 pages) | الحد الأقصى | 🔒 | The noun; full line below is the example |
| page limit reached | ما يمكنش تزيد أكثر من 5 دالصفحات. | 💬 | Short refusal for the cap error path |
| draft changed elsewhere | الصفحة تبدلات فبلاصة خرى. حملنا النسخة الجديدة. | 💬 | Draft-conflict reload notice; plain spoken cause + what happened |
| link already taken | هاد الرابط مستعمل. بدّل شوية. | 💬 | Slug-collision (409) message |

## Never translate (technical + brand)

`BizDyali` · `WhatsApp` · `Facebook` · `Instagram` · `QR` · `MAD` inside code
(unit tests expect it) · URLs/slugs (`b.html?slug=…`) · emails · `100 MAD/month`
inside `js/store.js` logic — only the displayed copy changes, never identifiers.
