# BizDyali backend setup (human checklist)

No code here runs anything. An owner does these steps once, in order.
Nothing below can be done by the coding agent: accounts, money, approvals.

## 1. Supabase project
- [ ] Create the project at supabase.com → note project URL + **anon (publishable)** key.
- [ ] Fill `js/config.js`: `provider:'supabase'`, `supabaseUrl`, `supabaseAnonKey`.
- [ ] Never put the service-role key, Twilio secrets, or captcha secrets in the repo.

## 2. Phone provider (Twilio or Twilio Verify)
- [ ] Twilio account + WhatsApp sender approved (Meta Business verification required; takes days).
- [ ] Authentication (OTP) message template approved in Twilio/Meta.
- [ ] Paste Twilio credentials in Supabase dashboard → Authentication → Phone (never in the repo).
- [ ] Confirm per-message pricing for Morocco (WhatsApp + optional SMS) and record it here.

## 3. CAPTCHA (launch blocker if off)
- [ ] Cloudflare Turnstile (recommended) or hCaptcha site + secret keys.
- [ ] Site key → `js/config.js` (`captchaSiteKey`); secret stays in the Supabase dashboard.
- [ ] Enforced on `/auth/v1/otp` before public launch (message-pumping protection).

## 4. Redirect URLs
- [ ] Supabase dashboard → Authentication → URL configuration: allowlist the production
      origin (e.g. `https://moealami10.github.io`) plus `http://localhost:8123` for dev.

## 5. Test numbers (no real messages)
- [ ] Add test phone numbers with fixed OTPs in the Supabase dashboard (exact location
      confirmed during setup — record it here).
- [ ] Run the full flow against a test number before touching a real one.

## 6. Rate limits + cost (launch blockers)
- [ ] Review `/auth/v1/otp` (default 30 SMS/hour/project, 60s per-user window) and
      `/verify` limits for launch traffic.
- [ ] Decide the SMS-fallback flag (`smsFallback`, default off) only after checking
      Morocco SMS cost and deliverability.
- [ ] Remove any test OTP mappings from production config.

## 7. Legal (launch blocker)
- [ ] `terms.html` / `privacy.html` are placeholders, not legal text. Owner's legal
      review required (Morocco Law 09-08 covers phone numbers; not legal advice).
