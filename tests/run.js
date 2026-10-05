// BizDyali auth unit tests. Plain node, zero dependencies: `node tests/run.js`.
const A = require('../js/auth.js');
let pass = 0, fail = 0;
function t(n, cond, got) { if (cond) pass++; else { fail++; console.log('  FAIL:', n, JSON.stringify(got)); } }

// Phone matrix.
const phones = [
  ['0612345678', '+212612345678'], ['+212612345678', '+212612345678'],
  ['00212612345678', '+212612345678'], ['06 12-34 56 78', '+212612345678'],
  ['0712345678', '+212712345678'], ['\u0660\u0666\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668', '+212612345678'],
  ['+212 612-345678', '+212612345678'], ['+33612345678', '+33612345678'],
  ['06123', 'too-short'], ['0512345678', 'landline'], ['051234567', 'invalid'],
  ['', 'empty'], ['abcdef', 'invalid'], ['06123456789012345', 'too-long'],
  ['+21261234567', 'too-short'], ['+212512345678', 'invalid'], ['+2126123456789', 'invalid']
];
phones.forEach(([input, want]) => {
  const r = A.parsePhone(input);
  const got = r.e164 || r.error;
  t('phone ' + JSON.stringify(input), got === want, got);
});

// next allowlist.
const nexts = [
  ['dashboard.html', 'dashboard.html'], ['create.html?biz=x', 'create.html?biz=x'],
  ['create.html?biz=a&x=1', 'create.html?biz=a&x=1'],
  ['javascript:alert(1)', 'dashboard.html'], ['JaVaScRiPt:alert(1)', 'dashboard.html'],
  ['//evil.com', 'dashboard.html'], ['https://evil.com/a.html', 'dashboard.html'],
  ['http://e.com', 'dashboard.html'], ['..\\evil.html', 'dashboard.html'],
  ['/etc/passwd', 'dashboard.html'], ['a.html#frag', 'dashboard.html'],
  ['a.html?x=1 2', 'dashboard.html'], ['', 'dashboard.html'], [null, 'dashboard.html'],
  ['ADMIN.HTML', 'ADMIN.HTML']
];
nexts.forEach(([input, want]) => t('next ' + JSON.stringify(input), A.validateNext(input) === want, A.validateNext(input)));

// Private-host gate: LAN + .local allowed, public refused.
const hosts = [
  ['localhost', true], ['LOCALHOST', true], ['127.0.0.1', true], ['127.0.1.2', true],
  ['10.0.0.5', true], ['172.16.0.1', true], ['172.31.9.9', true], ['192.168.1.10', true],
  ['phone.local', true], ['', true],
  ['172.15.0.1', false], ['172.32.0.1', false], ['8.8.8.8', false],
  ['example.com', false], ['evil.local.com', false]
];
hosts.forEach(([h, want]) => t('private-host ' + JSON.stringify(h), A.isPrivateHost(h) === want, A.isPrivateHost(h)));

// Pending code-step window (~10 min).
const nowMs = Date.now();
t('pending fresh', A.pendingValid(nowMs - 60000, nowMs) === true);
t('pending stale', A.pendingValid(nowMs - 11 * 60000, nowMs) === false);
t('pending future', A.pendingValid(nowMs + 60000, nowMs) === false);

// Deterministic memory storage (overrides Node's experimental file-backed one).
const _mem = {};
global.localStorage = { getItem: k => (_mem[k] === undefined ? null : _mem[k]), setItem: (k, v) => { _mem[k] = String(v); }, removeItem: k => { delete _mem[k]; } };
global.window = { addEventListener: () => {} };
global.localStorage.setItem('bizdyali_users_v1', '[]');
global.localStorage.setItem('bizdyali_session_v1', '{}');
global.localStorage.setItem('bizdyali_admins_v1', '[]');
global.localStorage.setItem('bizdyali_admin_session_v1', '{}');
t('purge removes 4 legacy keys', A.purgeLegacy() === 4, A.purgeLegacy());
t('legacy keys gone', ['bizdyali_users_v1', 'bizdyali_session_v1', 'bizdyali_admins_v1', 'bizdyali_admin_session_v1'].every(k => global.localStorage.getItem(k) === null));

// Refresh single-flight: N concurrent callers -> one fetch.
(async () => {
  const mem = _mem;
  let calls = 0;
  A._setFetch(() => { calls++; return new Promise(res => setTimeout(() => res({ json: () => Promise.resolve({}) }), 30)); });
  const results = await Promise.all([A.refreshSession(), A.refreshSession(), A.refreshSession()]);
  t('single-flight one fetch', calls <= 1, calls);
  // Cross-tab lock: second acquire while held fails.
  t('lock acquire', A._lock.acquire() === true);
  t('lock blocks re-entry', A._lock.acquire() === false);
  A._lock.release();
  t('lock re-acquires after release', A._lock.acquire() === true);
  A._lock.release();
  // Supabase provider behind stubbed fetch.
  global.BizConfig = { provider: 'supabase', supabaseUrl: 'https://x.supabase.co',
    supabaseAnonKey: 'k', otpResendSeconds: 60, verifyType: 'sms', channel: 'whatsapp' };
  // rate-limit + wrong/expired/captcha mapping
  A._setFetch((url, body) => {
    if (url.includes('/otp')) return Promise.resolve({ status: 429, ok: false });
    return Promise.resolve({ status: 400, ok: false, json: () => Promise.resolve({ msg: 'Invalid OTP' }) });
  });
  let r = await A.requestCode('+33612345678', {});
  t('otp 429 -> rate-limited', r.error === 'rate-limited', r);
  r = await A.verifyCode('+33612345678', '000000');
  t('verify 400 -> wrong', r.error === 'wrong', r);
  A._setFetch((url) => Promise.resolve({ status: 400, ok: false, json: () => Promise.resolve({ msg: 'Token expired' }) }));
  r = await A.verifyCode('+33612345678', '000000');
  t('verify expired-msg -> expired', r.error === 'expired', r);
  A._setFetch((url) => Promise.resolve({ status: 403, ok: false, json: () => Promise.resolve({}) }));
  r = await A.verifyCode('+33612345678', '000000');
  t('verify 403 -> captcha-required', r.error === 'captcha-required', r);
  // single-flight refresh with seeded session
  mem['bizdyali_auth_v1'] = JSON.stringify({ user: { id: 'u1', phone: '+33612345678', name: '' },
    expiresAt: Date.now() + 60000, accessToken: 'old', refreshToken: 'rt', provider: 'supabase' });
  let fetchCalls = 0;
  A._setFetch((url, opts) => { fetchCalls++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'new', refresh_token: 'rt2', expires_in: 3600, user: { id: 'u1' } }) }); });
  await Promise.all([A.refreshSession(), A.refreshSession(), A.refreshSession()]);
  t('supabase single-flight one fetch', fetchCalls === 1, fetchCalls);
  t('session rotated', JSON.parse(mem['bizdyali_auth_v1']).accessToken === 'new');
  // expired refresh token -> signed out
  A._setFetch((url) => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  await A.refreshSession();
  t('dead refresh clears session', A.getUser() === null);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
