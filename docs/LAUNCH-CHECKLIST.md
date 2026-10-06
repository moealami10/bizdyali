# Launch checklist

## Done by agent (verified live, evidence in docs/live-runs/)
- Migrations `0001`–`0016` applied to the production project in order.
- `tests/rls.js` green (74/74): anon/A/B/admin matrix, INSERT forgery,
  trigger reverts, publish-once trial, constraint matrix, cap (5+1),
  phone-claim lockout, drafts isolation, storage paths, audit logging.
- Allowlist ablation: branches proven load-bearing, kept (`docs/allowlist-ablation.md`).
- Phase 3b client: `js/db.js`, store delegation, uploads straight to Storage
  with orphan cleanup, drafts with conflict handling, admin via RPCs, public
  reads via public RPCs, trial-over + cap + conflict + taken notices.
- E2E green on the real backend: sign-in → create → photo upload → publish →
  anonymous public page → second device sees it → admin extend/suspend
  reflected publicly. Axe clean on `auth.html`. Lighthouse mobile measured
  (perf 0.74, LCP 6.8s on image-heavy demo — see report).
- Database left clean: schema + `cafe-nassim` demo seed only.

## Needs the owner (in this order)
1. **Rotate the secret key**: dashboard → Project Settings → API →
   create a new secret key, then **delete the old one**. The old key crossed
   this chat and must be considered exposed.
2. **Reset the DB password**: Settings → Database → reset password. Update
   any saved pooler URI; never commit either value.
3. **Insert the admin row** (SQL editor, replace the phone with yours,
   E.164 digits, no `+`):
   ```sql
   insert into public.admins (user_id)
   select id from public.profiles where phone = '<YOUR-DIGITS>';
   ```
   The profile row appears after your first WhatsApp login.
4. **Media ref**: already pinned to this project in `0016`. No action —
   confirm only.
5. **CAPTCHA**: Cloudflare Turnstile (or hCaptcha) site + secret keys →
   secret into Supabase Auth CAPTCHA settings, site key to the deploy config.
6. **Twilio WhatsApp sender + authentication template** (Meta Business
   verification takes days), then enable phone sign-in (Twilio provider).
7. **SMS fallback decision**: check Morocco SMS cost/deliverability first;
   stays off until then.
8. **Legal pages**: `terms.html`/`privacy.html` are placeholders — legal
   review required (Morocco Law 09-08 covers phone numbers; not legal advice).
9. **Native Darija review**: trial-over, cap, conflict, taken, countdown,
   resend, consent strings (all flagged in-repo).
10. **Real-phone test on mobile data**: full OTP sign-in → publish on a phone.
11. **Disable Email + Anonymous providers** (Auth → Providers) ONLY after
    items 1–10 are done — the RLS suite itself signs in via email, so this
    is last. Re-verify owner login still works afterwards.
