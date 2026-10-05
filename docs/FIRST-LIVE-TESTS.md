# First live tests (run by hand, in order, on the deployed site)

1. **Real OTP**: private browser, `auth.html`, own number → code arrives on
   WhatsApp within ~60s → dashboard opens, name step appears once.
2. **verifyType**: if step 1 fails at verification with a correct code, flip
   `verifyType` in `js/config.js` (`sms` ↔ alternate per current docs),
   redeploy, retry. Record the working value here.
3. **CAPTCHA render**: with `captchaSiteKey` set, the invisible challenge
   completes with no visible error; with networking blocked it shows the
   التحقق error (already proven in mock).
4. **Session refresh**: sign in, wait past token expiry (or revoke from the
   dashboard), reload → still signed in, no console errors.
5. **Second device**: sign in on a phone → same businesses visible;
   publish on one, appears on the other.
6. **RLS re-run**: `node tests/rls.js` green against the live project.
7. **Publish flow**: new page publishes, trial banner shows 14 days, second
   publish does not extend the trial.
8. **Admin**: owner number opens `admin.html`; stranger number does not.
