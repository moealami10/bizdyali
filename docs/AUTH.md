# BizDyali auth: WhatsApp one-time-code flow

## Flow
Number (`+212` chip, `06/07…`, international, Arabic-Indic digits) →
6-digit code (`autocomplete="one-time-code"`, paste, auto-submit on 6th digit,
60s resend from config, change-number) → name on first run only →
new users `create.html` (`?biz=` carried), returning users validated `next`.

## Modules
- `js/config.js` — the only settings file. `verifyType` is a deliberate
  constant (see First live tests).
- `js/auth.js` — provider seam. `requestCode / verifyCode / getUser /
  signOut / onChange / accessToken / refreshSession`, plus pure
  `parsePhone / normalizeDigits / validateNext` (Node-tested in `tests/`).
  No auto-run on include.
- Mock provider: localhost-only (fail-closed elsewhere), fixed code `123456`,
  memory-only OTP state (codes never touch storage or logs).
- Supabase provider: plain `fetch` to `/auth/v1/otp` + `/auth/v1/verify`
  (no supabase-js: ESM-only, heavy, unnecessary for two POSTs + REST).
  Session persisted locally; refresh is single-flight with a best-effort
  cross-tab lock (`BizAuth._lock`, unit-tested).

## Session guarantees (implemented + tested)
- Single-flight refresh: concurrent `refreshSession()` callers share one request.
- Multi-tab: `storage` events propagate session changes; refresh lock stops stampedes.
- Expiry: expired sessions are cleared on read; sign-out accepts a `next` target.
- No-flash guards: wizard/dashboard hide the body until the session resolves
  (1500ms failsafe restore), covered by the render harness.

## Swapping providers (incl. future reverse verification)
Implement the six functions against the new channel and select it in
`js/config.js`. UI code never touches provider specifics. Reverse
verification sketch: screen shows a short code + BizDyali's WhatsApp
click-to-chat; user messages us; Meta webhook → Edge Function matches the
sender to the pending challenge. No outbound templates.

## FIRST LIVE TESTS (Phase 3, against a real project)
1. `verifyType` value for the WhatsApp channel (`sms` assumed).
2. Test-number fixed OTP end to end, then a real number.
3. RLS matrix: anon, user A, user B, admin (see Phase 3 plan).
4. Refresh + multi-tab + expiry against real sessions.

## Launch blockers (tracked)
CAPTCHA on · legal pages reviewed (Law 09-08) · Twilio/Meta approvals ·
message-cost check · test OTPs removed from prod · SMS flag decision ·
phone-recycling/SIM-swap abuse review · admin second factor (TOTP).

## Phase 3 security notes (approved amendments, to implement)
- INSERT locked like UPDATE (column grants + trigger); `owner_id` forced
  server-side; `profiles.phone` set by trigger only.
- No client-callable `log_event`; security-definer functions ship fixed
  `search_path` + `REVOKE FROM PUBLIC/anon`.
- `public_business` returns no owner/profile data, ever.
- Media bucket: size + MIME limits, `{user_id}/…` write paths.
- Drafts: server draft rows (one per owner, jsonb) + localStorage
  write-through buffer (instant load, offline); server wins ties on login.
- Demo media ships as static repo assets, not hotlinks; demo rows flagged.
