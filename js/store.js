/* BizDyali local data layer (prototype).
   No backend yet: each business has independent data stored in localStorage.
   Keys: businesses, per-user wizard draft, activity log. Sessions live in
   js/auth.js (WhatsApp OTP, mock on localhost). No passwords, no emails.
   Payments are NOT implemented — subscription is a placeholder.
   SECURITY NOTE: this MVP runs entirely in the browser. Real authorization
   enforcement requires the Phase 3 backend. Do not treat client-side checks
   as sufficient in production. */
(function (global) {
  'use strict';

  var BIZ_KEY = 'bizdyali_businesses_v1';
  var LOG_KEY = 'bizdyali_activity_v1';
  var TRIAL_DAYS = 14;
  var SUBSCRIPTION_PRICE = 100; // MAD/month (display only, no payments yet)
  // Platform owner phone (E.164): the ONLY number granted local admin access.
  // Demo gate only — Phase 3 replaces it with the server-side admins table.
  // Set it in js/config.js (ownerPhone).
  function ownerPhone() { return (global.BizConfig && global.BizConfig.ownerPhone) || ''; }

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
      ownerName: '', ownerPhone: '',
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

  // ---- Admin gate: the signed-in WhatsApp number must match the owner phone.
  // Demo gate only — Phase 3 checks the server-side admins table instead.
  function currentAdmin() {
    var op = ownerPhone();
    if (!op || !global.BizAuth || !BizAuth.getUser) return null;
    var u = BizAuth.getUser();
    return (u && u.phone === op) ? { phone: u.phone, name: u.name || '' } : null;
  }
  function requireAdmin() { return currentAdmin(); } // every admin* fn calls this first

  function remote() {
    return !!(global.BizDb && global.BizConfig && global.BizConfig.provider === 'supabase' && global.BizConfig.supabaseUrl);
  }
  function token() {
    if (global.BizAuth && BizAuth.accessToken) return BizAuth.accessToken().then(function (t) {
      if (!t) throw new Error('signed out');
      return t;
    });
    return Promise.reject(new Error('signed out'));
  }
  function draftBufKey(ownerId) { return 'bizdyali_draft_' + ownerId + '_v1'; }
  var draftServerTs = {}; // ownerId -> last known server drafts.updated_at
  var draftServerWon = false;
  function storagePathsOf(biz) {
    var out = [];
    function add(u) {
      if (!global.BizDb) return;
      var p = BizDb.storagePathFromUrl(u);
      if (p) out.push(p);
    }
    function walk(ph) { if (ph) add(typeof ph === 'string' ? ph : ph.src); }
    if (!biz) return out;
    walk(biz.logo); walk(biz.cover);
    (biz.items || []).forEach(function (it) {
      (it.photos || []).forEach(walk);
      if (it.video) add(it.video);
    });
    return out;
  }
  function dropStoragePaths(paths, tk) {
    (paths || []).forEach(function (p) {
      BizDb.storageRemove(p, tk).catch(function () {});
    });
  }

  var R = {
    myBusinesses: function (ownerId) {
      return token().then(function (t) {
        return BizDb.rest('businesses', '?select=*&order=updated_at.desc', {}, t);
      }).then(function (r) { return (r.json || []).map(BizDb.toBiz); });
    },
    getBusiness: function (id) {
      return token().then(function (t) {
        return BizDb.rest('businesses', '?id=eq.' + encodeURIComponent(id) + '&limit=1', {}, t);
      }).then(function (r) { return BizDb.toBiz((r.json || [])[0] || null); });
    },
    saveBusiness: function (biz) {
      var tk, oldPaths = [];
      return token().then(function (t) {
        tk = t;
        return BizDb.rest('businesses', '?id=eq.' + encodeURIComponent(biz.id) + '&select=logo,cover,items&limit=1', {}, t);
      }).then(function (r) {
        var old = BizDb.toBiz((r.json || [])[0] || null);
        oldPaths = old ? storagePathsOf(old) : [];
        return BizDb.rest('businesses', '', { method: 'POST', body: JSON.stringify(BizDb.toRow(biz)), prefer: 'resolution=merge-duplicates,return=representation' }, tk);
      }).then(function (r2) {
        var saved = BizDb.toBiz((r2.json || [])[0] || null);
        var fresh = {};
        storagePathsOf(saved).forEach(function (p) { fresh[p] = true; });
        dropStoragePaths(oldPaths.filter(function (p) { return !fresh[p]; }), tk);
        return { business: saved };
      });
    },
    deleteBusiness: function (id) {
      var tk, paths = [];
      return token().then(function (t) {
        tk = t;
        return BizDb.rest('businesses', '?id=eq.' + encodeURIComponent(id) + '&select=logo,cover,items&limit=1', {}, t);
      }).then(function (r) {
        var old = BizDb.toBiz((r.json || [])[0] || null);
        paths = old ? storagePathsOf(old) : [];
        return BizDb.rest('businesses', '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }, tk);
      }).then(function () {
        dropStoragePaths(paths, tk);
        return { deleted: true };
      });
    },
    publishBusiness: function (biz, slug) {
      slug = slugify(slug || biz.name);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return Promise.resolve({ error: 'Link can only contain lowercase letters, numbers and dashes.' });
      return token().then(function (t) {
        return BizDb.rpc('publish_business', { p_slug: slug, p_data: BizDb.toPayload(biz) }, t);
      }).then(function (r) {
        return { business: BizDb.toBiz(r.json) };
      }, function (e) { return { error: BizDb.mapPublishError(e).message }; });
    },
    loadDraft: function (ownerId) {
      draftServerWon = false;
      var local = null;
      try { local = JSON.parse(localStorage.getItem(draftBufKey(ownerId)) || 'null'); } catch (e) {}
      return token().then(function (t) {
        return BizDb.rest('drafts', '?owner_id=eq.' + encodeURIComponent(ownerId) + '&select=data,updated_at&limit=1', {}, t);
      }).then(function (r) {
        var row = (r.json || [])[0] || null;
        if (row && (!local || !local.serverTs || row.updated_at > local.serverTs)) {
          draftServerTs[ownerId] = row.updated_at;
          draftServerWon = !!(local && local.serverTs);
          try { localStorage.setItem(draftBufKey(ownerId), JSON.stringify({ data: row.data, serverTs: row.updated_at })); } catch (e) {}
          return row.data;
        }
        if (local) { draftServerTs[ownerId] = local.serverTs || null; return local.data; }
        return null;
      }, function () {
        if (local) { draftServerTs[ownerId] = local.serverTs || null; return local.data; }
        return null;
      });
    },
    saveDraft: function (ownerId, draft) {
      var base = draftServerTs[ownerId] || null;
      try { localStorage.setItem(draftBufKey(ownerId), JSON.stringify({ data: draft, serverTs: base })); } catch (e) {}
      return token().then(function (t) {
        return BizDb.rpc('draft_save', { p_data: draft, p_base: base }, t);
      }).then(function (r) {
        if (r.json && r.json.conflict) {
          draftServerTs[ownerId] = r.json.updated_at || null;
          try { localStorage.setItem(draftBufKey(ownerId), JSON.stringify({ data: r.json.server, serverTs: r.json.updated_at || null })); } catch (e) {}
          return { conflict: true, server: r.json.server };
        }
        draftServerTs[ownerId] = (r.json && r.json.updated_at) || null;
        return { conflict: false };
      }, function () { return { conflict: false }; });
    },
    clearDraft: function (ownerId) {
      try { localStorage.removeItem(draftBufKey(ownerId)); } catch (e) {}
      delete draftServerTs[ownerId];
      return token().then(function (t) {
        return BizDb.rest('drafts', '?owner_id=eq.' + encodeURIComponent(ownerId), { method: 'DELETE' }, t);
      }).then(function () {}, function () {});
    },
    getBySlug: function (slug) {
      return BizDb.publicBusiness(slug).then(function (j) {
        if (!j) return null;
        if (j.status) return { unavailable: true, name: j.name, slug: j.slug };
        return BizDb.toBiz(j);
      });
    },
    ensureUniqueSlug: function (slug) { return Promise.resolve(slug); },
    checkAndLogExpiry: function () { return Promise.resolve(false); },
    logEvent: function () { return Promise.resolve({ ok: true }); },
    seedDemo: function () { return Promise.resolve(); },
    currentAdmin: function () {
      var user = (global.BizAuth && BizAuth.getUser) ? BizAuth.getUser() : null;
      if (!user) return Promise.resolve(null);
      return token().then(function (t) {
        return BizDb.rest('activity_log', '?select=id&limit=1', {}, t);
      }).then(function () { return { phone: user.phone, name: user.name || '' }; },
        function () { return null; });
    },
    adminAllBusinesses: function () {
      return R.currentAdmin().then(function (admin) {
        if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
        return token();
      }).then(function (t) {
        if (!t || !t.phone) return t;
        return BizDb.rest('businesses', '?select=*&order=created_at.desc', {}, t);
      }).then(function (r) {
        if (!r.json) return r;
        return { businesses: (r.json || []).map(BizDb.toBiz).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }) };
      });
    },
    adminStats: function () {
      return R.adminAllBusinesses().then(function (res) {
        if (res.error) return res;
        var list = res.businesses;
        var now = new Date();
        var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        var startOfWeek = startOfDay - ((now.getDay() + 6) % 7) * 86400000;
        var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        var st = { total: list.length, trial: 0, subscribed: 0, expired: 0, draft: 0, suspended: 0, today: 0, week: 0, month: 0 };
        list.forEach(function (b) {
          var s = trialState(b).status;
          if (s === 'trial') st.trial++;
          else if (s === 'subscribed') st.subscribed++;
          else if (s === 'expired') st.expired++;
          else if (s === 'draft') st.draft++;
          if (b.suspended) st.suspended++;
          var c = new Date(b.createdAt).getTime();
          if (c >= startOfDay) st.today++;
          if (c >= startOfWeek) st.week++;
          if (c >= startOfMonth) st.month++;
        });
        return { stats: st };
      });
    },
    adminGetLogs: function (limit) {
      return R.currentAdmin().then(function (admin) {
        if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
        return token();
      }).then(function (t) {
        if (!t || !t.phone) return t;
        return BizDb.rest('activity_log', '?select=*&order=ts.desc&limit=' + (limit || 300), {}, t);
      }).then(function (r) {
        if (!r.json) return r;
        return { logs: (r.json || []).map(function (e) {
          return { id: e.id, ts: e.ts, type: e.type, actor: e.actor, actorName: e.actor_name,
            businessId: e.business_id, businessName: e.business_name, ownerId: e.owner_id, details: e.details };
        }) };
      });
    },
    adminUpdateInfo: function (id, fields, note) {
      var tk;
      return R.currentAdmin().then(function (admin) {
        if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
        return token();
      }).then(function (t) {
        if (!t || !t.phone) return t;
        tk = t;
        var body = {};
        ['name', 'category', 'description', 'phone', 'whatsapp', 'address', 'city', 'hours', 'facebook', 'instagram'].forEach(function (k) {
          if (fields[k] !== undefined) body[k] = fields[k];
        });
        if (fields.offeringType !== undefined) body.offering_type = fields.offeringType;
        return BizDb.rest('businesses', '?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) }, tk);
      }).then(function () { return R.getBusiness(id); })
        .then(function (biz) { return biz ? { business: biz } : { error: 'Business not found.' }; });
    },
    adminStatus: function (id, args) {
      return R.currentAdmin().then(function (admin) {
        if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
        return token();
      }).then(function (t) {
        if (!t || !t.phone) return t;
        return BizDb.rpc('admin_set_status', Object.assign({ p_business_id: id, p_trial_end: null, p_subscription: null, p_suspended: null, p_published: null }, args || {}), t);
      }).then(function (r) { return { business: BizDb.toBiz(r.json) }; },
        function (e) { return { error: (e && e.message) || 'request failed' }; });
    },
    adminExtendTrial: function (id, extraDays) {
      extraDays = Math.max(1, Math.min(365, Number(extraDays) || 0));
      if (!extraDays) return Promise.resolve({ error: 'Please enter a valid number of days.' });
      return R.getBusiness(id).then(function (biz) {
        if (!biz) return { error: 'Business not found.' };
        if (!biz.published) return { error: 'Only published pages have a trial to extend.' };
        var base = Math.max(new Date(biz.trialEnd).getTime(), Date.now());
        return R.adminStatus(id, { p_trial_end: new Date(base + extraDays * 86400000).toISOString() });
      });
    },
    adminSetSubscription: function (id, active) {
      return R.adminStatus(id, { p_subscription: active ? 'active' : 'none' });
    },
    adminSetSuspended: function (id, suspended) {
      return R.adminStatus(id, { p_suspended: !!suspended });
    },
    adminUnpublish: function (id) {
      return R.adminStatus(id, { p_published: false });
    },
    adminDeleteBusiness: function (id) {
      var tk, paths = [];
      return R.currentAdmin().then(function (admin) {
        if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
        return R.getBusiness(id);
      }).then(function (biz) {
        if (!biz || biz.error) return biz || { error: 'Business not found.' };
        paths = storagePathsOf(biz);
        return token();
      }).then(function (t) {
        if (!t || !t.phone) return t;
        tk = t;
        return BizDb.rest('businesses', '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }, tk);
      }).then(function () { dropStoragePaths(paths, tk); return { deleted: true }; });
    }
  };

  var api = {
    TRIAL_DAYS: TRIAL_DAYS,
    SUBSCRIPTION_PRICE: SUBSCRIPTION_PRICE,
    isRemote: function () { return remote(); },
    draftServerWon: function () { var w = draftServerWon; draftServerWon = false; return w; },


    // ---- Businesses (independent per business, scoped per owner) ----
    blankBusiness: blankBusiness,
    myBusinesses: function (ownerId) {
      if (remote()) return R.myBusinesses(ownerId);
      return Promise.resolve(allBusinesses().filter(function (b) { return b.ownerId === ownerId; })
        .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }));
    },
    getBusiness: function (id) {
      if (remote()) return R.getBusiness(id);
      return Promise.resolve(allBusinesses().find(function (b) { return b.id === id; }) || null);
    },
    getBySlug: function (slug) {
      if (remote()) return R.getBySlug(slug);
      slug = String(slug || '').toLowerCase();
      return Promise.resolve(allBusinesses().find(function (b) { return b.slug === slug && b.published; }) || null);
    },
    saveBusiness: function (biz) {
      if (remote()) return R.saveBusiness(biz);
      return Promise.resolve().then(function () {
        biz.updatedAt = new Date().toISOString();
        var list = allBusinesses();
        var i = list.findIndex(function (b) { return b.id === biz.id; });
        if (i >= 0) list[i] = biz; else list.push(biz);
        try { saveAllBusinesses(list); }
        catch (e) { return { error: 'Storage is full (large photos/videos). Try smaller images.' }; }
        return { business: biz };
      });
    },
    deleteBusiness: function (id) {
      if (remote()) return R.deleteBusiness(id);
      return Promise.resolve().then(function () {
        saveAllBusinesses(allBusinesses().filter(function (b) { return b.id !== id; }));
        return { deleted: true };
      });
    },
    slugify: slugify,
    ensureUniqueSlug: function (slug, ignoreId) {
      if (remote()) return R.ensureUniqueSlug(slug);
      return Promise.resolve(ensureUniqueSlug(slug, ignoreId));
    },
    publishBusiness: function (biz, slug) {
      if (remote()) return R.publishBusiness(biz, slug);
      return Promise.resolve().then(function () {
      slug = slugify(slug || biz.name);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { error: 'Link can only contain lowercase letters, numbers and dashes.' };
      biz.slug = ensureUniqueSlug(slug, biz.id);
      var now = new Date();
      biz.published = true;
      biz.status = 'trial';
      if (biz.subscription !== 'active') biz.subscription = 'none';
      biz.suspended = false;
      biz.expiryLogged = false;
      try {
        var sess = (global.BizAuth && BizAuth.getUser) ? BizAuth.getUser() : null;
        if (sess && sess.id === biz.ownerId) { biz.ownerName = sess.name || ''; biz.ownerPhone = sess.phone || ''; }
      } catch (e) {}
      biz.trialStart = now.toISOString();
      biz.trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
      return api.saveBusiness(biz).then(function (res) {
        if (!res.error) {
          var counts = { product: 0, service: 0 };
          (biz.items || []).forEach(function (it) { counts[it.kind === 'service' ? 'service' : 'product']++; });
          logEvent('business_created', { actor: 'owner', actorName: biz.ownerName, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: counts.product + ' products, ' + counts.service + ' services' });
          logEvent('trial_started', { actor: 'system', businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Free until ' + fmtDate(biz.trialEnd) });
        }
        return res;
      });
      });
    },

    // ---- Wizard draft (per user, so refresh never loses work) ----
    loadDraft: function (ownerId) {
      if (remote()) return R.loadDraft(ownerId);
      return Promise.resolve(read('bizdyali_draft_' + ownerId + '_v1', null));
    },
    saveDraft: function (ownerId, draft) {
      if (remote()) return R.saveDraft(ownerId, draft);
      return Promise.resolve().then(function () {
        try { write('bizdyali_draft_' + ownerId + '_v1', draft); } catch (e) { /* draft too big, ignore */ }
        return { conflict: false };
      });
    },
    clearDraft: function (ownerId) {
      if (remote()) return R.clearDraft(ownerId);
      return Promise.resolve().then(function () {
        try { localStorage.removeItem('bizdyali_draft_' + ownerId + '_v1'); } catch (e) {}
      });
    },

    trialState: trialState,
    subscriptionStatus: subscriptionStatus,
    checkAndLogExpiry: function (biz) {
      if (remote()) return R.checkAndLogExpiry(biz);
      return Promise.resolve(checkAndLogExpiry(biz));
    },
    publicUrl: publicUrl,
    fmtDate: fmtDate,

    // ---- Admin (every function re-verifies the owner-phone gate) ----
    currentAdmin: function () {
      if (remote()) return R.currentAdmin();
      return Promise.resolve(currentAdmin());
    },
    adminLogout: function () { if (global.BizAuth) BizAuth.signOut(); },
    adminAllBusinesses: function () {
      if (remote()) return R.adminAllBusinesses();
      if (!requireAdmin()) return { error: 'Not authorized. Admin sign-in required.' };
      return { businesses: allBusinesses().slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }) };
    },
    adminStats: function () {
      if (remote()) return R.adminStats();
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
      if (remote()) return R.adminGetLogs(limit);
      if (!requireAdmin()) return { error: 'Not authorized. Admin sign-in required.' };
      var logs = allLogs().slice().sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
      return { logs: logs.slice(0, limit || 300) };
    },
    // All mutations below verify admin session AND record an admin_action event.
    adminUpdateInfo: function (id, fields, note) {
      if (remote()) return R.adminUpdateInfo(id, fields, note);
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      ['name', 'category', 'description', 'phone', 'whatsapp', 'address', 'city', 'hours', 'facebook', 'instagram', 'offeringType'].forEach(function (k) {
        if (fields[k] !== undefined) biz[k] = fields[k];
      });
      var res = api.saveBusiness(biz);
      if (!res.error) {
        logEvent('info_changed', { actor: 'admin', actorName: admin.phone, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: note || 'Edited by admin' });
        logEvent('admin_action', { actor: 'admin', actorName: admin.phone, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Edited business information' + (note ? ': ' + note : '') });
      }
      return res.error ? res : { business: biz };
    },
    adminExtendTrial: function (id, extraDays) {
      if (remote()) return R.adminExtendTrial(id, extraDays);
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
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.phone, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Extended trial by ' + extraDays + ' days (now ends ' + fmtDate(biz.trialEnd) + ')' });
      return res.error ? res : { business: biz };
    },
    adminSetSubscription: function (id, active) {
      if (remote()) return R.adminSetSubscription(id, active);
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      biz.subscription = active ? 'active' : 'none';
      biz.status = active ? 'subscribed' : (Date.now() > new Date(biz.trialEnd).getTime() ? 'expired' : 'trial');
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.phone, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: active ? 'Marked as PAID subscriber (100 MAD/month placeholder, no payment processed)' : 'Subscription removed (back to trial/expired flow)' });
      return res.error ? res : { business: biz };
    },
    adminSetSuspended: function (id, suspended) {
      if (remote()) return R.adminSetSuspended(id, suspended);
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      biz.suspended = !!suspended;
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.phone, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: suspended ? 'Disabled public page (data kept)' : 'Re-enabled public page' });
      return res.error ? res : { business: biz };
    },
    adminUnpublish: function (id) {
      if (remote()) return R.adminUnpublish(id);
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      biz.published = false; biz.status = 'draft';
      var res = api.saveBusiness(biz);
      if (!res.error) logEvent('admin_action', { actor: 'admin', actorName: admin.phone, businessId: biz.id, businessName: biz.name, ownerId: biz.ownerId, details: 'Unpublished page (moved back to draft)' });
      return res.error ? res : { business: biz };
    },
    adminDeleteBusiness: function (id) {
      if (remote()) return R.adminDeleteBusiness(id);
      var admin = requireAdmin();
      if (!admin) return { error: 'Not authorized. Admin sign-in required.' };
      var biz = allBusinesses().find(function (b) { return b.id === id; });
      if (!biz) return { error: 'Business not found.' };
      saveAllBusinesses(allBusinesses().filter(function (b) { return b.id !== id; }));
      logEvent('admin_action', { actor: 'admin', actorName: admin.phone, businessId: id, businessName: biz.name, ownerId: biz.ownerId, details: 'PERMANENTLY DELETED business and all its data' });
      return { deleted: true };
    },
    logEvent: function (type, opts) {
      if (remote()) return R.logEvent(type, opts);
      return Promise.resolve(logEvent(type, opts));
    } // owner flows log their own actions
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
    dataURLtoBlob: dataURLtoBlob,
    storagePathsOf: storagePathsOf,
    uploadImageRemote: function (file, maxFull, uid, tk) {
      // Same orientation/WebP/resize pipeline as local; the encoded full-size
      // image is what gets uploaded (thumb stays a local preview).
      return api.media.processImage(file, { maxFull: maxFull }).then(function (o) {
        return BizDb.storageUpload(uid, BizDb.dataURLtoBlob(o.full), o.type, tk).then(function (url) {
          return { src: url };
        });
      });
    },
    uploadVideoRemote: function (file, uid, tk) {
      if (!file || !/^video\//.test(file.type || '')) return Promise.reject(new Error('Unsupported video type.'));
      if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('Video is too large (max 10 MB in this demo).'));
      return BizDb.storageUpload(uid, file, file.type, tk).then(function (url) { return url; });
    },
    dropStorageRef: function (ref, tk) {
      if (!global.BizDb) return Promise.resolve(false);
      var p = BizDb.storagePathFromUrl(typeof ref === 'string' ? ref : (ref && ref.src));
      if (!p) return Promise.resolve(false);
      return BizDb.storageRemove(p, tk).catch(function () { return false; });
    },
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
    if (remote()) return;
    var now = Date.now();
    var D = 86400000;
    // Curated demo photography (verified Unsplash CDN URLs).
    function U(id, w) { return 'https://images.unsplash.com/' + id + '?w=' + (w || 1200) + '&q=70&auto=format&fit=crop'; }
    var CAFE_COVER = U('photo-1554118811-1e0d58224f24', 1600);
    var CAFE_PHOTOS = {
      espresso: [U('photo-1495474472287-4d71bcdd2085', 900), U('photo-1445116572660-236099ec97a0', 900)],
      msemen: [U('photo-1555507036-ab1f4038808a', 900)],
      tiramisu: [U('photo-1578985545062-69928b1d9587', 900)],
      birthday: [U('photo-1464349095431-e9a21285b5f3', 900)]
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
    if (nassim) {
      var di3b = (nassim.items || []).find(function (it) { return it.id === 'di3'; });
      if (di3b && !(di3b.photos || []).length) {
        di3b.photos = CAFE_PHOTOS.birthday.slice();
        try { saveAllBusinesses(list); } catch (e) { /* ignore */ }
      }
      return;
    }
    function demoBiz(o) {
      var b = {
        id: o.id, ownerId: 'demo', demo: true,
        ownerName: o.ownerName, ownerPhone: o.ownerPhone,
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
      { id: 'di3', kind: 'service', name: 'Birthday Table Setup', description: 'We decorate a table for your celebration.', price: 150, photos: CAFE_PHOTOS.birthday.slice(), video: null, order: 3 }
    ];
    var seeds = [
      demoBiz({ id: 'biz_demo_nassim', ownerName: 'Salma Bennani', ownerPhone: '+212661000000',
        name: 'Café Nassim', category: 'Café', city: 'Casablanca', address: '12 Rue Yacoub El Mansour, Maârif',
        desc: 'A cozy neighbourhood café in Maârif. Fresh msemen every morning, great espresso, sunny terrace.',
        cover: CAFE_COVER,
        items: items1, slug: 'cafe-nassim', status: 'trial', published: true,
        trialStart: new Date(now - 1 * D).toISOString(), trialEnd: new Date(now + 13 * D).toISOString(),
        createdAt: new Date(now - 1 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_salon', ownerName: 'Yassine El Fassi', ownerPhone: '+212662000000',
        name: 'Salon Narjis', category: 'Salon / Barber', city: 'Rabat', address: '5 Av. Annakhil, Agdal',
        desc: 'Modern salon for women and men. Bridal packages available on reservation.',
        items: [{ id: 'ds1', kind: 'service', name: 'Haircut & Brushing', description: 'Cut, wash and styling.', price: 120, photos: [], video: null, order: 0 }],
        slug: 'salon-narjis', status: 'trial', published: true,
        trialStart: new Date(now - 12 * D).toISOString(), trialEnd: new Date(now + 2 * D).toISOString(),
        createdAt: new Date(now - 12 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_old', ownerName: 'Karim Tazi', ownerPhone: '+212663000000',
        name: 'Tazi Electronics', category: 'Electronics / Repair', city: 'Fès', address: '8 Rue Talaa Kebira',
        desc: 'Phone and laptop repair with 3-month warranty on all fixes.',
        items: [{ id: 'do1', kind: 'service', name: 'Screen Replacement', description: 'Original-quality screens.', price: 350, photos: [], video: null, order: 0 }],
        slug: 'tazi-electronics', status: 'expired', published: true,
        trialStart: new Date(now - 20 * D).toISOString(), trialEnd: new Date(now - 6 * D).toISOString(),
        createdAt: new Date(now - 20 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_paid', ownerName: 'Salma Bennani', ownerPhone: '+212661000000',
        name: 'Nassim Traiteur', category: 'Services', city: 'Casablanca', address: '12 Rue Yacoub El Mansour',
        desc: 'Catering for weddings and corporate events across Casablanca.',
        items: [{ id: 'dp1', kind: 'service', name: 'Wedding Menu (per guest)', description: 'Full traditional menu.', price: 220, photos: [], video: null, order: 0 }],
        slug: 'nassim-traiteur', status: 'subscribed', published: true, subscription: 'active',
        trialStart: new Date(now - 40 * D).toISOString(), trialEnd: new Date(now - 26 * D).toISOString(),
        createdAt: new Date(now - 40 * D).toISOString() }),
      demoBiz({ id: 'biz_demo_draft', ownerName: 'Mehdi Alaoui', ownerPhone: '+212664000000',
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
        ['account_created', 'owner', 'Salma Bennani', 'biz_demo_nassim', 'Café Nassim', 'demo', '+212661000000', 1],
        ['business_created', 'owner', 'Salma Bennani', 'biz_demo_nassim', 'Café Nassim', 'demo', '0 products, 0 services', 1],
        ['trial_started', 'system', '', 'biz_demo_nassim', 'Café Nassim', 'demo', '', 1],
        ['product_added', 'owner', 'Salma Bennani', 'biz_demo_nassim', 'Café Nassim', 'demo', 'Espresso — 15 MAD', 1],
        ['account_created', 'owner', 'Karim Tazi', 'biz_demo_old', 'Tazi Electronics', 'demo', '+212663000000', 20],
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
