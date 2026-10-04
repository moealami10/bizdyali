/* BizDyali flagship public-page renderer — component system (phase 2).
   API stable: renderPublicPage(biz, mount, opts), esc, waLink, mapsLink.
   opts: { chrome:boolean (sticky bars), seo:boolean }.
   Wires theme (BizTheme), language (BizI18n) and focal media (BizDyali.media).
   Sections render only when data exists. No emoji UI. */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function ic(name, cls) {
    if (global.BizIcons) return global.BizIcons.icon(name, cls);
    return '';
  }
  function waLink(number, text) {
    var digits = String(number || '').replace(/\D/g, '');
    return 'https://wa.me/' + digits + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function mapsLink(biz) {
    var q = [biz.address, biz.city].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || biz.city || biz.name);
  }
  function initials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((words[0] || 'B').charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
  }
  function media() { return (global.BizDyali && global.BizDyali.media) || {}; }
  function photoSrc(p) {
    var m = media();
    if (m.photoSrc) return m.photoSrc(p);
    return typeof p === 'string' ? p : ((p && p.src) || '');
  }
  function photoPos(p) {
    var m = media();
    if (m.photoPosition) return m.photoPosition(p);
    return '50% 50%';
  }
  function isFoodCategory(cat) {
    return /restaurant|caf[eé]|bakery|pastry|boulanger|p[aâ]tisserie|pizza|burger|tacos|food|snack|traiteur|grocery|hanout|sushi|kebab/i.test(String(cat || ''));
  }
  function priceText(p, T) { return (p === '' || p == null) ? '' : esc(p) + ' ' + esc(T('currency')); }
  function itemOrder(it) { return (it.order || 0); }

  /* Category-aware no-photo plate: SVG pattern tinted with the accent.
     Never a grey box or broken icon. */
  function plateFor(seed, accent) {
    var a = String(accent || '#0A6B4F').replace('#', '');
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
      '<rect width="400" height="300" fill="#' + a + '" fill-opacity="0.14"/>' +
      '<g stroke="#' + a + '" stroke-opacity="0.35" stroke-width="1.5">' +
      '<path d="M-20 320 L120 180 L60 120 L200 260 L140 200 L280 340 L220 280 L360 420"/>' +
      '<circle cx="330" cy="70" r="46" fill="none"/>' +
      '<circle cx="330" cy="70" r="30" fill="#' + a + '" fill-opacity="0.18"/></g></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(s).replace(/'/g, '%27');
  }

  /* ---------------- Structured hours → live status ---------------- */
  function casablancaParts() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Casablanca', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return { day: days[o.weekday], mins: parseInt(o.hour, 10) * 60 + parseInt(o.minute, 10) };
    } catch (e) {
      var d = new Date();
      return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes() };
    }
  }
  function toMins(t) {
    var m = String(t || '').match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }
  function openStatus(biz, T) {
    var week = biz.hoursWeek;
    if (!week) return null;
    var now = casablancaParts();
    var names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    function ranges(dayIdx) {
      var key = names[(dayIdx + 7) % 7];
      var r = week[key] || week[String((dayIdx + 7) % 7)] || [];
      return r.map(function (pair) { return [toMins(pair[0]), toMins(pair[1])]; })
        .filter(function (p) { return p[0] != null && p[1] != null; });
    }
    var i, r;
    r = ranges(now.day);
    for (i = 0; i < r.length; i++) {
      var o = r[i][0], c = r[i][1];
      var open = c > o ? (now.mins >= o && now.mins < c) : (now.mins >= o || now.mins < c);
      if (open) return { open: true, label: T('openNow') + ' ' + T('closesAt', { t: String(r[i][1] / 60 | 0).padStart(2, '0') + ':' + String(r[i][1] % 60).padStart(2, '0') }) };
    }
    // Next opening today, else tomorrow.
    for (i = 0; i < r.length; i++) {
      if (r[i][0] > now.mins) return { open: false, label: T('closedNow') + ' ' + T('opensAt', { t: String(r[i][0] / 60 | 0).padStart(2, '0') + ':' + String(r[i][0] % 60).padStart(2, '0') }) };
    }
    var tm = ranges(now.day + 1);
    if (tm.length) return { open: false, label: T('closedNow') + ' ' + T('opensAt', { t: String(tm[0][0] / 60 | 0).padStart(2, '0') + ':' + String(tm[0][0] % 60).padStart(2, '0') }) };
    return { open: false, label: T('closedNow') };
  }

  /* ---------------- Components (all take T for UI strings) ---------------- */

  function logoHtml(biz, cls) {
    if (!biz.logo) return '';
    return '<div class="' + cls + '" role="img" aria-label="' + esc(biz.name) + '"><img class="ld" src="' + photoSrc(biz.logo) + '" style="object-position:' + esc(photoPos(biz.logo)) + '" alt="' + esc(biz.name) + '" /></div>';
  }

  function heroOverlayHtml(biz, T) {
    var coverInner = biz.cover
      ? '<img class="ld" src="' + photoSrc(biz.cover) + '" style="object-position:' + esc(photoPos(biz.cover)) + '" alt="" fetchpriority="high" decoding="async" />'
      : '';
    var cover = '<div class="bp-cover' + (biz.cover ? '' : ' bp-cover--empty') + '">' + coverInner + '<div class="bp-scrim"></div>' +
      '<div class="bp-hero-in wrap">' +
      '<p class="bp-eyebrow"><span class="nw">' + esc(biz.category || 'Local business') + '</span>' +
      (biz.city ? '<span class="nw"><span class="sep" aria-hidden="true">• </span>' + esc(biz.city) + '</span>' : '') + '</p>' +
      '<h1 class="bp-name" dir="auto">' + esc(biz.name) + '</h1>' +
      '</div></div>';
    return cover + '<div class="bp-id"><div class="wrap">' +
      '<div class="bp-id-row">' + logoHtml(biz, 'bp-logo') + '</div>' +
      metaHtml(biz, T) + '<div class="bp-id-grid">' + descHtml(biz) + actionsHtml(biz, T) + '</div>' +
      '</div></div>';
  }

  function heroSplitHtml(biz, T) {
    // Workshop: compact band, bold identity left, actions tight.
    var cover = biz.cover
      ? '<div class="bp-split-media"><img class="ld" src="' + photoSrc(biz.cover) + '" style="object-position:' + esc(photoPos(biz.cover)) + '" alt="" fetchpriority="high" decoding="async" /></div>'
      : '<div class="bp-split-media bp-split-empty" aria-hidden="true"></div>';
    return '<div class="bp-hero-split wrap">' +
      '<div class="bp-split-id">' + logoHtml(biz, 'bp-logo') +
      '<p class="bp-eyebrow"><span class="nw">' + esc(biz.category || 'Local business') + '</span>' +
      (biz.city ? '<span class="nw"><span class="sep" aria-hidden="true">• </span>' + esc(biz.city) + '</span>' : '') + '</p>' +
      '<h1 class="bp-name" dir="auto">' + esc(biz.name) + '</h1>' +
      metaHtml(biz, T) + descHtml(biz) + actionsHtml(biz, T) + '</div>' + cover + '</div>';
  }

  function heroCompactHtml(biz, T) {
    // Market: slim band, name + quick actions in one breath.
    var cover = biz.cover
      ? '<div class="bp-cover bp-cover--slim"><img class="ld" src="' + photoSrc(biz.cover) + '" style="object-position:' + esc(photoPos(biz.cover)) + '" alt="" fetchpriority="high" decoding="async" /><div class="bp-scrim"></div></div>'
      : '<div class="bp-cover bp-cover--empty bp-cover--slim" aria-hidden="true"></div>';
    return cover + '<div class="bp-id"><div class="wrap">' +
      '<div class="bp-id-row">' + logoHtml(biz, 'bp-logo') +
      '<div style="min-width:0"><p class="bp-eyebrow"><span class="nw">' + esc(biz.category || 'Local business') + '</span>' +
      (biz.city ? '<span class="nw"><span class="sep" aria-hidden="true">• </span>' + esc(biz.city) + '</span>' : '') + '</p>' +
      '<h1 class="bp-name" dir="auto">' + esc(biz.name) + '</h1></div></div>' +
      metaHtml(biz, T) + '<div class="bp-id-grid">' + descHtml(biz) + actionsHtml(biz, T) + '</div>' +
      '</div></div>';
  }

  function metaHtml(biz, T) {
    var meta = [];
    if (biz.city) meta.push('<span class="chip">' + ic('map-pin') + esc(biz.city) + '</span>');
    var st = openStatus(biz, T);
    if (st) meta.push('<span class="chip chip-open' + (st.open ? '' : ' is-closed') + '"><span class="pulse" aria-hidden="true"></span>' + esc(st.label) + '</span>');
    else if (biz.hours) meta.push('<span class="chip">' + ic('clock') + esc(biz.hours) + '</span>');
    if (!meta.length) return '';
    return '<div class="bp-meta">' + meta.join('') + '</div>';
  }
  function descHtml(biz) {
    if (!biz.description) return '';
    return '<div class="bp-desc" dir="auto">' + esc(biz.description).split(/\n{2,}|\n/).map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>';
  }

  function actionsHtml(biz, T) {
    var btns = [];
    if (biz.whatsapp) btns.push('<a class="btn-bp btn-wa" data-act="wa" href="' + waLink(biz.whatsapp, 'Hello ' + biz.name + '! I found you on BizDyali.') + '" target="_blank" rel="noopener">' + ic('message-circle') + '<span>WhatsApp</span></a>');
    if (biz.phone) btns.push('<a class="btn-bp btn-line" data-act="call" href="tel:' + esc(String(biz.phone).replace(/\s/g, '')) + '">' + ic('phone') + '<span>' + esc(T('call')) + '</span></a>');
    if (biz.address || biz.city) btns.push('<a class="btn-bp btn-quiet" data-act="dir" href="' + mapsLink(biz) + '" target="_blank" rel="noopener">' + ic('navigation') + '<span>' + esc(T('directions')) + '</span></a>');
    btns.push('<button class="btn-bp btn-quiet" data-share type="button">' + ic('share-2') + '<span>' + esc(T('share')) + '</span></button>');
    return '<div class="bp-actions" data-sentinel id="sec-contact">' + btns.join('') + '</div>';
  }

  function orderLinkHtml(biz, it, T) {
    if (!biz.whatsapp) return '';
    var msg = it.name + (it.price != null && it.price !== '' ? ' — ' + it.price + ' ' + T('currency') : '');
    return '<a class="order-link" href="' + waLink(biz.whatsapp, msg) + '" target="_blank" rel="noopener">' + ic('message-circle') + esc(T('askWhatsApp')) + '</a>';
  }
  function badgeHtml(it, T) {
    if (!it.badge) return '';
    var label = it.badge === 'popular' ? T('popular') : (it.badge === 'new' ? T('isNew') : it.badge);
    return ' <span class="badge-flag">' + esc(label) + '</span>';
  }

  function itemEditorial(biz, it, T, accent) {
    var photos = it.photos || [];
    var main = photos.length
      ? '<img class="ld" data-main src="' + photoSrc(photos[0]) + '" style="aspect-ratio:16/10;width:100%;object-fit:cover;object-position:' + esc(photoPos(photos[0])) + ';cursor:zoom-in" alt="' + esc(it.name) + '" loading="lazy" decoding="async" data-lb data-g="e-' + esc(it.id) + '" data-i="0" tabindex="0" role="button" aria-label="' + esc(T('openItemPhoto', { name: it.name })) + '" />'
      : '<img class="ld" data-main src="' + plateFor(it.id, accent) + '" style="aspect-ratio:16/10;width:100%;object-fit:cover" alt="" loading="lazy" />';
    var thumbs = photos.length > 1
      ? '<div class="feat-thumbs" data-thumbs>' + photos.map(function (p, i) {
          return '<button type="button" data-src="' + photoSrc(p) + '" aria-current="' + (i === 0) + '" aria-label="' + esc(T('showPhoto', { n: i + 1 })) + '"><img src="' + photoSrc(p) + '" style="object-position:' + esc(photoPos(p)) + '" alt="" loading="lazy" /></button>';
        }).join('') + '</div>' : '';
    return '<article class="feat-item rv" data-item="' + esc(it.id) + '">' +
      '<div class="feat-media">' + main + '</div>' +
      '<div><h3 class="feat-name" dir="auto">' + esc(it.name) + badgeHtml(it, T) + '</h3>' +
      '<div class="feat-sub">' + (priceText(it.price, T) ? '<span class="price">' + priceText(it.price, T) + '</span>' : '') +
      (it.duration ? '<span class="dur">' + esc(it.duration) + '</span>' : '') + '</div>' +
      (it.description ? '<p class="feat-desc" dir="auto">' + esc(it.description) + '</p>' : '') +
      thumbs + orderLinkHtml(biz, it, T) + videoHtml(it, T) + '</div></article>';
  }

  function itemGridCard(biz, it, T, accent, gid) {
    var photos = it.photos || [];
    var media = photos.length
      ? '<img class="ld" src="' + photoSrc(photos[0]) + '" style="object-position:' + esc(photoPos(photos[0])) + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" data-lb data-g="' + gid + '" data-i="0" tabindex="0" role="button" aria-label="' + esc(T('openItemPhoto', { name: it.name })) + '" style="cursor:zoom-in" />' +
        (photos.length > 1 ? '<span class="gal-count">1 / ' + photos.length + '</span>' : '')
      : '<img class="ld" src="' + plateFor(it.id, accent) + '" alt="" loading="lazy" />';
    return '<article class="gcard rv" data-item="' + esc(it.id) + '"><div class="gcard-media">' + media + '</div>' +
      '<div class="gcard-body"><div class="gcard-top">' +
      '<h3 class="gcard-name" dir="auto">' + esc(it.name) + badgeHtml(it, T) + '</h3>' +
      (priceText(it.price, T) ? '<span class="price">' + priceText(it.price, T) + '</span>' : '') + '</div>' +
      (it.description ? '<p class="gcard-desc" dir="auto">' + esc(it.description) + '</p>' : '') +
      orderLinkHtml(biz, it, T) + videoHtml(it, T) + '</div></article>';
  }

  function itemRow(biz, it, T, accent, gid) {
    var photos = it.photos || [];
    var thumb = photos.length
      ? '<img class="row-thumb ld" src="' + photoSrc(photos[0]) + '" style="object-position:' + esc(photoPos(photos[0])) + '" alt="" loading="lazy" />'
      : '<img class="row-thumb ld" src="' + plateFor(it.id, accent) + '" alt="" loading="lazy" />';
    return '<button class="row" type="button" data-row data-g="' + gid + '" data-i="0" data-item="' + esc(it.id) + '">' + thumb +
      '<span class="row-main"><span class="row-name" dir="auto">' + esc(it.name) + badgeHtml(it, T) + '</span>' +
      (it.description ? '<span class="row-desc" dir="auto">' + esc(it.description) + '</span>' : '') + '</span>' +
      (priceText(it.price, T) ? '<span class="row-price">' + priceText(it.price, T) + '</span>' : '') + '</button>';
  }

  function menuRow(biz, it, T, accent) {
    var photos = it.photos || [];
    var gid = 'menu-' + it.id;
    var visual = '';
    if (photos.length > 1) {
      visual = '<button class="menu-gal" type="button" data-menugal data-g="' + gid + '" aria-label="' + esc(T('viewPhotos', { n: photos.length, name: it.name })) + '">' +
        '<img class="ld" src="' + photoSrc(photos[0]) + '" style="object-position:' + esc(photoPos(photos[0])) + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" />' +
        '<span class="menu-more">' + ic('images') + '+' + (photos.length - 1) + '</span></button>';
    } else if (photos.length === 1) {
      visual = '<img class="ld menu-thumb" src="' + photoSrc(photos[0]) + '" style="object-position:' + esc(photoPos(photos[0])) + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" data-lb data-g="' + gid + '" data-i="0" tabindex="0" role="button" aria-label="' + esc(T('openItemPhoto', { name: it.name })) + '" style="cursor:zoom-in" />';
    }
    return '<div class="menu-row rv" data-item="' + esc(it.id) + '"><div class="menu-top"><span class="menu-name" dir="auto">' + esc(it.name) + badgeHtml(it, T) + '</span><span class="menu-leader" aria-hidden="true"></span>' +
      (priceText(it.price, T) ? '<span class="price">' + priceText(it.price, T) + '</span>' : '') + '</div>' +
      (it.description ? '<p class="menu-desc" dir="auto">' + esc(it.description) + '</p>' : '') +
      visual + orderLinkHtml(biz, it, T) + videoHtml(it, T) + '</div>';
  }

  function videoHtml(it, T) {
    if (!it.video) return '';
    var poster = (it.photos && it.photos[0]) ? ' poster="' + photoSrc(it.photos[0]) + '"' : '';
    return '<video controls preload="none" playsinline' + poster + ' src="' + it.video + '" aria-label="' + esc(T('itemVideo', { name: it.name })) + '"></video>';
  }

  function catalogHtml(biz, title, iconName, items, T, accent, opts) {
    if (!items.length) return '';
    var n = items.length;
    var gidBase = opts.gid;
    var secs = {};
    items.forEach(function (it) {
      var s = it.section || '';
      (secs[s] = secs[s] || []).push(it);
    });
    var names = Object.keys(secs);
    var chips = names.length > 1
      ? '<div class="sec-chips" role="group">' + names.map(function (s, i) {
          return '<button type="button" class="schip' + (i === 0 ? ' on' : '') + '" aria-pressed="' + (i === 0) + '" data-secbtn="' + esc(s || '_all') + '">' + esc(s || T('all')) + '</button>';
        }).join('') + '</div>' : '';
    function renderList(list) {
      if (opts.menu) return '<div class="menu">' + list.map(function (it) { return menuRow(biz, it, T, accent); }).join('') + '</div>';
      if (opts.rows || list.length > 6) return '<div class="rows">' + list.map(function (it) { return itemRow(biz, it, T, accent, gidBase + '-' + it.id); }).join('') + '</div>';
      if (opts.grid || opts.forceGrid || list.length > 2) return '<div class="grid">' + list.map(function (it) { return itemGridCard(biz, it, T, accent, gidBase + '-' + it.id); }).join('') + '</div>';
      return '<div class="feat">' + list.map(function (it) { return itemEditorial(biz, it, T, accent); }).join('') + '</div>';
    }
    var body;
    if (names.length > 1) {
      body = names.map(function (s, i) {
        return '<div data-sec="' + esc(s || '_all') + '"' + (i === 0 ? '' : ' hidden') + '>' + renderList(secs[s]) + '</div>';
      }).join('');
    } else {
      body = renderList(items);
    }
    return '<section class="bp-sec" id="' + opts.id + '" aria-label="' + esc(title) + '"><div class="bp-sec-head rv">' + ic(iconName) +
      '<h2>' + esc(title) + '</h2><span class="count">' + n + '</span></div>' + chips + body + '</section>';
  }

  function stripHtml(biz, items, T) {
    var photos = [];
    items.forEach(function (it) {
      (it.photos || []).forEach(function (p, i) {
        photos.push({ src: photoSrc(p), pos: photoPos(p), alt: it.name + ' photo ' + (i + 1), gid: 'strip-' + it.id, idx: i });
      });
    });
    if (photos.length < 4) return '';
    // Registry entries are added by the caller (see renderPublicPage).
    return '<section class="bp-sec" id="sec-photos" aria-label="' + esc(T('photos')) + '"><div class="bp-sec-head rv">' + ic('images') +
      '<h2>' + esc(T('photos')) + '</h2><span class="count">' + photos.length + '</span></div>' +
      '<div class="strip">' + photos.slice(0, 12).map(function (ph) {
        return '<button type="button" class="strip-cell" data-strip data-g="' + ph.gid + '" data-i="' + ph.idx + '" aria-label="' + esc(T('openItemPhoto', { name: ph.alt })) + '">' +
          '<img class="ld" src="' + ph.src + '" style="object-position:' + esc(ph.pos) + '" alt="" loading="lazy" decoding="async" /></button>';
      }).join('') + '</div></section>';
  }

  function infoHtml(biz, T) {
    var cards = [];
    var hoursLine = biz.hoursWeek ? null : biz.hours;
    var st = openStatus(biz, T);
    if (st || hoursLine) cards.push('<div class="info-card rv"><h3>' + esc(T('openingHours')) + '</h3><div>' +
      (st ? '<p class="hours-big hours-live' + (st.open ? '' : ' is-closed') + '"><span class="pulse" aria-hidden="true"></span>' + esc(st.label) + '</p>' : '') +
      (hoursLine ? '<p class="hours-big' + (st ? ' hours-sub' : '') + '" dir="auto">' + esc(hoursLine) + '</p>' : '') + '</div></div>');
    if (biz.address || biz.city) cards.push('<div class="info-card rv"><h3>' + esc(T('findUs')) + '</h3><div>' +
      '<p class="addr" dir="auto">' + esc([biz.address, biz.city].filter(Boolean).join(', ')) + '</p>' +
      '<a class="btn-bp btn-quiet dir-btn" href="' + mapsLink(biz) + '" target="_blank" rel="noopener">' + ic('navigation') + esc(T('getDirections')) + '</a></div></div>');
    if (!cards.length) return '';
    return '<section class="bp-sec" id="sec-info" aria-label="' + esc(T('goodToKnow')) + '"><div class="bp-sec-head rv">' + ic('store') + '<h2>' + esc(T('goodToKnow')) + '</h2></div><div class="info-grid">' + cards.join('') + '</div></section>';
  }

  function socialHtml(biz, T) {
    var links = [];
    if (biz.facebook) links.push('<a class="soc" href="' + esc(biz.facebook) + '" target="_blank" rel="noopener">' + ic('facebook') + 'Facebook</a>');
    if (biz.instagram) links.push('<a class="soc" href="' + esc(biz.instagram) + '" target="_blank" rel="noopener">' + ic('instagram') + 'Instagram</a>');
    if (!links.length) return '';
    return '<section class="bp-sec" aria-label="Social media"><div class="bp-sec-head rv">' + ic('share-2') + '<h2>' + esc(T('followUs')) + '</h2></div><div class="soc-row">' + links.join('') + '</div></section>';
  }

  function quotesHtml(biz, T) {
    var qs = (biz.testimonials || []).filter(function (q) { return q && q.text; }).slice(0, 3);
    if (!qs.length) return '';
    return '<section class="bp-sec" id="sec-reviews" aria-label="Reviews"><div class="bp-sec-head rv">' + ic('message-circle') + '<h2>' + esc(T('testimonials')) + '</h2></div>' +
      '<div class="quotes">' + qs.map(function (q) {
        return '<figure class="quote rv"><blockquote dir="auto">“' + esc(q.text) + '”</blockquote>' +
          (q.author ? '<figcaption>— ' + esc(q.author) + '</figcaption>' : '') + '</figure>';
      }).join('') + '</div></section>';
  }

  function trustHtml(biz) {
    var rows = (biz.trust || []).filter(Boolean).slice(0, 4);
    if (!rows.length) return '';
    return '<div class="trust-strip rv">' + rows.map(function (r) {
      return '<span class="trust-item">' + ic('check') + esc(r) + '</span>';
    }).join('') + '</div>';
  }

  function footerHtml(biz, T, nav) {
    var sub = [biz.city, biz.hours].filter(Boolean).join(' \u00b7 ');
    var flinks = (nav || []).map(function (n) {
      return '<a href="#' + n.id + '" data-secgo="' + n.id + '">' + esc(n.label) + '</a>';
    }).join('');
    return '<footer class="bp-foot"><div class="wrap foot-grid"><div class="foot-brand"><p class="fname" dir="auto">' + esc(biz.name) + '</p>' +
      (sub ? '<p class="fsub" dir="auto">' + esc(sub) + '</p>' : '') +
      '<p class="flinks"><button class="flink-share" data-share type="button">' + ic('share-2') + '<span>' + esc(T('share')) + '</span></button></p></div>' +
      (flinks ? '<nav class="flinks-nav" aria-label="Sections">' + flinks + '</nav>' : '') + '</div></footer>';
  }

  function topnavHtml(biz, T, nav) {
    var mono = biz.logo
      ? '<span class="topnav-mono"><img class="ld" src="' + photoSrc(biz.logo) + '" alt="" loading="lazy" decoding="async" /></span>'
      : '<span class="topnav-mono" aria-hidden="true">' + esc(String(biz.name || '?').charAt(0)) + '</span>';
    var links = (nav || []).map(function (n, i) {
      return '<a href="#' + n.id + '" data-secgo="' + n.id + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(n.label) + '</a>';
    }).join('');
    var cta = biz.whatsapp
      ? '<a class="topnav-cta" href="' + waLink(biz.whatsapp, 'Hello ' + biz.name + '! I found you on BizDyali.') + '" target="_blank" rel="noopener">' + ic('message-circle') + '<span>WhatsApp</span></a>'
      : '';
    if (!links && !cta) return '';
    return '<header class="topnav" data-topnav><div class="wrap topnav-in">' +
      '<a class="topnav-brand" href="#top" data-sectop title="' + esc(biz.name) + '">' + mono +
      '<span class="topnav-name" dir="auto">' + esc(biz.name) + '</span></a>' +
      (links ? '<nav class="topnav-links" aria-label="Sections">' + links + '</nav>' : '') + cta + '</div></header>';
  }

  function barHtml(biz, T) {
    var acts = [];
    if (biz.whatsapp) acts.push('<a href="' + waLink(biz.whatsapp, 'Hello ' + biz.name + '! I found you on BizDyali.') + '" target="_blank" rel="noopener">' + ic('message-circle') + '<span class="ba-t">WhatsApp</span></a>');
    if (biz.phone) acts.push('<a href="tel:' + esc(String(biz.phone).replace(/\s/g, '')) + '">' + ic('phone') + '<span class="ba-t">' + esc(T('call')) + '</span></a>');
    if (biz.address || biz.city) acts.push('<a href="' + mapsLink(biz) + '" target="_blank" rel="noopener">' + ic('navigation') + '<span class="ba-t">' + esc(T('directions')) + '</span></a>');
    if (!acts.length) return '';
    return '<nav class="bp-bar" data-bar aria-label="Quick contact">' + acts.join('') + '</nav>';
  }

  function orderBarHtml(biz, T) {
    if (!(biz.theme && biz.theme.basket)) return '';
    return '<div class="bp-orderbar" data-orderbar hidden><span data-ordercount></span>' +
      '<a data-ordersend href="#" target="_blank" rel="noopener"></a></div>';
  }

  /* ---------------- Lightbox (singleton) ---------------- */
  var lbState = { images: [], index: 0, opener: null };
  function ensureLightbox() {
    var lb = document.getElementById('bpLb');
    if (lb) return lb;
    var d = document.createElement('div');
    d.innerHTML = '<div class="bp-lb" id="bpLb" role="dialog" aria-modal="true" aria-label="Photo viewer" hidden>' +
      '<div class="bp-lb-top"><span class="bp-lb-count" data-lbcount></span><span class="bp-lb-cap" data-lbcap></span>' +
      '<button class="bp-lb-x" type="button" data-lbclose>' + ic('x') + '<span>Close</span></button></div>' +
      '<div class="bp-lb-stage"><button class="bp-lb-nav prev" type="button" data-lbprev aria-label="Previous photo">' + ic('chevron-left') + '</button>' +
      '<div class="bp-lb-track" data-lbtrack></div>' +
      '<button class="bp-lb-nav next" type="button" data-lbnext aria-label="Next photo">' + ic('chevron-right') + '</button></div></div>';
    document.body.appendChild(d.firstChild);
    lb = document.getElementById('bpLb');
    lb.querySelector('[data-lbclose]').addEventListener('click', function () { closeLightbox(false); });
    lb.querySelector('[data-lbprev]').addEventListener('click', function () { stepLightbox(-1); });
    lb.querySelector('[data-lbnext]').addEventListener('click', function () { stepLightbox(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('bp-lb-stage')) closeLightbox(false); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(-1); }
      else if (e.key === 'Tab') {
        var f = lb.querySelectorAll('button');
        var list = Array.prototype.slice.call(f);
        if (!list.length) return;
        var first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // Scroll is the single source of truth for the current slide.
    var lbTrack = lb.querySelector('[data-lbtrack]');
    lbTrack.addEventListener('scroll', function () {
      if (lb.hidden) return;
      var i = lbIndexFromScroll(lbTrack);
      if (i !== lbState.index) { lbState.index = i; paintLbMeta(lb); }
    }, { passive: true });
    // Browser back closes the lightbox instead of leaving the page.
    window.addEventListener('popstate', function () {
      var openLb = document.getElementById('bpLb');
      if (openLb && !openLb.hidden) { lbPushed = false; closeLightbox(true); }
    });
    return lb;
  }
  var lbPushed = false;
  function collectGallery(root, gid) {
    var nodes = root.querySelectorAll('[data-g="' + gid + '"]');
    var out = [];
    Array.prototype.forEach.call(nodes, function (el) {
      var src = el.tagName === 'IMG' ? el.src : el.getAttribute('data-src');
      if (src) out.push({ src: src, alt: el.getAttribute('alt') || '' });
    });
    return out;
  }
  function lbIndexFromScroll(track) {
    if (!lbState.images.length) return 0;
    return Math.max(0, Math.min(lbState.images.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
  }
  function paintLbMeta(lb) {
    lb.querySelector('[data-lbcount]').textContent = (lbState.index + 1) + ' / ' + lbState.images.length;
    lb.querySelector('[data-lbcap]').textContent = (lbState.images[lbState.index] || {}).alt || '';
    var only = lbState.images.length < 2;
    lb.querySelector('[data-lbprev]').style.display = only ? 'none' : '';
    lb.querySelector('[data-lbnext]').style.display = only ? 'none' : '';
  }
  function openLightbox(root, gid, index, opener) {
    var images = (root && root._lbReg && root._lbReg[gid]) || collectGallery(root, gid);
    if (!images.length) return;
    lbState.images = images;
    lbState.index = Math.max(0, Math.min(index || 0, images.length - 1));
    lbState.opener = opener || null;
    var lb = ensureLightbox();
    var track = lb.querySelector('[data-lbtrack]');
    track.innerHTML = images.map(function (im, i) {
      return '<div class="bp-lb-slide"><img src="' + im.src + '" alt="' + esc(im.alt) + '" draggable="false" /></div>';
    }).join('');
    lb.hidden = false;
    var raf = (window.requestAnimationFrame || function (fn) { fn(); });
    raf(function () { lb.classList.add('open'); });
    paintLbMeta(lb);
    scrollSlide(track, lbState.index);
    document.body.style.overflow = 'hidden';
    try { history.pushState({ bpLb: true }, ''); lbPushed = true; } catch (e) { lbPushed = false; }
    lb.querySelector('[data-lbclose]').focus();
  }
  function scrollSlide(track, index) {
    var slide = track.children[index];
    if (!slide) return;
    if (track.scrollTo) track.scrollTo({ left: slide.offsetLeft, behavior: 'auto' });
    else track.scrollLeft = slide.offsetLeft;
  }
  function stepLightbox(dir) {
    var lb = document.getElementById('bpLb');
    if (!lb || lb.hidden) return;
    var track = lb.querySelector('[data-lbtrack]');
    var n = lbState.images.length;
    lbState.index = (lbIndexFromScroll(track) + dir + n) % n;
    var slide = track.children[lbState.index];
    if (slide) {
      if (track.scrollTo) track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
      else track.scrollLeft = slide.offsetLeft;
    }
    paintLbMeta(lb);
  }
  function closeLightbox(fromPop) {
    var lb = document.getElementById('bpLb');
    if (!lb || lb.hidden) { lbPushed = false; return; }
    if (!fromPop && lbPushed) {
      // Let the browser-back consume the pushed entry; popstate finishes closing.
      lbPushed = false;
      try { history.back(); } catch (e) {}
      setTimeout(function () { var l = document.getElementById('bpLb'); if (l && !l.hidden) closeNow(l); }, 450);
      return;
    }
    closeNow(lb);
  }
  function closeNow(lb) {
    lb.classList.remove('open');
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lbState.opener && document.contains(lbState.opener)) lbState.opener.focus();
    lbState.opener = null;
  }


  /* ---------------- Main render ---------------- */

  function renderPublicPage(biz, mount, opts) {
    opts = opts || {};
    if (global.BizIcons) global.BizIcons.ensureSprite();
    var hasTheme = !!global.BizTheme;
    var hasI18n = !!global.BizI18n;
    var lang = hasI18n ? BizI18n.langOf(biz) : 'en';
    function T(k, v) { return hasI18n ? BizI18n.str(lang, k, v) : k; }
    var theme = hasTheme ? BizTheme.resolveTheme(biz) : { look: 'editorial', fonts: { display: 'Fraunces', body: 'Inter' }, tokens: null };
    if (lang === 'ar' && hasTheme) theme.fonts = { display: BizTheme.AR_DISPLAY, body: BizTheme.AR_BODY };
    var look = theme.look;
    var accent = (theme.tokens && theme.tokens.accent) ||
      ((hasTheme && BizTheme.LOOKS[look].accent) || '#0A6B4F');

    var items = (biz.items || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var products = items.filter(function (i) { return i.kind === 'product'; });
    var services = items.filter(function (i) { return i.kind === 'service'; });
    var showProducts = biz.offeringType !== 'services';
    var showServices = biz.offeringType !== 'products';
    var food = isFoodCategory(biz.category);
    var basketOn = !!(biz.theme && biz.theme.basket);

    var lbReg = {};
    items.forEach(function (it) {
      var gid = (it.kind === 'service' ? 's-' : 'p-') + it.id;
      var list = (it.photos || []).map(function (p, i) {
        return { src: photoSrc(p), alt: it.name + ((it.photos || []).length > 1 ? ' photo ' + (i + 1) : '') };
      });
      lbReg[gid] = list;
      lbReg['menu-' + it.id] = list;
      lbReg['strip-' + it.id] = list;
    });

    var sections = []; // {id, label} for the pill nav
    function catOpts(kind, titleKey, icon, menuMode) {
      return { gid: kind === 'service' ? 's' : 'p', menu: menuMode, id: kind === 'service' ? 'sec-services' : 'sec-products' };
    }
    var bar = opts.chrome ? barHtml(biz, T) : '';
    var html = '<div class="bp' + (bar ? ' has-bar' : '') + '" dir="' + (hasI18n ? BizI18n.dirOf(lang) : 'ltr') + '" lang="' + esc(lang) + '">';

    // Hero by look.
    if (look === 'workshop') html += heroSplitHtml(biz, T);
    else if (look === 'market') html += heroCompactHtml(biz, T);
    else html += heroOverlayHtml(biz, T);

    // Catalog.
    function productTitle() { return (food && (look === 'editorial' || look === 'market')) ? T('menu') : T('products'); }
    function productIcon() { return (food && (look === 'editorial' || look === 'market')) ? 'utensils' : 'shopping-bag'; }
    function useMenu() { return food && (look === 'editorial' || look === 'market'); }
    if (showProducts && products.length) {
      sections.push({ id: 'sec-products', label: productTitle() });
      var po = catOpts('product');
      po.menu = useMenu();
      if (look === 'boutique') po.forceGrid = true;
      if (look === 'workshop' || look === 'market') po.rows = true;
      if (look === 'atelier') po.airy = true;
      html += catalogHtml(biz, productTitle(), productIcon(), products, T, accent, po);
    }
    if (showServices && services.length) {
      sections.push({ id: 'sec-services', label: T('services') });
      var so = catOpts('service');
      if (look === 'workshop' || look === 'market') so.rows = true;
      html += catalogHtml(biz, T('services'), 'scissors', services, T, accent, so);
    }
    if (look === 'workshop') html += trustHtml(biz);
    if (!products.length && !services.length) {
      html += '<section class="bp-sec" aria-label="' + esc(T('productsServices')) + '"><div class="info-card rv"><h3>' + ic('store') + esc(T('productsServices')) + '</h3>' +
        '<p class="addr">' + esc(T('comingSoon')) + '</p></div></section>';
    }

    // Gallery strip.
    var stripCount = 0;
    items.forEach(function (it) { stripCount += (it.photos || []).length; });
    if (stripCount >= 4) { sections.push({ id: 'sec-photos', label: T('photos') }); html += stripHtml(biz, items, T); }

    var infoHtmlOut = infoHtml(biz, T);
    if (infoHtmlOut) { sections.push({ id: 'sec-info', label: T('goodToKnow') }); html += infoHtmlOut; }
    var quotesOut = quotesHtml(biz, T);
    if (quotesOut) { sections.push({ id: 'sec-reviews', label: T('testimonials') }); html += quotesOut; }
    html += socialHtml(biz, T) + footerHtml(biz, T, sections) + '</div>';

    // Section pill nav (only when the page is long enough to need it).
    var navHtml = '';
    if (sections.length >= 2) {
      navHtml = '<nav class="secnav" data-secnav aria-label="Sections">' + sections.map(function (s, i) {
        return '<a href="#' + s.id + '" data-secgo="' + s.id + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(s.label) + '</a>';
      }).join('') + '</nav>';
    }

    mount.innerHTML = html;
    mount._lbReg = lbReg;
    mount._bizRef = { biz: biz, T: T, lang: lang, look: look, basketOn: basketOn };
    var topnav = (opts.chrome && sections.length) ? topnavHtml(biz, T, sections) : '';
    if (bar) mount.insertAdjacentHTML('afterend', bar + navHtml + topnav + (basketOn ? orderBarHtml(biz, T) : ''));
    else {
      var oldBar = mount.parentElement ? mount.parentElement.querySelector('[data-bar]') : null;
      if (oldBar) oldBar.remove();
      var oldNav = mount.parentElement ? mount.parentElement.querySelector('[data-secnav]') : null;
      if (oldNav) oldNav.remove();
      var oldTop = mount.parentElement ? mount.parentElement.querySelector('[data-topnav]') : null;
      if (oldTop) oldTop.remove();
      var oldOrd = mount.parentElement ? mount.parentElement.querySelector('[data-orderbar]') : null;
      if (oldOrd) oldOrd.remove();
    }

    // Sync look + fonts + base tokens now; async sampler upgrades the accent.
    var root = mount.querySelector('.bp');
    if (root) {
      root.setAttribute('data-look', look);
      if (biz.theme && biz.theme.mode === 'dark') root.setAttribute('data-mode', 'dark');
      root.style.setProperty('--t-font-display', "'" + theme.fonts.display + "', Georgia, serif");
      root.style.setProperty('--t-font-body', "'" + theme.fonts.body + "', system-ui, sans-serif");
      if (hasTheme) BizTheme.applyTheme(biz, root).then(function () {
        if (lang === 'ar') {
          root.style.setProperty('--t-font-display', "'" + BizTheme.AR_DISPLAY + "', serif");
          root.style.setProperty('--t-font-body', "'" + BizTheme.AR_BODY + "', system-ui, sans-serif");
        }
      });
    }

    initInteractive(mount, opts);
    if (opts.seo) updateSeo(biz);
    return mount;
  }

  /* ---------------- Interactions ---------------- */

  function initInteractive(mount, opts) {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ref = mount._bizRef || {};
    var biz = ref.biz || {};
    var T = ref.T || function (k) { return k; };

    // Image fade-in
    Array.prototype.forEach.call(mount.querySelectorAll('img.ld'), function (img) {
      if (img.complete && img.naturalWidth) img.classList.add('on');
      else {
        img.addEventListener('load', function () { img.classList.add('on'); });
        img.addEventListener('error', function () { img.classList.add('on'); });
      }
    });

    // Scroll reveal (progressive enhancement: .anim added only when IO runs)
    var bpRoot = mount.querySelector('.bp');
    var canAnimate = !reduceMotion && ('IntersectionObserver' in window);
    if (canAnimate && bpRoot) bpRoot.classList.add('anim');
    var rvEls = mount.querySelectorAll('.rv');
    if (!canAnimate) {
      Array.prototype.forEach.call(rvEls, function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en, k) {
          if (en.isIntersecting) {
            en.target.style.transitionDelay = Math.min(k * 60, 240) + 'ms';
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
      Array.prototype.forEach.call(rvEls, function (el) { io.observe(el); });
    }

    // Any zoomable image / row / gallery / strip opens the lightbox
    function openFrom(el) {
      if (!el) return;
      openLightbox(mount, el.getAttribute('data-g'), Number(el.getAttribute('data-i') || 0), el);
    }
    mount.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var row = e.target.closest('[data-row],[data-menugal],[data-strip]');
      if (row) { openFrom(row); return; }
    });
    mount.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.hasAttribute && e.target.hasAttribute('data-lb')) {
        e.preventDefault();
        openFrom(e.target);
      }
    });
    mount.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-lb]') : null;
      if (t && t.tagName === 'IMG') openFrom(t);
    });
    // Lightbox openers rendered outside mount (none currently) — noop guard.
    document.addEventListener('click', function (e) {
      if (mount.contains(e.target)) return;
      var t = e.target.closest ? e.target.closest('[data-lb-outside]') : null;
      if (t) openFrom(t);
    });

    // Editorial thumbs switch the main image
    Array.prototype.forEach.call(mount.querySelectorAll('[data-thumbs]'), function (box) {
      var item = box.closest('.feat-item');
      var main = item ? item.querySelector('[data-main]') : null;
      if (!main) return;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (btn, i) {
        btn.addEventListener('click', function () {
          main.src = btn.getAttribute('data-src');
          main.classList.remove('on');
          Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.setAttribute('aria-current', 'false'); });
          btn.setAttribute('aria-current', 'true');
          main.setAttribute('data-i', String(i));
        });
      });
    });

    // Section filter chips
    Array.prototype.forEach.call(mount.querySelectorAll('[data-secbtn]'), function (btn) {
      btn.addEventListener('click', function () {
        var sec = mount.querySelector('[data-sec="' + btn.getAttribute('data-secbtn') + '"]');
        var scope = btn.closest('section');
        if (!scope) return;
        Array.prototype.forEach.call(scope.querySelectorAll('[data-secbtn]'), function (b) {
          var on = b === btn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        Array.prototype.forEach.call(scope.querySelectorAll('[data-sec]'), function (pane) {
          pane.hidden = (pane !== sec);
        });
      });
    });

    // Share buttons (hero actions row + footer): each restores its own label.
    Array.prototype.forEach.call(mount.querySelectorAll('[data-share]'), function (share) {
      share.addEventListener('click', function () {
        var url = location.href.split('#')[0];
        var label = share.querySelector('span');
        var TT = ref.T || function (k) { return k; };
        function done(msg) { if (label) { label.textContent = msg; setTimeout(function () { label.textContent = TT('share'); }, 2000); } }
        if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { done(TT('copied')); }, function () {});
      });
    });

    // Order basket (only when biz.theme.basket is on)
    if (ref.basketOn) wireBasket(mount, biz, T);

    if (!opts.chrome) return;

    // Section pill nav: appears past the hero on long-enough pages, tracks active.
    var secnav = document.querySelector('[data-secnav]');
    var sentinel = mount.querySelector('[data-sentinel]');
    if (secnav && sentinel && 'IntersectionObserver' in window) {
      var tallEnough = (document.body.scrollHeight > window.innerHeight * 2.2);
      if (!tallEnough) { secnav.remove(); }
      else {
        var nio = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { secnav.classList.toggle('show', !en.isIntersecting && window.scrollY > 240); });
        }, { threshold: 0 });
        nio.observe(sentinel);
        var secs = Array.prototype.slice.call(mount.querySelectorAll('section[id]'));
        var sio = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var id = en.target.id;
            Array.prototype.forEach.call(secnav.querySelectorAll('[data-secgo]'), function (a) {
              a.classList.toggle('on', a.getAttribute('data-secgo') === id);
            });
          });
        }, { rootMargin: '-40% 0px -55% 0px' });
        secs.forEach(function (s) { sio.observe(s); });
        Array.prototype.forEach.call(secnav.querySelectorAll('[data-secgo]'), function (a) {
          a.addEventListener('click', function (e) {
            var t = document.getElementById(a.getAttribute('data-secgo'));
            if (t) { e.preventDefault(); t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
          });
        });
      }
    } else if (secnav) { secnav.remove(); }

    // Slim desktop header: same sections, appears once the hero scrolls away.
    var topnav = document.querySelector('[data-topnav]');
    var heroSentinel = mount.querySelector('[data-sentinel]');
    function goSec(id) {
      var t = document.getElementById(id);
      if (t) t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    // Footer section links smooth-scroll everywhere (all widths).
    Array.prototype.forEach.call(mount.querySelectorAll('.flinks-nav [data-secgo]'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); goSec(a.getAttribute('data-secgo')); });
    });
    if (topnav && !(document.body.scrollHeight > window.innerHeight * 2.2)) { topnav.remove(); topnav = null; }
    if (topnav && heroSentinel && 'IntersectionObserver' in window) {
      var tio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { topnav.classList.toggle('show', !en.isIntersecting && window.scrollY > 240); });
      }, { threshold: 0 });
      tio.observe(heroSentinel);
      var tsecs = Array.prototype.slice.call(mount.querySelectorAll('section[id]'));
      var tio2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.id;
          Array.prototype.forEach.call(topnav.querySelectorAll('[data-secgo]'), function (a) {
            a.classList.toggle('on', a.getAttribute('data-secgo') === id);
          });
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      tsecs.forEach(function (x) { tio2.observe(x); });
      Array.prototype.forEach.call(topnav.querySelectorAll('[data-secgo]'), function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); goSec(a.getAttribute('data-secgo')); });
      });
      var toTop = topnav.querySelector('[data-sectop]');
      if (toTop) toTop.addEventListener('click', function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
    } else if (topnav) { topnav.remove(); }

    // Sticky mobile action bar visibility (customer pages only, not previews)
    var bar = document.querySelector('[data-bar]');
    var barSentinel = mount.querySelector('[data-sentinel]');
    if (bar && barSentinel && 'IntersectionObserver' in window) {
      var bio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { bar.classList.toggle('show', !en.isIntersecting && window.scrollY > 240); });
      }, { threshold: 0 });
      bio.observe(barSentinel);
    } else if (bar) { bar.classList.add('show'); }
  }

  function wireBasket(mount, biz, T) {
    var order = {};
    function items() { return (biz.items || []); }
    function find(id) {
      var list = items();
      for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
      return null;
    }
    function paintBar() {
      var bar = document.querySelector('[data-orderbar]');
      if (!bar) return;
      var ids = Object.keys(order);
      var n = 0, total = 0;
      var lines = [];
      ids.forEach(function (id) {
        var it = find(id);
        var q = order[id];
        if (!it || !q) return;
        n += q;
        if (it.price != null && it.price !== '' && !isNaN(Number(it.price))) total += Number(it.price) * q;
        lines.push('\u2022 ' + it.name + ' x' + q + (it.price != null && it.price !== '' ? ' — ' + it.price + ' ' + T('currency') : ''));
      });
      if (!n) { bar.hidden = true; return; }
      bar.hidden = false;
      bar.querySelector('[data-ordercount]').textContent = T('orderBar', { n: n, total: total + ' ' + T('currency') });
      var msg = 'Hello ' + biz.name + '! ' + T('orderBar', { n: n, total: total + ' ' + T('currency') }) + ':\n' + lines.join('\n');
      bar.querySelector('[data-ordersend]').setAttribute('href', waLink(biz.whatsapp, msg));
      bar.querySelector('[data-ordersend]').textContent = T('orderBar', { n: n, total: total + ' ' + T('currency') });
    }
    Array.prototype.forEach.call(mount.querySelectorAll('[data-item]'), function (node) {
      var id = node.getAttribute('data-item');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'add-btn';
      btn.setAttribute('data-add', id);
      btn.textContent = '+ ' + T('askWhatsApp');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (order[id]) delete order[id]; else order[id] = 1;
        btn.classList.toggle('on', !!order[id]);
        btn.textContent = order[id] ? '\u2713 ' + T('addedToOrder') : '+ ' + T('askWhatsApp');
        paintBar();
      });
      var host = node.querySelector('.gcard-body, .feat-item > div:last-child, .menu-row, .row-main');
      (host || node).appendChild(btn);
    });
    paintBar();
  }

  global.BizRender = { renderPublicPage: renderPublicPage, esc: esc, waLink: waLink, mapsLink: mapsLink };
})(window);

