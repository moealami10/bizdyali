/* BizDyali server data layer (Phase 3b). Vanilla fetch against Supabase
 * PostgREST / RPC / Storage. No auto-run on include. Browser + Node (tests
 * stub fetch via BizDb._setFetch). Anon calls send the apikey ONLY, never an
 * Authorization header. Media uploads are owner-pathed {uid}/{uuid}.{ext}. */
(function (global) {
  'use strict';

  var fetchImpl = null;
  function http(url, opts) {
    var f = fetchImpl || (typeof global.fetch !== 'undefined' ? global.fetch.bind(global) : null);
    if (!f) return Promise.reject(new Error('no fetch'));
    return f(url, opts);
  }
  function cfg() { return global.BizConfig || {}; }
  function base() { return String(cfg().supabaseUrl || '').replace(/\/$/, ''); }
  function anonKey() { return cfg().supabaseAnonKey || ''; }

  function headers(token, json, prefer) {
    var h = { apikey: anonKey() };
    if (token) h.Authorization = 'Bearer ' + token;
    if (json) h['Content-Type'] = 'application/json';
    if (prefer) h.Prefer = prefer;
    return h;
  }
  function readError(status, body, fallback) {
    var err = new Error((body && (body.message || body.msg || body.error)) || fallback || 'request failed');
    err.status = status;
    err.code = body && body.code;
    err.detail = body && (body.details || body.hint);
    return err;
  }
  function call(path, opts, token, fallbackErr) {
    return http(base() + path, {
      method: (opts && opts.method) || 'GET',
      headers: headers(token, !!(opts && opts.body), opts && opts.prefer),
      body: opts && opts.body
    }).then(function (r) {
      if (r.status === 204 || r.status === 404 && (opts && opts.allow404)) return { status: r.status, json: null };
      return r.json().catch(function () { return null; }).then(function (b) {
        if (!r.ok) throw readError(r.status, b, fallbackErr);
        return { status: r.status, json: b };
      });
    });
  }
  function rest(table, query, opts, token) {
    return call('/rest/v1/' + table + (query || ''), opts, token, 'save failed');
  }
  function rpc(fn, args, token) {
    return call('/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) }, token, 'request failed');
  }

  function uuid() {
    var b;
    if (global.crypto && global.crypto.getRandomValues) {
      b = new Uint8Array(16);
      global.crypto.getRandomValues(b);
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    } else {
      b = new Uint8Array(16);
      for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
      b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    }
    function hx(n, pad) { var s = n.toString(16); while (s.length < (pad || 2)) s = '0' + s; return s; }
    var s = '';
    for (var j = 0; j < 16; j++) s += hx(b[j]);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
  }
  var EXT_BY_MIME = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm'
  };
  function dataURLtoBlob(dataURL) {
    var m = /^data:([^;,]+)[^,]*,([\s\S]*)$/.exec(String(dataURL || ''));
    if (!m) throw new Error('bad data URL');
    var bin = global.atob ? global.atob(m[2]) : Buffer.from(m[2], 'base64').toString('binary');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof Blob !== 'undefined') return new Blob([bytes], { type: m[1] });
    return { bytes: bytes, type: m[1] };
  }
  function publicObjectUrl(path) {
    return base() + '/storage/v1/object/public/business-media/' + path;
  }
  function storagePathFromUrl(url) {
    var m = /\/storage\/v1\/object\/public\/business-media\/(.+)$/.exec(String(url || ''));
    return m ? m[1] : null;
  }
  function storageUpload(uid, blob, mime, token) {
    var ext = EXT_BY_MIME[String(mime || '').toLowerCase().split(';')[0]];
    if (!ext) return Promise.reject(new Error('unsupported media type'));
    if (!uid || !token) return Promise.reject(new Error('not signed in'));
    var path = uid + '/' + uuid() + '.' + ext;
    return http(base() + '/storage/v1/object/business-media/' + path, {
      method: 'POST',
      headers: { apikey: anonKey(), Authorization: 'Bearer ' + token, 'Content-Type': mime },
      body: blob
    }).then(function (r) {
      if (!r.ok) throw readError(r.status, null, 'upload failed');
      return publicObjectUrl(path);
    });
  }
  function storageRemove(path, token) {
    if (!path || !token) return Promise.resolve(false);
    return http(base() + '/storage/v1/object/business-media/' + path, {
      method: 'DELETE',
      headers: { apikey: anonKey(), Authorization: 'Bearer ' + token }
    }).then(function (r) { return r.ok; }, function () { return false; });
  }

  // Map a server business row (snake_case) to the app shape (camelCase).
  function toBiz(r) {
    if (!r) return null;
    return {
      id: r.id, ownerId: r.owner_id, ownerName: '', ownerPhone: '',
      slug: r.slug, name: r.name, category: r.category, description: r.description,
      phone: r.phone, whatsapp: r.whatsapp, address: r.address, city: r.city, hours: r.hours,
      facebook: r.facebook, instagram: r.instagram, offeringType: r.offering_type || 'both',
      logo: r.logo || null, cover: r.cover || null, items: r.items || [],
      theme: r.theme || {}, hoursWeek: r.hours_week || null,
      testimonials: r.testimonials || [], trust: r.trust || [],
      published: !!r.published, status: r.published ? 'trial' : 'draft',
      subscription: r.subscription || 'none', suspended: !!r.suspended, expiryLogged: true,
      trialStart: r.trial_start || null, trialEnd: r.trial_end || null,
      createdAt: r.created_at || null, updatedAt: r.updated_at || null
    };
  }
  function photoObj(p) {
    if (typeof p === 'string') return p;
    if (p && p.src) { var o = { src: p.src }; if (p.fx != null) o.fx = p.fx; if (p.fy != null) o.fy = p.fy; if (p.thumb) o.thumb = p.thumb; return o; }
    return '';
  }
  // Map app shape to publish_business() p_data (server ignores unknown keys safely).
  function toPayload(biz) {
    return {
      name: biz.name, category: biz.category, description: biz.description,
      phone: biz.phone, whatsapp: biz.whatsapp, address: biz.address, city: biz.city,
      hours: biz.hours, facebook: biz.facebook, instagram: biz.instagram,
      offeringType: biz.offeringType,
      logo: typeof biz.logo === 'string' ? biz.logo : ((biz.logo && biz.logo.src) || ''),
      cover: typeof biz.cover === 'string' ? biz.cover : ((biz.cover && biz.cover.src) || ''),
      items: (biz.items || []).map(function (it) {
        return {
          id: it.id, kind: it.kind, name: it.name, description: it.description, price: it.price,
          photos: (it.photos || []).map(photoObj),
          video: typeof it.video === 'string' ? it.video : (it.video || ''),
          order: it.order, section: it.section, badge: it.badge, duration: it.duration
        };
      }),
      theme: biz.theme || {}, hoursWeek: biz.hoursWeek || {},
      testimonials: biz.testimonials || [], trust: biz.trust || []
    };
  }
  function mapPublishError(e) {
    var msg = String((e && e.message) || '');
    if (/business limit reached/i.test(msg)) { e.code = 'cap'; e.message = 'ما يمكنش تزيد أكثر من 5 دالصفحات.'; }
    else if (e.status === 409 || /duplicate|unique|slug/i.test(msg)) { e.code = 'taken'; e.message = 'هاد الرابط مستعمل. بدّل شوية.'; }
    return e;
  }

  // App shape to server row (snake_case). Omits every server-owned column so
  // column grants never reject owner writes; publish/admin RPCs own the rest.
  function toRow(biz) {
    var pl = toPayload(biz);
    return {
      id: biz.id, slug: biz.slug, name: pl.name, category: pl.category,
      description: pl.description, phone: pl.phone, whatsapp: pl.whatsapp,
      address: pl.address, city: pl.city, hours: pl.hours,
      facebook: pl.facebook, instagram: pl.instagram, offering_type: pl.offeringType,
      logo: pl.logo, cover: pl.cover, items: pl.items, theme: pl.theme,
      hours_week: pl.hoursWeek, testimonials: pl.testimonials, trust: pl.trust
    };
  }
  global.BizDb = {
    rest: rest, rpc: rpc, uuid: uuid, dataURLtoBlob: dataURLtoBlob, toRow: toRow,
    publicObjectUrl: publicObjectUrl, storagePathFromUrl: storagePathFromUrl,
    storageUpload: storageUpload, storageRemove: storageRemove,
    toBiz: toBiz, toPayload: toPayload, mapPublishError: mapPublishError,
    publicBusiness: function (slug) {
      return rpc('public_business', { p_slug: slug }, null).then(function (r) { return r.json; });
    },
    publicDirectory: function () {
      return rpc('public_directory', {}, null).then(function (r) { return r.json || []; });
    },
    _setFetch: function (fn) { fetchImpl = fn; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.BizDb;
})(typeof window !== 'undefined' ? window : globalThis);
