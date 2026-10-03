/* BizDyali flagship public-page renderer — component system.
   API kept stable: renderPublicPage(biz, mount, opts), esc, waLink.
   opts: { chrome:boolean (top bar + sticky mobile bar), seo:boolean }
   Sections render only when data exists; imagery dominates; no emoji UI.
   Uses vendored Lucide icons (js/icons.js, loaded before this file). */
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
  function isFoodCategory(cat) {
    return /restaurant|caf[eé]|bakery|pastry|boulanger|p[aâ]tisserie|pizza|burger|tacos|food|snack|traiteur|grocery|hanout|sushi|kebab/i.test(String(cat || ''));
  }
  function priceText(p) { return (p === '' || p == null) ? '' : esc(p) + ' MAD'; }

  /* ---------------- Components ---------------- */

  function logoHtml(biz, cls) {
    if (biz.logo) return '<div class="' + cls + '" role="img" aria-label="' + esc(biz.name) + ' logo"><img class="ld" src="' + biz.logo + '" alt="' + esc(biz.name) + ' logo" /></div>';
    return '<div class="' + cls + '" aria-hidden="true">' + esc(initials(biz.name)) + '</div>';
  }

  function actionsHtml(biz, variant) {
    var btns = [];
    if (biz.whatsapp) btns.push('<a class="btn-bp btn-wa" data-act="wa" href="' + waLink(biz.whatsapp, 'Hello ' + biz.name + '! I found you on BizDyali.') + '" target="_blank" rel="noopener">' + ic('message-circle') + 'WhatsApp</a>');
    if (biz.phone) btns.push('<a class="btn-bp btn-line" data-act="call" href="tel:' + esc(String(biz.phone).replace(/\s/g, '')) + '">' + ic('phone') + 'Call</a>');
    if (biz.address || biz.city) btns.push('<a class="btn-bp btn-quiet" data-act="dir" href="' + mapsLink(biz) + '" target="_blank" rel="noopener">' + ic('navigation') + 'Directions</a>');
    if (!btns.length) return '';
    return '<div class="bp-actions" data-sentinel>' + btns.join('') + '</div>';
  }

  function heroHtml(biz, chrome) {
    var coverInner = biz.cover
      ? '<img class="ld" src="' + biz.cover + '" alt="" fetchpriority="high" decoding="async" />'
      : '<div class="bp-empty-in"><div class="bp-empty-mono" aria-hidden="true">' + esc(initials(biz.name)) + '</div>' +
        '<div class="bp-empty-tx"><p class="cat">' + esc(biz.category || 'Local business') + '</p>' +
        (biz.city ? '<p class="city">' + esc(biz.city) + '</p>' : '') + '</div></div>' +
        '<span class="bp-wm" aria-hidden="true">' + esc(initials(biz.name)) + '</span>';
    var cover = '<div class="bp-cover' + (biz.cover ? '' : ' bp-cover--empty') + '">' + coverInner + '<div class="bp-scrim"></div>' +
      '<div class="bp-hero-in wrap">' +
      '<p class="bp-eyebrow"><span class="nw">' + esc(biz.category || 'Local business') + '</span>' +
      (biz.city ? '<span class="nw"><span class="sep" aria-hidden="true">• </span>' + esc(biz.city) + '</span>' : '') + '</p>' +
      '<h1 class="bp-name" dir="auto">' + esc(biz.name) + '</h1>' +
      '</div></div>';
    var meta = [];
    if (biz.city) meta.push('<span class="chip">' + ic('map-pin') + esc(biz.city) + '</span>');
    if (biz.hours) meta.push('<span class="chip">' + ic('clock') + esc(biz.hours) + '</span>');
    var desc = biz.description
      ? '<div class="bp-desc" dir="auto">' + esc(biz.description).split(/\n{2,}|\n/).map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>' : '';
    return (chrome
      ? '<header class="bp-top" data-top><div class="bp-top-in">' +
        '<a class="bp-brandline" href="index.html"><span class="mk">B</span>BizDyali</a>' +
        '<button class="bp-share" data-share type="button">' + ic('share-2') + '<span>Share</span></button>' +
        '</div></header>' : '') +
      '<section class="bp-hero" aria-label="' + esc(biz.name) + '">' + cover +
      '<div class="bp-id"><div class="wrap">' +
      '<div class="bp-id-row">' + logoHtml(biz, 'bp-logo') + '</div>' +
      (meta.length ? '<div class="bp-meta">' + meta.join('') + '</div>' : '') +
      '<div class="bp-id-grid">' + desc + actionsHtml(biz) + '</div>' +
      '</div></div></section>';
  }

  function videoHtml(it) {
    if (!it.video) return '';
    var poster = (it.photos && it.photos[0]) ? ' poster="' + it.photos[0] + '"' : '';
    return '<video controls preload="none" playsinline' + poster + ' src="' + it.video + '" aria-label="' + esc(it.name) + ' video"></video>';
  }

  function itemEditorial(it, idx, gid) {
    var photos = it.photos || [];
    var thumbs = photos.length > 1
      ? '<div class="feat-thumbs" data-thumbs>' + photos.map(function (p, i) {
          return '<button type="button" data-src="' + p + '" aria-current="' + (i === 0) + '" aria-label="Show photo ' + (i + 1) + '"><img src="' + p + '" alt="" loading="lazy" /></button>';
        }).join('') + '</div>' : '';
    return '<article class="feat-item rv">' +
      '<div class="feat-media">' +
      (photos.length
        ? '<img class="ld" data-main src="' + photos[0] + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" data-lb data-g="' + gid + '" data-i="0" tabindex="0" role="button" aria-label="Open ' + esc(it.name) + ' photo fullscreen" style="aspect-ratio:16/10;width:100%;object-fit:cover;cursor:zoom-in" />'
        : '<div style="aspect-ratio:16/10;display:grid;place-items:center;color:var(--bp-faint)" aria-hidden="true">' + ic('images') + '</div>') +
      '</div>' +
      '<div><h3 class="feat-name" dir="auto">' + esc(it.name) + '</h3>' +
      '<div class="feat-sub">' + (priceText(it.price) ? '<span class="price">' + priceText(it.price) + '</span>' : '') + '</div>' +
      (it.description ? '<p class="feat-desc" dir="auto">' + esc(it.description) + '</p>' : '') +
      thumbs + videoHtml(it) + '</div></article>';
  }

  function itemGridCard(it, idx, gid) {
    var photos = it.photos || [];
    var media = photos.length
      ? '<img class="ld" src="' + photos[0] + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" data-lb data-g="' + gid + '" data-i="0" tabindex="0" role="button" aria-label="Open ' + esc(it.name) + ' photo fullscreen" style="cursor:zoom-in" />' +
        (photos.length > 1 ? '<span class="gal-count">1 / ' + photos.length + '</span>' : '')
      : '<div style="aspect-ratio:4/3;display:grid;place-items:center;color:var(--bp-faint);background:#EFE9DA" aria-hidden="true">' + ic('images') + '</div>';
    return '<article class="gcard rv"><div class="gcard-media">' + media + '</div>' +
      '<div class="gcard-body"><div class="gcard-top">' +
      '<h3 class="gcard-name" dir="auto">' + esc(it.name) + '</h3>' +
      (priceText(it.price) ? '<span class="price">' + priceText(it.price) + '</span>' : '') + '</div>' +
      (it.description ? '<p class="gcard-desc" dir="auto">' + esc(it.description) + '</p>' : '') +
      videoHtml(it) + '</div></article>';
  }

  function itemRow(it, idx, gid) {
    var photos = it.photos || [];
    var thumb = photos.length
      ? '<img class="row-thumb ld" src="' + photos[0] + '" alt="" loading="lazy" />'
      : '<span class="row-ph">' + ic('images') + '</span>';
    return '<button class="row" type="button" data-row data-g="' + gid + '" data-i="0">' + thumb +
      '<span class="row-main"><span class="row-name" dir="auto">' + esc(it.name) + '</span>' +
      (it.description ? '<span class="row-desc" dir="auto">' + esc(it.description) + '</span>' : '') + '</span>' +
      (priceText(it.price) ? '<span class="row-price">' + priceText(it.price) + '</span>' : '') + '</button>';
  }

  function menuRow(it) {
    var photos = it.photos || [];
    var gid = 'menu-' + it.id;
    var visual = '';
    if (photos.length > 1) {
      visual = '<button class="menu-gal" type="button" data-menugal data-g="' + gid + '" aria-label="View ' + photos.length + ' photos of ' + esc(it.name) + '">' +
        '<img class="ld" src="' + photos[0] + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" />' +
        '<span class="menu-more">' + ic('images') + '+' + (photos.length - 1) + '</span></button>';
    } else if (photos.length === 1) {
      visual = '<img class="ld menu-thumb" src="' + photos[0] + '" alt="' + esc(it.name) + '" loading="lazy" decoding="async" data-lb data-g="' + gid + '" data-i="0" tabindex="0" role="button" aria-label="Open ' + esc(it.name) + ' photo fullscreen" style="cursor:zoom-in" />';
    }
    return '<div class="menu-row rv"><div class="menu-top"><span class="menu-name" dir="auto">' + esc(it.name) + '</span><span class="menu-leader" aria-hidden="true"></span>' +
      (priceText(it.price) ? '<span class="price">' + priceText(it.price) + '</span>' : '') + '</div>' +
      (it.description ? '<p class="menu-desc" dir="auto">' + esc(it.description) + '</p>' : '') +
      visual + videoHtml(it) + '</div>';
  }

  function catalogHtml(title, iconName, items, opts) {
    if (!items.length) return '';
    var n = items.length;
    var gidBase = opts.gid;
    var body;
    if (opts.menu) {
      body = '<div class="menu">' + items.map(menuRow).join('') + '</div>';
    } else if (n <= 2) {
      body = '<div class="feat">' + items.map(function (it, i) { return itemEditorial(it, i, gidBase + '-' + it.id); }).join('') + '</div>';
    } else if (n <= 6) {
      body = '<div class="grid">' + items.map(function (it, i) { return itemGridCard(it, i, gidBase + '-' + it.id); }).join('') + '</div>';
    } else {
      body = '<div class="rows">' + items.map(function (it, i) { return itemRow(it, i, gidBase + '-' + it.id); }).join('') + '</div>';
    }
    return '<section class="bp-sec" aria-label="' + esc(title) + '"><div class="bp-sec-head rv">' + ic(iconName) +
      '<h2>' + esc(title) + '</h2><span class="count">' + n + '</span></div>' + body + '</section>';
  }

  function infoHtml(biz) {
    var cards = [];
    if (biz.hours) cards.push('<div class="info-card rv"><h3>Opening hours</h3><p class="hours-big" dir="auto">' + esc(biz.hours) + '</p></div>');
    if (biz.address || biz.city) cards.push('<div class="info-card rv"><h3>Find us</h3>' +
      '<div><p class="addr" dir="auto">' + esc([biz.address, biz.city].filter(Boolean).join(', ')) + '</p>' +
      '<a class="btn-bp btn-quiet dir-btn" href="' + mapsLink(biz) + '" target="_blank" rel="noopener">' + ic('navigation') + 'Get directions</a></div>');
    if (!cards.length) return '';
    return '<section class="bp-sec" aria-label="Practical information"><div class="bp-sec-head rv">' + ic('store') + '<h2>Good to know</h2></div><div class="info-grid">' + cards.join('') + '</div></section>';
  }

  function socialHtml(biz) {
    var links = [];
    if (biz.facebook) links.push('<a class="soc" href="' + esc(biz.facebook) + '" target="_blank" rel="noopener">' + ic('facebook') + 'Facebook</a>');
    if (biz.instagram) links.push('<a class="soc" href="' + esc(biz.instagram) + '" target="_blank" rel="noopener">' + ic('instagram') + 'Instagram</a>');
    if (!links.length) return '';
    return '<section class="bp-sec" aria-label="Social media"><div class="bp-sec-head rv">' + ic('share-2') + '<h2>Follow us</h2></div><div class="soc-row">' + links.join('') + '</div></section>';
  }

  function footerHtml(biz) {
    return '<footer class="bp-foot"><div class="wrap"><p class="fname">' + esc(biz.name) + '</p>' +
      '<p>Powered by <a href="index.html">BizDyali</a> — your business, online. <a href="auth.html">Create your free page</a></p></div></footer>';
  }

  function barHtml(biz) {
    var acts = [];
    if (biz.whatsapp) acts.push('<a href="' + waLink(biz.whatsapp, 'Hello ' + biz.name + '! I found you on BizDyali.') + '" target="_blank" rel="noopener">' + ic('message-circle') + '<span class="ba-t">WhatsApp</span></a>');
    if (biz.phone) acts.push('<a href="tel:' + esc(String(biz.phone).replace(/\s/g, '')) + '">' + ic('phone') + '<span class="ba-t">Call</span></a>');
    if (biz.address || biz.city) acts.push('<a href="' + mapsLink(biz) + '" target="_blank" rel="noopener">' + ic('navigation') + '<span class="ba-t">Directions</span></a>');
    if (!acts.length) return '';
    return '<nav class="bp-bar" data-bar aria-label="Quick contact">' + acts.join('') + '</nav>';
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
    var items = (biz.items || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var products = items.filter(function (i) { return i.kind === 'product'; });
    var services = items.filter(function (i) { return i.kind === 'service'; });
    var showProducts = biz.offeringType !== 'services';
    var showServices = biz.offeringType !== 'products';
    var food = isFoodCategory(biz.category);
    var lbReg = {};
    items.forEach(function (it) {
      var gid = (it.kind === 'service' ? 's-' : 'p-') + it.id;
      lbReg[gid] = (it.photos || []).map(function (p, i) {
        return { src: p, alt: it.name + ((it.photos || []).length > 1 ? ' photo ' + (i + 1) : '') };
      });
      lbReg['menu-' + it.id] = lbReg[gid];
    });

    var bar = opts.chrome ? barHtml(biz) : '';
    var html = '<div class="bp' + (bar ? ' has-bar' : '') + '">' +
      heroHtml(biz, !!opts.chrome);

    if (showProducts && products.length) {
      html += food
        ? catalogHtml('Menu', 'utensils', products, { menu: true, gid: 'p' })
        : catalogHtml('Products', 'shopping-bag', products, { gid: 'p' });
    }
    if (showServices && services.length) html += catalogHtml('Services', 'scissors', services, { gid: 's' });
    if (!products.length && !services.length) {
      html += '<section class="bp-sec" aria-label="Products and services"><div class="info-card rv"><h3>' + ic('store') + 'Products &amp; services</h3>' +
        '<p class="addr">Full list coming soon — contact us on WhatsApp and we’ll help you right away.</p></div></section>';
    }

    html += infoHtml(biz) + socialHtml(biz) + footerHtml(biz) + '</div>';
    mount.innerHTML = html;
    mount._lbReg = lbReg;
    if (bar) mount.insertAdjacentHTML('afterend', bar);
    else {
      var oldBar = mount.parentElement ? mount.parentElement.querySelector('[data-bar]') : null;
      if (oldBar) oldBar.remove();
    }

    initInteractive(mount, opts);
    if (opts.seo) updateSeo(biz);
    return mount;
  }

  function updateSeo(biz) {
    try {
      var items = (biz.items || []);
      var firstPhoto = biz.cover || (items.length && items[0].photos && items[0].photos[0]) || '';
      var desc = (biz.description || '').slice(0, 160) || (biz.name + ' — ' + (biz.category || 'local business') + (biz.city ? ' in ' + biz.city : ''));
      document.title = biz.name + ' — BizDyali';
      setMeta('name', 'description', desc);
      setMeta('property', 'og:title', biz.name + ' — BizDyali');
      setMeta('property', 'og:description', desc);
      setMeta('property', 'og:type', 'website');
      if (firstPhoto) setMeta('property', 'og:image', firstPhoto);
      var canon = document.querySelector('link[rel="canonical"]');
      var url = location.href.split('#')[0];
      if (canon) canon.setAttribute('href', url);
      else {
        var l = document.createElement('link');
        l.setAttribute('rel', 'canonical'); l.setAttribute('href', url);
        document.head.appendChild(l);
      }
      var old = document.getElementById('bpJsonLd');
      if (old) old.remove();
      var phones = biz.phone || biz.whatsapp || '';
      var schema = {
        '@context': 'https://schema.org', '@type': 'LocalBusiness',
        name: biz.name, description: biz.description || undefined,
        telephone: phones || undefined, image: firstPhoto || undefined,
        url: url,
        address: (biz.address || biz.city) ? { '@type': 'PostalAddress', streetAddress: biz.address || undefined, addressLocality: biz.city || undefined } : undefined,
        sameAs: [biz.facebook, biz.instagram].filter(Boolean)
      };
      var s = document.createElement('script');
      s.type = 'application/ld+json'; s.id = 'bpJsonLd';
      s.textContent = JSON.stringify(schema);
      document.head.appendChild(s);
    } catch (e) { /* SEO is best-effort */ }
  }
  function setMeta(attr, key, value) {
    var m = document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.appendChild(m); }
    m.setAttribute('content', value);
  }

  /* ---------------- Interactions ---------------- */

  function initInteractive(mount, opts) {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    // Any zoomable image / catalog row / menu gallery opens the lightbox
    mount.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('[data-row]') : null;
      if (row) { openLightbox(mount, row.getAttribute('data-g'), 0, row); return; }
      var mg = e.target.closest ? e.target.closest('[data-menugal]') : null;
      if (mg) { openLightbox(mount, mg.getAttribute('data-g'), 0, mg); return; }
    });
    mount.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.hasAttribute && e.target.hasAttribute('data-lb')) {
        e.preventDefault();
        openLightbox(mount, e.target.getAttribute('data-g'), Number(e.target.getAttribute('data-i') || 0), e.target);
      }
    });
    mount.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-lb]') : null;
      if (t && t.tagName === 'IMG') openLightbox(mount, t.getAttribute('data-g'), Number(t.getAttribute('data-i') || 0), t);
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

    if (!opts.chrome) return;

    // Sticky top bar state
    var top = mount.querySelector('[data-top]');
    if (top) {
      var onScroll = function () { top.classList.toggle('scrolled', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    // Share button
    var share = mount.querySelector('[data-share]');
    if (share) share.addEventListener('click', function () {
      var url = location.href.split('#')[0];
      var label = share.querySelector('span');
      function done(msg) { if (label) { label.textContent = msg; setTimeout(function () { label.textContent = 'Share'; }, 2000); } }
      if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { done('Copied'); }, function () {});
    });

    // Sticky mobile action bar visibility
    var bar = document.querySelector('[data-bar]');
    var sentinel = mount.querySelector('[data-sentinel]');
    if (bar && sentinel && 'IntersectionObserver' in window) {
      var bio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { bar.classList.toggle('show', !en.isIntersecting && window.scrollY > 240); });
      }, { threshold: 0 });
      bio.observe(sentinel);
    } else if (bar) { bar.classList.add('show'); }
  }

  global.BizRender = { renderPublicPage: renderPublicPage, esc: esc, waLink: waLink, mapsLink: mapsLink };
})(window);
