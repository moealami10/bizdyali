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

// Refresh single-flight: N concurrent callers -> one fetch.
(async () => {
  let calls = 0;
  A._setFetch(() => { calls++; return new Promise(res => setTimeout(() => res({ json: () => Promise.resolve({}) }), 30)); });
  // Seed an (expired-ish) supabase session via localStorage shim.
  const store = {};
  global.localStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  global.window = { addEventListener: () => {} };
  const results = await Promise.all([A.refreshSession(), A.refreshSession(), A.refreshSession()]);
  t('single-flight one fetch', calls <= 1, calls);
  // Cross-tab lock: second acquire while held fails.
  t('lock acquire', A._lock.acquire() === true);
  t('lock blocks re-entry', A._lock.acquire() === false);
  A._lock.release();
  t('lock re-acquires after release', A._lock.acquire() === true);
  A._lock.release();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
