/* BizDyali local data layer (prototype).
   No backend yet: each business has independent data stored in localStorage.
   Keys: users, businesses, session, per-user wizard draft, activity log, admins.
   Payments are NOT implemented — subscription is a placeholder.
   SECURITY NOTE: this MVP runs entirely in the browser. Admin functions verify
   the admin session on every call, but real authorization enforcement requires
   a backend API. Do not treat client-side checks as sufficient in production. */
(function (global) {
  'use strict';

  var USERS_KEY = 'bizdyali_users_v1';
  var BIZ_KEY = 'bizdyali_businesses_v1';
  var SESSION_KEY = 'bizdyali_session_v1';
  var LOG_KEY = 'bizdyali_activity_v1';
  var ADMINS_KEY = 'bizdyali_admins_v1';
  var ADMIN_SESSION_KEY = 'bizdyali_admin_session_v1';
  var TRIAL_DAYS = 14;
  var SUBSCRIPTION_PRICE = 100; // MAD/month (display only, no payments yet)
  // Platform owner: the ONLY email ever allowed to hold admin access.
  // This is a client-side mitigation. Because browsers don't share localStorage,
  // a fresh browser cannot know an admin already exists elsewhere — so creation
  // itself is restricted to this address. True enforcement still needs a backend.
  var BOOTSTRAP_ADMIN_EMAIL = 'moealami10@gmail.com';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  // NOT secure — demo hashing only. Replace with server-side auth in production.
  function hashPw(pw) {
    var h = 5381;
    var s = 'bizdyali$' + String(pw);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36);
  }
  function slugify(text) {
    return String(text || '')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'business';
  }
  function allBusinesses() { return read(BIZ_KEY, []); }
  function saveAllBusinesses(list) { write(BIZ_KEY, list); }

  function ensureUniqueSlug(base, ignoreId) {
    var list = allBusinesses();
    var taken = {};
    list.forEach(function (b) { if (b.id !== ignoreId) taken[b.slug] = true; });
    var slug = base, n = 2;
    while (taken[slug]) slug = base + '-' + (n++);
    return slug;
  }

  // Status is derived so trial/expired can never drift out of sync:
  // draft (unpublished) → suspended (disabled by admin) → subscribed (paid)
  // → expired (trial end passed) → trial (within 14-day window).
  function trialState(biz) {
    if (!biz || !biz.published) return { status: 'draft', daysLeft: null };
    if (biz.suspended) return { status: 'suspended', daysLeft: daysLeftTo(biz) };
    if (biz.subscription === 'active') return { status: 'subscribed', daysLeft: null };
    var end = new Date(biz.trialEnd).getTime();
    if (Date.now() > end) return { status: 'expired', daysLeft: 0 };
    return { status: 'trial', daysLeft: daysLeftTo(biz) };
  }
  function daysLeftTo(biz) {
    var days = Math.ceil((new Date(biz.trialEnd).getTime() - Date.now()) / 86400000);
    return days < 0 ? 0 : days;
  }
  // Subscription display value for admin lists.
  function subscriptionStatus(biz) {
    if (!biz || !biz.published) return 'none';
    if (biz.subscription === 'active') return 'active';
    return trialState(biz).status === 'trial' ? 'trial' : 'none';
  }

  function publicUrl(slug) {
    // Works from any page in the same folder: .../b.html?slug=xxx
    var base = location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
    return base + 'b.html?slug=' + encodeURIComponent(slug);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return iso; }
  }

  function blankBusiness(ownerId) {
    return {
      id: uid('biz'), ownerId: ownerId,
      name: '', category: '', description: '',
      phone: '', whatsapp: '', address: '', city: '', hours: '',
      facebook: '', instagram: '',
      logo: null, cover: null,
      offeringType: 'both', // 'products' | 'services' | 'both'
      items: [], // {id, kind, name, description, price, photos[], video}
      slug: '', status: 'draft', published: false,
      subscription: 'none', // 'none' | 'active' (paid placeholder, set by admin)
      suspended: false, // admin can disable the public page without deleting data
      expiryLogged: false,
      ownerName: '', ownerEmail: '',
      trialStart: null, trialEnd: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  // ---- Activity log (used by the admin dashboard) ----
  function allLogs() { return read(LOG_KEY, []); }
  function logEvent(type, opts) {
    opts = opts || {};
    var entry = {
      id: uid('log'), ts: new Date().toISOString(), type: type,
      actor: opts.actor || 'system', // 'owner' | 'admin' | 'system'
      actorName: opts.actorName || '',
      businessId: opts.businessId || null, businessName: opts.businessName || '',
      ownerId: opts.ownerId || null, details: opts.details || ''
    };
    var logs = allLogs(); logs.push(entry);
    if (logs.length > 2000) logs = logs.slice(logs.length - 2000); // cap storage
    try { write(LOG_KEY, logs); } catch (e) { /* log full, drop oldest */ try { write(LOG_KEY, logs.slice(-500)); } catch (e2) {} }
    return entry;
  }
  // Logs a trial expiry exactly once per business (called from owner/admin views).
  function checkAndLogExpiry(biz) {
    if (!biz || !biz.published || biz.subscription === 'active' || biz.expiryLogged) return false;
    if (Date.now() > new Date(biz.trialEnd).getTime()) {
      biz.expiryLogged = true;
      logEvent('trial_expired', { businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Trial ended ' + fmtDate(biz.trialEnd) });
      try { api.saveBusiness(biz); } catch (e) {}
      return true;
    }
    return false;
  }

  // ---- Admin auth (separate credential + session store from business users) ----
  // Sessions are NEVER persisted: the admin id lives only in page memory, so
  // every fresh page load asks for email + password again. (A past prototype
  // version stored the session in localStorage; that key is wiped on load.)
  var memoryAdminId = null;
  try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) {}
  function currentAdmin() {
    if (!memoryAdminId) return null;
    var a = read(ADMINS_KEY, []).find(function (x) { return x.id === memoryAdminId; });
    return a ? { id: a.id, email: a.email } : null;
  }
  function requireAdmin() { return currentAdmin(); } // every admin* fn calls this first

  var api = {
    TRIAL_DAYS: TRIAL_DAYS,
    SUBSCRIPTION_PRICE: SUBSCRIPTION_PRICE,

    // ---- Auth ----
    signup: function (name, email, password) {
      name = String(name || '').trim();
      email = String(email || '').trim().toLowerCase();
      if (name.length < 2) return { error: 'كتب السمية ديالك.' };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'كتب شي إيميل صحيح.' };
      if (String(password || '').length < 6) return { error: 'الكود السري خاصو 6 دالحروف على الأقل.' };
      var users = read(USERS_KEY, []);
      if (users.some(function (u) { return u.email === email; })) return { error: 'هاد الإيميل عندو كونت. دخل نيشان.' };
      var user = { id: uid('u'), name: name, email: email, pw: hashPw(password), createdAt: new Date().toISOString() };
      users.push(user); write(USERS_KEY, users);
      write(SESSION_KEY, { userId: user.id });
      logEvent('account_created', { actor: 'owner', actorName: name, ownerId: user.id, details: email });
      return { user: { id: user.id, name: user.name, email: user.email } };
    },
    login: function (email, password) {
      email = String(email || '').trim().toLowerCase();
      var users = read(USERS_KEY, []);
      var user = users.find(function (u) { return u.email === email; });
      if (!user || user.pw !== hashPw(password)) return { error: 'الإيميل ولا الكود السري غلط.' };
      write(SESSION_KEY, { userId: user.id });
      return { user: { id: user.id, name: user.name, email: user.email } };
    },
    logout: function () { localStorage.removeItem(SESSION_KEY); },
    currentUser: function () {
      var s = read(SESSION_KEY, null);
      if (!s) return null;
      var user = read(USERS_KEY, []).find(function (u) { return u.id === s.userId; });
      return user ? { id: user.id, name: user.name, email: user.email } : null;
    },

    // ---- Businesses (independent per business, scoped per owner) ----
    blankBusiness: blankBusiness,
    myBusinesses: function (ownerId) {
      return allBusinesses().filter(function (b) { return b.ownerId === ownerId; })
        .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
    },
    getBusiness: function (id) {
      return allBusinesses().find(function (b) { return b.id === id; }) || null;
    },
    getBySlug: function (slug) {
      slug = String(slug || '').toLowerCase();
      return allBusinesses().find(function (b) { return b.slug === slug && b.published; }) || null;
    },
    saveBusiness: function (biz) {
      biz.updatedAt = new Date().toISOString();
      var list = allBusinesses();
      var i = list.findIndex(function (b) { return b.id === biz.id; });
      if (i >= 0) list[i] = biz; else list.push(biz);
      try { saveAllBusinesses(list); }
      catch (e) { return { error: 'Storage is full (large photos/videos). Try smaller images.' }; }
      return { business: biz };
    },
    deleteBusiness: function (id) {
      saveAllBusinesses(allBusinesses().filter(function (b) { return b.id !== id; }));
    },
    slugify: slugify,
    ensureUniqueSlug: ensureUniqueSlug,
    publishBusiness: function (biz, slug) {
      slug = slugify(slug || biz.name);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { error: 'Link can only contain lowercase letters, numbers and dashes.' };
      biz.slug = ensureUniqueSlug(slug, biz.id);
      var now = new Date();
      biz.published = true;
      biz.status = 'trial';
      if (biz.subscription !== 'active') biz.subscription = 'none';
      biz.suspended = false;
      biz.expiryLogged = false;
      var owner = read(USERS_KEY, []).find(function (u) { return u.id === biz.ownerId; });
      if (owner) { biz.ownerName = owner.name; biz.ownerEmail = owner.email; }
      biz.trialStart = now.toISOString();
      biz.trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
      var res = api.saveBusiness(biz);
      if (!res.error) {
        var counts = { product: 0, service: 0 };
        (biz.items || []).forEach(function (it) { counts[it.kind === 'service' ? 'service' : 'product']++; });
        logEvent('business_created', { actor: 'owner', actorName: biz.ownerName, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: counts.product + ' products, ' + counts.service + ' services' });
        logEvent('trial_started', { actor: 'system', businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Free until ' + fmtDate(biz.trialEnd) });
      }
      return res;
    },

    // ---- Wizard draft (per user, so refresh never loses work) ----
    loadDraft: function (ownerId) { return read('bizdyali_draft_' + ownerId + '_v1', null); },
    saveDraft: function (ownerId, draft) {
      try { write('bizdyali_draft_' + ownerId + '_v1', draft); } catch (e) { /* draft too big, ignore */ }
    },
    clearDraft: function (ownerId) { localStorage.removeItem('bizdyali_draft_' + ownerId + '_v1'); },

    trialState: trialState,
    subscriptionStatus: subscriptionStatus,
    checkAndLogExpiry: checkAndLogExpiry,
    publicUrl: publicUrl,
    fmtDate: fmtDate,

    // ---- Admin (every function re-verifies the admin session) ----
    needsAdminSetup: function () { return read(ADMINS_KEY, []).length === 0; },
    setupAdmin: function (email, password) {
      if (!api.needsAdminSetup()) return { error: 'An administrator already exists. Please sign in.' };
      email = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'كتب شي إيميل صحيح.' };
      if (email !== BOOTSTRAP_ADMIN_EMAIL) return { error: 'This email is not authorized as an administrator.' };
      if (String(password || '').length < 8) return { error: 'Admin password must be at least 8 characters.' };
      var admin = { id: uid('adm'), email: email, pw: hashPw(password), createdAt: new Date().toISOString() };
      write(ADMINS_KEY, [admin]);
      memoryAdminId = admin.id; // memory only — never persisted
      logEvent('admin_action', { actor: 'admin', actorName: email, details: 'Admin account created' });
      return { admin: { id: admin.id, email: admin.email } };
    },
    adminLogin: function (email, password) {
      email = String(email || '').trim().toLowerCase();
      if (email !== BOOTSTRAP_ADMIN_EMAIL) return { error: 'Incorrect admin email or password.' };
      var admin = read(ADMINS_KEY, []).find(function (a) { return a.email === email; });
      if (!admin || admin.pw !== hashPw(password)) return { error: 'Incorrect admin email or password.' };
      memoryAdminId = admin.id; // memory only — never persisted
      return { admin: { id: admin.id, email: admin.email } };
    },
    adminLogout: function () { memoryAdminId = null; try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) {} },
    currentAdmin: currentAdmin,
    adminAllBusinesses: function () {
      if (!requireAdmin()) return { error: 'Not authorized. Admin sign-in required.' };
      return { businesses: allBusinesses().slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }) };
    },
    adminStats: function () {
      if (!requireAdmin()) return { error: 'Not authorized. Admin sign-in required.' };
      var list = allBusinesses();
      var now = new Date();
      var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      var startOfWeek = startOfDay - ((now.getDay() + 6) % 7) * 86400000; // Monday
      var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      var s = { total: list.length, trial: 0, subscribed: 0, expired: 0, draft: 0, suspended: 0, today: 0, week: 0, month: 0 };
      list.forEach(function (b) {
        var st = trialState(b).status;
        if (st === 'trial') s.trial++;
        else if (st === 'subscribed') s.subscribed++;
        else if (st === 'expired') s.expired++;
        else if (st === 'draft') s.draft++;
        if (b.suspended) s.suspended++;
        var c = new Date(b.createdAt).getTime();
        if (c >= startOfDay) s.today++;
        if (c >= startOfWeek) s.week++;
        if (c >= startOfMonth) s.month++;
      });
      return { stats: s };
    },
    adminGetLogs: function (limit) {
      if (!requireAdmin()) return { error: 'Not authorized. Admin sign-in required.' };
      var logs = allLogs().slice().sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
      return { logs: logs.slice(0, limit || 300) };
    },
    // All mutations below verify admin session AND record an admin_action event.
    adminUpdateInfo: function (id, fields, note) {
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      ['name', 'category', 'description', 'phone', 'whatsapp', 'address', 'city', 'hours', 'facebook', 'instagram', 'offeringType'].forEach(function (k) {
        if (fields[k] !== undefined) biz[k] = fields[k];
      });
      var res = api.saveBusiness(biz);
      if (!res.error) {
        logEvent('info_changed', { actor: 'admin', actorName: admin.email, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: note || 'Edited by admin' });
        logEvent('admin_action', { actor: 'admin', actorName: admin.email, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Edited business information' + (note ? ': ' + note : '') });
      }
      return res.error ? res : { business: biz };
    },
    adminExtendTrial: function (id, extraDays) {
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      extraDays = Math.max(1, Math.min(365, Number(extraDays) || 0));
      if (!extraDays) return { error: 'Please enter a valid number of days.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      if (!biz.published) return { error: 'Only published pages have a trial to extend.' };
      var base = Math.max(new Date(biz.trialEnd).getTime(), Date.now());
      biz.trialEnd = new Date(base + extraDays * 86400000).toISOString();
      biz.status = 'trial';
      biz.expiryLogged = false;
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.email, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Extended trial by ' + extraDays + ' days (now ends ' + fmtDate(biz.trialEnd) + ')' });
      return res.error ? res : { business: biz };
    },
    adminSetSubscription: function (id, active) {
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      biz.subscription = active ? 'active' : 'none';
      biz.status = active ? 'subscribed' : (Date.now() > new Date(biz.trialEnd).getTime() ? 'expired' : 'trial');
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.email, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: active ? 'Marked as PAID subscriber (100 MAD/month placeholder, no payment processed)' : 'Subscription removed (back to trial/expired flow)' });
      return res.error ? res : { business: biz };
    },
    adminSetSuspended: function (id, suspended) {
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      biz.suspended = !!suspended;
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.email, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: suspended ? 'Disabled public page (data kept)' : 'Re-enabled public page' });
      return res.error ? res : { business: biz };
    },
    adminUnpublish: function (id) {
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      biz.published = false; biz.status = 'draft';
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.email, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Unpublished page (moved back to draft)' });
      return res.error ? res : { business: biz };
    },
    adminDeleteBusiness: function (id) {
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      saveAllBusinesses(allBusinesses().filter(function (b) { return b.id !== id; }));
      logEvent('admin_action', { actor: 'admin', actorName: admin.email, businessId: id, businessName: biz.name, ownerId: biz.ownerId, details: 'PERMANENTLY DELETED business and all its data' });
      return { deleted: true };
    },
    logEvent: function (type, opts) { return logEvent(type, opts); } // owner flows log their own actions
  };

  // ---- Media pipeline (orientation fix, WebP + sizes, blur placeholder).
  // IndexedDB checkpoint: new uploads can persist blobs as `idb:<id>` refs via
  // opts.store='idb'; legacy data-URL/http refs keep working everywhere.
  // resolveBusiness() swaps idb refs for object URLs before synchronous render.
  // When a real backend arrives: replace idbPut/idbGet with upload/download
  // calls and keep every other signature unchanged.
  var webpOK = null;
  function supportsWebp() {
    if (webpOK !== null) return Promise.resolve(webpOK);
    return new Promise(function (resolve) {
      try {
        var c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        c.toBlob(function (b) { webpOK = !!(b && b.type === 'image/webp'); resolve(webpOK); }, 'image/webp', 0.8);
      } catch (e) { webpOK = false; resolve(false); }
    });
  }
  function loadBitmap(file) {
    // createImageBitmap honors EXIF orientation: rotated phone photos arrive upright.
    if (typeof createImageBitmap === 'function') {
      try {
        var opts = {};
        try { opts = { imageOrientation: 'from-image' }; } catch (e) {}
        return createImageBitmap(file, opts).catch(function () { return createImageBitmap(file); });
      } catch (e) { /* fall through */ }
    }
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }
  function canvasBlob(canvas, useWebp, quality) {
    return new Promise(function (resolve, reject) {
      var type = useWebp ? 'image/webp' : 'image/jpeg';
      if (canvas.toBlob) canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('Encode failed.')); }, type, quality == null ? 0.82 : quality);
      else {
        try { resolve(dataURLtoBlob(canvas.toDataURL(type, 0.82))); }
        catch (e) { reject(e); }
      }
    });
  }
  function dataURLtoBlob(dataURL) {
    var parts = dataURL.split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read encoded image.')); };
      r.readAsDataURL(blob);
    });
  }
  function drawScaled(bitmap, maxDim) {
    var w0 = bitmap.width, h0 = bitmap.height;
    var scale = Math.min(1, maxDim / Math.max(w0, h0));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * scale));
    c.height = Math.max(1, Math.round(h0 * scale));
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    return c;
  }
  var idbSupported = (typeof indexedDB !== 'undefined');
  var idbDb = null;
  var idbUrlCache = {};
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!idbSupported) return reject(new Error('IndexedDB unavailable.'));
      if (idbDb) return resolve(idbDb);
      try {
        var req = indexedDB.open('bizdyali_media_v1', 1);
        req.onupgradeneeded = function () {
          if (!req.result.objectStoreNames.contains('photos')) req.result.createObjectStore('photos');
        };
        req.onsuccess = function () { idbDb = req.result; resolve(idbDb); };
        req.onerror = function () { reject(new Error('Media store unavailable.')); };
      } catch (e) { reject(new Error('Media store unavailable.')); }
    });
  }
  function idbPut(blob, meta) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var id = 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          var tx = db.transaction('photos', 'readwrite');
          tx.objectStore('photos').put({ blob: blob, meta: meta || {}, createdAt: new Date().toISOString() }, id);
          tx.oncomplete = function () { resolve(id); };
          tx.onerror = function () { reject(new Error('Could not save photo.')); };
        } catch (e) { reject(new Error('Could not save photo.')); }
      });
    });
  }
  function idbGet(id) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction('photos', 'readonly');
          var rq = tx.objectStore('photos').get(id);
          rq.onsuccess = function () { rq.result ? resolve(rq.result) : reject(new Error('Photo not found.')); };
          rq.onerror = function () { reject(new Error('Photo not found.')); };
        } catch (e) { reject(new Error('Photo not found.')); }
      });
    });
  }
  function idbDelete(id) {
    if (idbUrlCache[id]) { try { URL.revokeObjectURL(idbUrlCache[id]); } catch (e) {} delete idbUrlCache[id]; }
    return idbOpen().then(function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('photos', 'readwrite');
          tx.objectStore('photos').delete(id);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }
  function refKind(ref) {
    var s = (ref && ref.src) || ref || '';
    if (typeof s !== 'string' || !s) return 'none';
    if (s.indexOf('idb:') === 0) return 'idb';
    if (s.indexOf('data:') === 0) return 'data';
    return 'http';
  }
  function resolveRef(ref) {
    var kind = refKind(ref);
    if (kind !== 'idb') return Promise.resolve(ref);
    var src = typeof ref === 'string' ? ref : ref.src;
    var id = src.slice(4);
    if (idbUrlCache[id]) {
      var cached = idbUrlCache[id];
      return Promise.resolve(typeof ref === 'string' ? cached : { src: cached, fx: ref.fx, fy: ref.fy });
    }
    return idbGet(id).then(function (rec) {
      var url = URL.createObjectURL(rec.blob);
      idbUrlCache[id] = url;
      return typeof ref === 'string' ? url : { src: url, fx: ref.fx, fy: ref.fy };
    });
  }
  function resolveBusiness(biz) {
    // Deep clone with every photo ref resolved to a directly usable URL.
    // Legacy data-URL/http refs pass through untouched.
    var clone = JSON.parse(JSON.stringify(biz));
    var jobs = [];
    function walkPhoto(getter, setter) {
      var ref = getter();
      if (!ref) return;
      jobs.push(resolveRef(ref).then(function (url) { setter(url); }, function () { /* keep original ref */ }));
    }
    walkPhoto(function () { return clone.logo; }, function (u) { clone.logo = u; });
    walkPhoto(function () { return clone.cover; }, function (u) { clone.cover = u; });
    (clone.items || []).forEach(function (it) {
      (it.photos || []).forEach(function (p, i) {
        walkPhoto(function () { return it.photos[i]; }, function (u) { it.photos[i] = u; });
      });
    });
    return Promise.all(jobs).then(function () { return clone; });
  }
  api.media = {
    supportsWebp: supportsWebp,
    idbSupported: function () { return idbSupported; },
    idbPut: idbPut, idbGet: idbGet, idbDelete: idbDelete,
    refKind: refKind, resolveRef: resolveRef, resolveBusiness: resolveBusiness,
    // Full pipeline: {thumb, full, placeholder, width, height, type}.
    // thumb ~480px, full ~1400px (cover callers pass maxFull 1800).
    // opts.store='idb' persists the full blob and returns ref:'idb:<id>'
    // instead of a data URL (thumb stays inline for instant lists).
    processImage: function (file, opts) {
      opts = opts || {};
      var maxFull = opts.maxFull || 1400;
      var useIdb = opts.store === 'idb' && idbSupported;
      return new Promise(function (resolve, reject) {
        if (!file || !file.type.match(/^image\//)) return reject(new Error('Not an image file.'));
        supportsWebp().then(function (useWebp) {
          return loadBitmap(file).then(function (bmp) {
            var fullC = drawScaled(bmp, maxFull);
            var thumbC = drawScaled(bmp, 480);
            var tiny = document.createElement('canvas');
            tiny.width = 24;
            tiny.height = Math.max(1, Math.round(24 * bmp.height / Math.max(1, bmp.width)));
            tiny.getContext('2d').drawImage(bmp, 0, 0, tiny.width, tiny.height);
            return canvasBlob(fullC, useWebp).then(function (fb) {
              return canvasBlob(thumbC, useWebp).then(function (tb) {
                return blobToDataURL(fb).then(function (full) {
                  return blobToDataURL(tb).then(function (thumb) {
                    var out = {
                      thumb: thumb, full: full,
                      placeholder: tiny.toDataURL('image/jpeg', 0.6),
                      width: fullC.width, height: fullC.height,
                      type: useWebp ? 'image/webp' : 'image/jpeg'
                    };
                    if (!useIdb) { resolve(out); return; }
                    idbPut(fb, { w: fullC.width, h: fullC.height, type: out.type }).then(function (id) {
                      out.ref = 'idb:' + id;
                      delete out.full;
                      resolve(out);
                    }, reject);
                  });
                });
              });
            });
          });
        }).catch(reject);
      });
    },
    fileToImageDataURL: function (file, maxDim) {
      // Legacy signature kept for wizard/dashboard: returns the full-size URL.
      return api.media.processImage(file, { maxFull: maxDim || 1000 }).then(function (o) { return o.full; });
    },
    // Focal-point helpers: accept legacy strings or {src, fx, fy} (fx/fy 0..100).
    photoSrc: function (photo) {
      if (!photo) return '';
      return typeof photo === 'string' ? photo : (photo.src || '');
    },
    photoPosition: function (photo) {
      if (photo && typeof photo === 'object' && photo.fx != null && photo.fy != null) {
        var x = Math.max(0, Math.min(100, Number(photo.fx)));
        var y = Math.max(0, Math.min(100, Number(photo.fy)));
        return x + '% ' + y + '%';
      }
      return '50% 50%';
    },
    normalizePhoto: function (photo) {
      if (!photo) return null;
      if (typeof photo === 'string') return { src: photo, fx: 50, fy: 50 };
      return { src: photo.src || '', fx: photo.fx == null ? 50 : photo.fx, fy: photo.fy == null ? 50 : photo.fy };
    },
    fileToVideoDataURL: function (file, maxMB) {
      maxMB = maxMB || 10;
      return new Promise(function (resolve, reject) {
        if (!file || !file.type.match(/^video\//)) return reject(new Error('Not a video file.'));
        if (file.size > maxMB * 1024 * 1024) return reject(new Error('Video is too large (max ' + maxMB + ' MB in this demo).'));
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { reject(new Error('Could not read that video.')); };
        r.readAsDataURL(file);
      });
    }
  };

  // ---- Demo seed (sample pages so visitors + admins see a live example) ----
  api.seedDemo = function () {
    var now = Date.now();
    var D = 86400000;
    // Curated demo photography (verified Unsplash CDN URLs).
    function U(id, w) { return 'https://images.unsplash.com/' + id + '?w=' + (w || 1200) + '&q=70&auto=format&fit=crop'; }
    var CAFE_COVER = U('photo-1554118811-1e0d58224f24', 1600);
    var CAFE_PHOTOS = {
      espresso: [U('photo-1495474472287-4d71bcdd2085', 900), U('photo-1445116572660-236099ec97a0', 900)],
      msemen: [U('photo-1555507036-ab1f4038808a', 900)],
      tiramisu: [U('photo-1578985545062-69928b1d9587', 900)]
    };
    var list = allBusinesses();
    // Upgrade path: existing photo-less demo gets its photography.
    var nassim = list.find(function (b) { return b.slug === 'cafe-nassim'; });
    if (nassim && !nassim.cover) {
      nassim.cover = CAFE_COVER;
      (nassim.items || []).forEach(function (it) {
        if (it.id === 'di1') it.photos = CAFE_PHOTOS.espresso.slice();
        if (it.id === 'di2') it.photos = CAFE_PHOTOS.msemen.slice();
      });
      if (!(nassim.items || []).some(function (it) { return it.id === 'di4'; })) {
        nassim.items.push({ id: 'di4', kind: 'product', name: 'Tiramisu', description: 'Creamy mascarpone, cocoa dust.', price: 28, photos: CAFE_PHOTOS.tiramisu.slice(), video: null, order: 3 });
      }
      try { saveAllBusinesses(list); } catch (e) { /* ignore */ }
    }
    if (nassim) return;
    function demoBiz(o) {
      var b = {
        id: o.id, ownerId: 'demo', demo: true,
        ownerName: o.ownerName, ownerEmail: o.ownerEmail,
        name: o.name, category: o.category, description: o.desc,
        phone: '+212 6 61 00 00 00', whatsapp: '+212661000000',
        address: o.address, city: o.city, hours: 'Mon – Sat: 8:00 – 23:00',
        facebook: 'https://facebook.com/', instagram: 'https://instagram.com/',
        logo: o.logo || null, cover: o.cover || null, offeringType: 'both',
        items: o.items, slug: o.slug, status: o.status, published: o.published,
        subscription: o.subscription || 'none', suspended: !!o.suspended, expiryLogged: false,
        trialStart: o.trialStart, trialEnd: o.trialEnd,
        createdAt: o.createdAt, updatedAt: o.createdAt
      };
      return b;
    }
    var items1 = [
      { id: 'di1', kind: 'product', name: 'Espresso', description: 'Rich single-origin espresso.', price: 15, photos: CAFE_PHOTOS.espresso.slice(), video: null, order: 0 },
      { id: 'di2', kind: 'product', name: 'Msemen & Honey', description: 'Fresh griddle bread, served warm.', price: 8, photos: CAFE_PHOTOS.msemen.slice(), video: null, order: 1 },
      { id: 'di4', kind: 'product', name: 'Tiramisu', description: 'Creamy mascarpone, cocoa dust.', price: 28, photos: CAFE_PHOTOS.tiramisu.slice(), video: null, order: 2 },
      { id: 'di3', kind: 'service', name: 'Birthday Table Setup', description: 'We decorate a table for your celebration.', price: 150, photos: [], video: null, order: 3 }
    ];
    var seeds = [
      demoBiz({ id: 'biz_demo_nassim', ownerName: 'Salma Bennani', ownerEmail: 'salma@example.com',
        name: 'Café Nassim', category: 'Café', city: 'Casablanca', address: '12 Rue Yacoub El Mansour, Maârif',
        desc: 'A cozy neighbourhood café in Maârif. Fresh msemen every morning, great espresso, sunny terrace.',
        cover: CAFE_COVER,
        items: items1, slug: 'cafe-nassim', status: 'trial', published: true,
        trialStart: new Date(now - 1 * D).toISOString(), trialEnd: new Date(now + 13 * D).toISOString(),
        createdAt: new Date(now - 1 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_salon', ownerName: 'Yassine El Fassi', ownerEmail: 'yassine@example.com',
        name: 'Salon Narjis', category: 'Salon / Barber', city: 'Rabat', address: '5 Av. Annakhil, Agdal',
        desc: 'Modern salon for women and men. Bridal packages available on reservation.',
        items: [{ id: 'ds1', kind: 'service', name: 'Haircut & Brushing', description: 'Cut, wash and styling.', price: 120, photos: [], video: null, order: 0 }],
        slug: 'salon-narjis', status: 'trial', published: true,
        trialStart: new Date(now - 12 * D).toISOString(), trialEnd: new Date(now + 2 * D).toISOString(),
        createdAt: new Date(now - 12 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_old', ownerName: 'Karim Tazi', ownerEmail: 'karim@example.com',
        name: 'Tazi Electronics', category: 'Electronics / Repair', city: 'Fès', address: '8 Rue Talaa Kebira',
        desc: 'Phone and laptop repair with 3-month warranty on all fixes.',
        items: [{ id: 'do1', kind: 'service', name: 'Screen Replacement', description: 'Original-quality screens.', price: 350, photos: [], video: null, order: 0 }],
        slug: 'tazi-electronics', status: 'expired', published: true,
        trialStart: new Date(now - 20 * D).toISOString(), trialEnd: new Date(now - 6 * D).toISOString(),
        createdAt: new Date(now - 20 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_paid', ownerName: 'Salma Bennani', ownerEmail: 'salma@example.com',
        name: 'Nassim Traiteur', category: 'Services', city: 'Casablanca', address: '12 Rue Yacoub El Mansour',
        desc: 'Catering for weddings and corporate events across Casablanca.',
        items: [{ id: 'dp1', kind: 'service', name: 'Wedding Menu (per guest)', description: 'Full traditional menu.', price: 220, photos: [], video: null, order: 0 }],
        slug: 'nassim-traiteur', status: 'subscribed', published: true, subscription: 'active',
        trialStart: new Date(now - 40 * D).toISOString(), trialEnd: new Date(now - 26 * D).toISOString(),
        createdAt: new Date(now - 40 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_draft', ownerName: 'Mehdi Alaoui', ownerEmail: 'mehdi@example.com',
        name: 'Alaoui Grocery', category: 'Grocery / Hanout', city: 'Marrakech', address: '3 Derb El Ferrane',
        desc: 'Neighbourhood grocery — draft, not published yet.',
        items: [], slug: '', status: 'draft', published: false, trialStart: null, trialEnd: null,
        createdAt: new Date(now - 2 * 3600000).toISOString() })
    ];
    seeds.forEach(function (b) { list.push(b); });
    try { saveAllBusinesses(list); } catch (e) { /* ignore */ }
    // Seed log history so the Activity Log view has content on first run.
    if (allLogs().length === 0) {
      var L = [
        ['account_created', 'owner', 'Salma Bennani', 'biz_demo_nassim', 'Café Nassim', 'demo', 'salma@example.com', 1],
        ['business_created', 'owner', 'Salma Bennani', 'biz_demo_nassim', 'Café Nassim', 'demo', '0 products, 0 services', 1],
        ['trial_started', 'system', '', 'biz_demo_nassim', 'Café Nassim', 'demo', '', 1],
        ['product_added', 'owner', 'Salma Bennani', 'biz_demo_nassim', 'Café Nassim', 'demo', 'Espresso — 15 MAD', 1],
        ['account_created', 'owner', 'Karim Tazi', 'biz_demo_old', 'Tazi Electronics', 'demo', 'karim@example.com', 20],
        ['trial_expired', 'system', '', 'biz_demo_old', 'Tazi Electronics', 'demo', '', 6]
      ];
      L.forEach(function (e) {
        var entry = logEvent(e[0], { actor: e[1], actorName: e[2], businessId: e[3], businessName: e[4], ownerId: e[5], details: e[6] });
        entry.ts = new Date(now - e[7] * D).toISOString();
      });
      try { write(LOG_KEY, allLogs()); } catch (e2) {}
    }
  };

  global.BizDyali = api;
})(window);
