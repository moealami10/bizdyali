/* BizDyali auth layer: WhatsApp one-time-code flow behind a provider seam.
 * Providers: 'mock' (localhost only, fixed code) and 'supabase' (real).
 * Pure helpers (normalizeDigits, parsePhone, validateNext) run in Node
 * for tests: module.exports is wired at the bottom when available.
 * No auto-run on include: safe to load on any page (e.g. index CTA). */
(function (global) {
  'use strict';

  function cfg() { return global.BizConfig || {}; }
  var MOCK_CODE = '123456';
  var MOCK_CODE_TTL_MS = 10 * 60 * 1000;
  var MOCK_MAX_ATTEMPTS = 3;
  var MOCK_LOCK_MS = 60 * 1000;
  var SESSION_KEY = 'bizdyali_auth_v1';
  var MOCK_PROFILES_KEY = 'bizdyali_mock_profiles_v1';

  function storage() {
    try { return global.localStorage; } catch (e) { return null; }
  }

  /* ---------- Phone handling (pure) ---------- */

  // Arabic-Indic (٠-٩) + Extended/Persian (۰-۹) digits to Latin.
  function normalizeDigits(s) {
    return String(s || '')
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); })
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[\s\-().]/g, '');
  }

  // Returns {e164:'+212…'} or {error:'empty'|'too-short'|'too-long'|'landline'|'invalid'}.
  function parsePhone(raw) {
    var d = normalizeDigits(raw);
    if (!d) return { error: 'empty' };
    if (/[a-zA-Z]/.test(d)) return { error: 'invalid' };
    if (d.indexOf('+') > 0) return { error: 'invalid' };
    var digits = d.replace(/^\+/, '');
    if (!/^\d+$/.test(digits)) return { error: 'invalid' };
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    if (digits.length < 8) return { error: 'too-short' };
    if (digits.length > 15) return { error: 'too-long' };
    // Moroccan local mobile: 06… / 07… (10 digits) -> +212.
    if (/^0[67]\d{8}$/.test(digits)) return { e164: '+212' + digits.slice(1) };
    // Moroccan landline / other 0… ranges cannot receive WhatsApp.
    if (/^0\d{9}$/.test(digits)) return { error: 'landline' };
    // Moroccan international form must be exactly +212 + 9 digits starting 6/7.
    if (digits.indexOf('212') === 0) {
      if (digits.length === 12 && /^[67]/.test(digits.slice(3))) return { e164: '+' + digits };
      return { error: digits.length < 12 ? 'too-short' : 'invalid' };
    }
    if (d.charAt(0) === '+' && digits.length >= 8 && digits.length <= 15) {
      return { e164: '+' + digits };
    }
    return { error: 'invalid' };
  }

  /* ---------- Redirect allowlist (pure) ---------- */

  var NEXT_RE = /^[a-z0-9_-]+\.html(\?[^\s#]*)?$/i;
  function validateNext(v, fallback) {
    fallback = fallback || 'dashboard.html';
    if (typeof v !== 'string' || !v) return fallback;
    if (v.indexOf('://') !== -1 || v.indexOf('//') === 0 || v.indexOf('\\') !== -1) return fallback;
    if (/^\s*javascript:/i.test(v)) return fallback;
    return NEXT_RE.test(v) ? v : fallback;
  }

  /* ---------- Session (hand-rolled, multi-tab aware) ---------- */

  var listeners = [];
  function readSession() {
    var st = storage();
    if (!st) return null;
    try {
      var s = JSON.parse(st.getItem(SESSION_KEY) || 'null');
      if (!s || !s.user || !s.expiresAt) return null;
      if (Date.now() > s.expiresAt) { try { st.removeItem(SESSION_KEY); } catch (e) {} return null; }
      return s;
    } catch (e) { return null; }
  }
  function writeSession(s) {
    var st = storage();
    if (!st) return;
    try {
      if (s) st.setItem(SESSION_KEY, JSON.stringify(s));
      else st.removeItem(SESSION_KEY);
    } catch (e) {}
    notify();
  }
  function notify() {
    var u = getUser();
    listeners.slice().forEach(function (fn) { try { fn(u); } catch (e) {} });
  }
  function getUser() {
    var s = readSession();
    return s ? s.user : null;
  }
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    if (typeof global.window !== 'undefined' && global.window.addEventListener && !onChange._wired) {
      onChange._wired = true;
      // Multi-tab: an external session change notifies this tab's listeners.
      global.window.addEventListener('storage', function (e) {
        if (e && e.key === SESSION_KEY) notify();
      });
    }
  }
  function signOut(next) {
    writeSession(null);
    if (typeof next === 'string' && typeof global.location !== 'undefined') {
      global.location.replace('auth.html' + (next ? '?next=' + encodeURIComponent(next) : ''));
    }
  }

  /* ---------- Provider plumbing ---------- */

  var fetchImpl = null;
  function http(url, opts) {
    var f = fetchImpl || (typeof global.fetch !== 'undefined' ? global.fetch.bind(global) : null);
    if (!f) return Promise.reject(new Error('no fetch'));
    return f(url, opts);
  }
  function isLocalHost() {
    try {
      var h = String((global.location && global.location.hostname) || '');
      return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
    } catch (e) { return false; }
  }
  function provider() { return cfg().provider || 'mock'; }
  function mockProfiles() {
    var st = storage();
    try { return JSON.parse((st && st.getItem(MOCK_PROFILES_KEY)) || '{}'); }
    catch (e) { return {}; }
  }
  function saveMockProfiles(p) {
    var st = storage();
    if (st) try { st.setItem(MOCK_PROFILES_KEY, JSON.stringify(p)); } catch (e) {}
  }
  // OTP bookkeeping is intentionally memory-only: codes never touch storage/logs.
  var otpState = {}; // e164 -> {attempts, lockedUntil, sentAt}
  function otpEntry(phone) {
    if (!otpState[phone]) otpState[phone] = { attempts: 0, lockedUntil: 0, sentAt: 0 };
    return otpState[phone];
  }

  function requestCode(phone, opts) {
    opts = opts || {};
    if (provider() === 'mock') {
      if (!isLocalHost()) return Promise.resolve({ error: 'mock-localhost-only' });
      var st = otpEntry(phone);
      var now = Date.now();
      if (now < st.lockedUntil) return Promise.resolve({ error: 'too-many' });
      var gap = (cfg().otpResendSeconds || 60) * 1000;
      if (now - st.sentAt < gap) {
        return Promise.resolve({ error: 'resend-wait', retryIn: Math.ceil((gap - (now - st.sentAt)) / 1000) });
      }
      st.sentAt = now; st.attempts = 0;
      return Promise.resolve({ ok: true, resendIn: cfg().otpResendSeconds || 60, debugHint: 'mock-code' });
    }
    // Supabase: POST /auth/v1/otp {phone, channel, captcha_token?}.
    var c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) return Promise.resolve({ error: 'not-configured' });
    var body = { phone: phone, channel: opts.channel || c.channel || 'whatsapp' };
    return (opts.captchaToken ? Promise.resolve(opts.captchaToken) : Promise.resolve(''))
      .then(function (tok) {
        if (tok) body.captcha_token = tok;
        return http(c.supabaseUrl.replace(/\/$/, '') + '/auth/v1/otp', {
          method: 'POST',
          headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      })
      .then(function (r) {
        if (r.status === 429) return { error: 'rate-limited' };
        if (!r.ok) return { error: 'send-failed' };
        return { ok: true, resendIn: c.otpResendSeconds || 60 };
      })
      .catch(function () { return { error: 'offline' }; });
  }

  function verifyCode(phone, code) {
    code = String(code || '').replace(/\D/g, '');
    if (provider() === 'mock') {
      if (!isLocalHost()) return Promise.resolve({ error: 'mock-localhost-only' });
      var st = otpEntry(phone);
      var now = Date.now();
      if (now < st.lockedUntil) return Promise.resolve({ error: 'too-many' });
      if (!st.sentAt || now - st.sentAt > MOCK_CODE_TTL_MS) return Promise.resolve({ error: 'expired' });
      if (code !== MOCK_CODE) {
        st.attempts += 1;
        if (st.attempts >= MOCK_MAX_ATTEMPTS) { st.lockedUntil = now + MOCK_LOCK_MS; return Promise.resolve({ error: 'too-many' }); }
        return Promise.resolve({ error: 'wrong', attemptsLeft: MOCK_MAX_ATTEMPTS - st.attempts });
      }
      var profiles = mockProfiles();
      var returning = !!profiles[phone];
      var user = { id: 'wa_' + phone.replace(/\D/g, ''), phone: phone, name: returning ? profiles[phone].name : '' };
      writeSession({ user: user, expiresAt: Date.now() + (cfg().sessionTtlSec || 2592000) * 1000 });
      return Promise.resolve({ ok: true, user: user, isNew: !returning });
    }
    var c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) return Promise.resolve({ error: 'not-configured' });
    return http(c.supabaseUrl.replace(/\/$/, '') + '/auth/v1/verify', {
      method: 'POST',
      headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, token: code, type: c.verifyType || 'sms' })
    })
      .then(function (r) {
        if (r.status === 429) return { error: 'too-many' };
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) {
          var msg = String((b && (b.msg || b.error)) || '');
          if (/expired/i.test(msg)) return { error: 'expired' };
          return { error: 'wrong' };
        });
        return r.json();
      })
      .then(function (sess) {
        if (sess && sess.error) return sess;
        if (!sess || !sess.access_token || !sess.user) return { error: 'wrong' };
        var user = { id: sess.user.id, phone: phone, name: (sess.user.user_metadata && sess.user.user_metadata.name) || '' };
        writeSession({ user: user, expiresAt: Date.now() + (sess.expires_in || 3600) * 1000,
          accessToken: sess.access_token, refreshToken: sess.refresh_token || null, provider: 'supabase' });
        scheduleRefresh(sess.expires_in || 3600);
        return { ok: true, user: user, isNew: !user.name };
      })
      .catch(function () { return { error: 'offline' }; });
  }

  function mockSetName(phone, name) {
    var profiles = mockProfiles();
    profiles[phone] = { name: String(name || '').trim(), created: new Date().toISOString() };
    saveMockProfiles(profiles);
    var s = readSession();
    if (s && s.user && s.user.phone === phone) {
      s.user.name = profiles[phone].name;
      writeSession(s);
    }
    return profiles[phone];
  }

  /* ---------- Token refresh: single-flight, cross-tab lock ---------- */

  var refreshPromise = null;
  var refreshTimer = null;
  function refreshLock() {
    // Best-effort cross-tab mutex so only one tab refreshes at a time.
    var st = storage();
    if (!st) return true;
    try {
      var now = Date.now();
      var cur = JSON.parse(st.getItem('bizdyali_refresh_lock') || 'null');
      if (cur && now - cur.at < 15000) return false;
      st.setItem('bizdyali_refresh_lock', JSON.stringify({ at: now }));
      return true;
    } catch (e) { return true; }
  }
  function releaseLock() {
    var st = storage();
    if (st) try { st.removeItem('bizdyali_refresh_lock'); } catch (e) {}
  }
  function doRefresh() {
    var c = cfg();
    var s = readSession();
    if (!s || !s.refreshToken || provider() !== 'supabase') return Promise.resolve(null);
    if (!refreshLock()) return Promise.resolve(null);
    return http(c.supabaseUrl.replace(/\/$/, '') + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refreshToken })
    }).then(function (r) { return r.json(); }).then(function (sess) {
      releaseLock();
      if (sess && sess.access_token) {
        s.accessToken = sess.access_token;
        s.refreshToken = sess.refresh_token || s.refreshToken;
        s.expiresAt = Date.now() + (sess.expires_in || 3600) * 1000;
        writeSession(s);
        scheduleRefresh(sess.expires_in || 3600);
        return s;
      }
      writeSession(null);
      return null;
    }).catch(function () { releaseLock(); return null; });
  }
  function refreshSession() {
    // Single-flight: concurrent callers share one refresh request.
    if (!refreshPromise) refreshPromise = doRefresh().then(function (r) { refreshPromise = null; return r; });
    return refreshPromise;
  }
  function scheduleRefresh(expiresIn) {
    if (refreshTimer) { try { clearTimeout(refreshTimer); } catch (e) {} refreshTimer = null; }
    if (typeof setTimeout === 'undefined') return;
    var delay = Math.max(0, (expiresIn - 60) * 1000);
    refreshTimer = setTimeout(function () { refreshSession(); }, delay);
  }
  function accessToken() {
    var s = readSession();
    if (!s) return Promise.resolve(null);
    if (s.provider !== 'supabase' || !s.accessToken) return Promise.resolve(s.accessToken || null);
    if (Date.now() < s.expiresAt - 60000) return Promise.resolve(s.accessToken);
    return refreshSession().then(function (ns) { return ns ? ns.accessToken : null; });
  }

  global.BizAuth = {
    normalizeDigits: normalizeDigits, parsePhone: parsePhone, validateNext: validateNext,
    requestCode: requestCode, verifyCode: verifyCode, mockSetName: mockSetName,
    getUser: getUser, signOut: signOut, onChange: onChange,
    accessToken: accessToken, refreshSession: refreshSession,
    MOCK_CODE: MOCK_CODE,
    _setFetch: function (fn) { fetchImpl = fn; },
    _lock: { acquire: refreshLock, release: releaseLock }
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.BizAuth;
  }
})(typeof window !== 'undefined' ? window : globalThis);
