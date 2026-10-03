/* BizDyali business dashboard: edit everything, trial status, share link. */
(function () {
  'use strict';
  BizDyali.seedDemo();
  var user = BizDyali.currentUser();
  if (!user) { location.replace('auth.html?next=dashboard.html'); return; }
  document.getElementById('whoAmI').textContent = user.name + ' • ';
  document.getElementById('logoutBtn').addEventListener('click', function () {
    BizDyali.logout(); location.replace('index.html');
  });

  var $ = function (id) { return document.getElementById(id); };
  var err = $('dashErr'), ok = $('dashOk');
  function showErr(m) { err.textContent = m; err.hidden = false; ok.hidden = true; }
  function showOk(m) { ok.textContent = m; ok.hidden = false; err.hidden = true; setTimeout(function () { ok.hidden = true; }, 3500); }
  function hideMsgs() { err.hidden = true; ok.hidden = true; }

  var params = new URLSearchParams(location.search);
  if (params.get('welcome') === '1') {
    var w = $('welcomeMsg');
    w.textContent = '🎉 Your page is published! Your 14 free days have started. Share your link below.';
    w.hidden = false;
  }

  var biz = null;
  var filter = 'all';
  var editingId = null, edPhotos = [], edVideo = null, edKind = 'product';

  function myList() { return BizDyali.myBusinesses(user.id); }

  function refreshSelect() {
    var sel = $('bizSelect'); sel.innerHTML = '';
    myList().forEach(function (b) {
      var o = document.createElement('option');
      o.value = b.id; o.textContent = b.name + ' (/' + b.slug + ')';
      sel.appendChild(o);
    });
    if (biz) sel.value = biz.id;
  }

  function load(id) {
    var list = myList();
    if (!list.length) {
      $('noBiz').hidden = false; $('dashBody').hidden = true;
      $('bizTitle').textContent = 'Your pages';
      return;
    }
    biz = BizDyali.getBusiness(id) || list[0];
    if (!biz || biz.ownerId !== user.id) biz = list[0];
    refreshSelect();
    fillAll();
    $('noBiz').hidden = true; $('dashBody').hidden = false;
  }

  function persist(silent) {
    var res = BizDyali.saveBusiness(biz);
    if (res.error) { showErr(res.error); return false; }
    if (!silent) showOk('Saved ✓ — your public page is updated.');
    return true;
  }

  // ---- Trial banner ----
  function renderTrial() {
    var banner = $('trialBanner');
    BizDyali.checkAndLogExpiry(biz); // record expiry once, the first time it is seen
    var st = BizDyali.trialState(biz);
    $('trialMeta').innerHTML =
      '<span>Start: ' + BizDyali.fmtDate(biz.trialStart) + '</span>' +
      '<span>Ends: ' + BizDyali.fmtDate(biz.trialEnd) + '</span>' +
      '<span>' + (st.daysLeft == null ? '—' : (st.daysLeft + ' day(s) left')) + '</span>';
    $('trialMeta').hidden = (st.status === 'draft');
    if (st.status === 'draft') {
      banner.className = 'trial-banner expired';
      $('trialTitle').textContent = 'Your page is not published.';
      $('trialText').innerHTML = 'Your page was moved back to draft, so customers cannot access it. Your business information is <strong>saved</strong> — please contact BizDyali to restore it.';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'Your page is currently unavailable to customers. Your data is safe here.';
    } else if (st.status === 'subscribed') {
      banner.className = 'trial-banner trial';
      $('trialTitle').textContent = 'Your page is active — subscribed.';
      $('trialText').innerHTML = 'Your subscription (100 MAD/month) keeps your page visible to customers. Thank you!';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'Your page is live — share the link with your customers.';
    } else if (st.status === 'suspended') {
      banner.className = 'trial-banner expired';
      $('trialTitle').textContent = 'Your page is temporarily disabled.';
      $('trialText').innerHTML = 'An administrator has paused your public page. Your business information is <strong>saved</strong> — please contact BizDyali support.';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'Customers currently cannot see your page. Your data is safe here.';
    } else if (st.status === 'expired') {
      banner.className = 'trial-banner expired';
      $('trialTitle').textContent = 'Your free trial has ended.';
      $('trialText').innerHTML = 'Your business information is <strong>saved</strong>. Subscribe for <strong>100 MAD/month</strong> to make your page visible to customers again.';
      $('subscribeRow').hidden = false;
      $('visNote').textContent = 'Customers currently see a “trial ended” notice instead of your page. Your data is safe here.';
    } else {
      banner.className = 'trial-banner trial';
      $('trialTitle').textContent = 'Your BizDyali page is free for 14 days.';
      $('trialText').innerHTML = 'Enjoy your trial — after that, keep your page visible for <strong>100 MAD/month</strong>. No payment needed today.';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'Your page is live — share the link with your customers.';
    }
  }
  $('subscribeBtn').addEventListener('click', function () {
    showErr('Subscriptions (100 MAD/month) are not available yet — this demo does not process payments. Your data stays saved.');
  });

  // ---- Overview ----
  function renderOverview() {
    var st = BizDyali.trialState(biz).status;
    var hasPage = !!(biz.published && biz.slug);
    var live = (st === 'trial' || st === 'subscribed');
    $('bizTitle').textContent = biz.name;
    // Only present the link as shareable while customers can actually open the page.
    $('shareRow').hidden = !live;
    $('waShareBtn').hidden = !live;
    $('viewPageBtn').hidden = !hasPage;
    $('previewPageBtn').hidden = !hasPage;
    if (hasPage) {
      var url = BizDyali.publicUrl(biz.slug);
      $('publicLink').textContent = url;
      $('viewPageBtn').href = url;
      $('previewPageBtn').href = url + '&preview=1';
      // For expired/suspended pages the link shows a notice, not the business — label honestly.
      $('viewPageBtn').textContent = live ? 'View public page →' : 'See what customers see →';
    }
  }
  $('copyLinkBtn').addEventListener('click', function () {
    var url = BizDyali.publicUrl(biz.slug);
    function done() { showOk('Link copied ✓ — paste it on WhatsApp, Instagram or your flyers.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = url; document.body.appendChild(t);
      t.select(); try { document.execCommand('copy'); done(); } catch (e) { showErr('Copy this link: ' + url); }
      document.body.removeChild(t);
    }
  });
  $('waShareBtn').addEventListener('click', function () {
    var url = BizDyali.publicUrl(biz.slug);
    window.open('https://wa.me/?text=' + encodeURIComponent('Visit ' + biz.name + ' online: ' + url), '_blank');
  });

  // ---- Info tab ----
  function fillInfo() {
    $('d_name').value = biz.name || '';
    $('d_category').value = biz.category || '';
    $('d_city').value = biz.city || '';
    $('d_description').value = biz.description || '';
    $('d_phone').value = biz.phone || '';
    $('d_whatsapp').value = biz.whatsapp || '';
    $('d_address').value = biz.address || '';
    $('d_hours').value = biz.hours || '';
    $('d_facebook').value = biz.facebook || '';
    $('d_instagram').value = biz.instagram || '';
    $('d_offering').value = biz.offeringType || 'both';
  }
  $('saveInfoBtn').addEventListener('click', function () {
    hideMsgs();
    biz.name = $('d_name').value.trim();
    biz.category = $('d_category').value;
    biz.city = $('d_city').value.trim();
    biz.description = $('d_description').value.trim();
    biz.phone = $('d_phone').value.trim();
    biz.whatsapp = $('d_whatsapp').value.trim();
    biz.address = $('d_address').value.trim();
    biz.hours = $('d_hours').value.trim();
    biz.facebook = $('d_facebook').value.trim();
    biz.instagram = $('d_instagram').value.trim();
    biz.offeringType = $('d_offering').value;
    if (biz.name.length < 2) return showErr('Business name is required.');
    if (persist()) {
      BizDyali.logEvent('info_changed', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Name, contact, hours, location or social links updated' });
      renderTrial(); renderOverview(); refreshSelect();
    }
  });
  $('deleteBtn').addEventListener('click', function () {
    if (!confirm('Delete "' + biz.name + '" permanently? This cannot be undone.')) return;
    BizDyali.deleteBusiness(biz.id);
    biz = null; load(null);
  });

  // ---- Branding tab ----
  function fillBranding() {
    if (biz.logo) { $('d_logoPrev').src = biz.logo; $('d_logoPrev').hidden = false; }
    else $('d_logoPrev').hidden = true;
    if (biz.cover) { $('d_coverPrev').src = biz.cover; $('d_coverPrev').hidden = false; }
    else $('d_coverPrev').hidden = true;
  }
  $('d_logo').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    BizDyali.media.fileToImageDataURL(f, 600).then(function (url) {
      biz.logo = url;
      if (persist()) {
        BizDyali.logEvent('image_uploaded', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Logo updated' });
        fillBranding();
      }
    }).catch(function (e2) { showErr(e2.message); });
    e.target.value = '';
  });
  $('d_cover').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    BizDyali.media.fileToImageDataURL(f, 1400).then(function (url) {
      biz.cover = url;
      if (persist()) {
        BizDyali.logEvent('image_uploaded', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Cover image updated' });
        fillBranding();
      }
    }).catch(function (e2) { showErr(e2.message); });
    e.target.value = '';
  });
  $('removeLogo').addEventListener('click', function () { biz.logo = null; if (persist()) fillBranding(); });
  $('removeCover').addEventListener('click', function () { biz.cover = null; if (persist()) fillBranding(); });

  // ---- Catalog tab ----
  document.querySelectorAll('[data-filter]').forEach(function (p) {
    p.addEventListener('click', function () {
      filter = p.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(function (q) {
        q.setAttribute('aria-pressed', q === p);
      });
      renderItems();
    });
  });
  function renderItems() {
    var list = $('d_itemList'); list.innerHTML = '';
    var items = (biz.items || []).slice().sort(function (a, b) { return a.order - b.order; })
      .filter(function (it) { return filter === 'all' || it.kind === filter; });
    $('d_itemEmpty').hidden = items.length > 0;
    items.forEach(function (it) {
      var li = document.createElement('li'); li.className = 'item-row';
      var wrap = document.createElement('div'); wrap.style.minWidth = '0';
      var kind = document.createElement('span'); kind.className = 'item-kind'; kind.textContent = it.kind;
      var title = document.createElement('b'); title.textContent = it.name;
      var small = document.createElement('small');
      small.textContent = (it.price != null && it.price !== '' ? it.price + ' MAD • ' : '') + (it.description || '').slice(0, 60);
      wrap.appendChild(kind); wrap.appendChild(document.createTextNode(' '));
      wrap.appendChild(title); wrap.appendChild(small);
      li.appendChild(wrap);
      var acts = document.createElement('div'); acts.className = 'item-actions';
      [['↑', 'Move up', function () { moveItem(it.id, -1); }],
       ['↓', 'Move down', function () { moveItem(it.id, 1); }],
       ['✏️', 'Edit', function () { openEditor(it.kind, it.id); }],
       ['🗑️', 'Delete', function () {
          if (confirm('Delete "' + it.name + '"?')) {
            biz.items = biz.items.filter(function (x) { return x.id !== it.id; });
            renumber();
            if (persist(true)) {
              BizDyali.logEvent(it.kind === 'service' ? 'service_deleted' : 'product_deleted', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: it.name });
              renderItems(); showOk('Deleted.');
            }
          }
        }]].forEach(function (cfg) {
        var b = document.createElement('button');
        b.className = 'icon-btn'; b.type = 'button'; b.textContent = cfg[0]; b.title = cfg[1];
        b.addEventListener('click', cfg[2]); acts.appendChild(b);
      });
      li.appendChild(acts); list.appendChild(li);
    });
  }
  function renumber() {
    biz.items.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (it, i) { it.order = i; });
  }
  function moveItem(id, dir) {
    var s = biz.items.slice().sort(function (a, b) { return a.order - b.order; });
    var i = s.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= s.length) return;
    var t = s[i].order; s[i].order = s[j].order; s[j].order = t;
    if (persist(true)) renderItems();
  }
  function openEditor(kind, id) {
    hideMsgs();
    editingId = id || null; edKind = kind; edPhotos = []; edVideo = null;
    var ex = id ? biz.items.find(function (x) { return x.id === id; }) : null;
    if (ex) {
      edPhotos = (ex.photos || []).slice(); edVideo = ex.video || null;
      $('d_it_name').value = ex.name; $('d_it_desc').value = ex.description || '';
      $('d_it_price').value = ex.price == null ? '' : ex.price;
    } else { $('d_it_name').value = ''; $('d_it_desc').value = ''; $('d_it_price').value = ''; }
    $('d_editorTitle').textContent = (ex ? 'Edit ' : 'Add ') + kind;
    $('d_nameLabel').textContent = (kind === 'product' ? 'Product' : 'Service') + ' name *';
    $('d_editor').hidden = false; renderEdMedia();
    $('d_it_name').focus();
  }
  function renderEdMedia() {
    var t = $('d_it_thumbs'); t.innerHTML = '';
    edPhotos.forEach(function (p, i) {
      var d = document.createElement('div'); d.className = 'thumb-x';
      var img = document.createElement('img'); img.src = p; img.alt = '';
      img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--line)';
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Remove photo';
      x.addEventListener('click', function () { edPhotos.splice(i, 1); renderEdMedia(); });
      d.appendChild(img); d.appendChild(x); t.appendChild(d);
    });
    $('d_it_vhint').textContent = edVideo ? 'Video attached ✓' : 'No video attached.';
  }
  $('d_addProduct').addEventListener('click', function () { openEditor('product'); });
  $('d_addService').addEventListener('click', function () { openEditor('service'); });
  $('d_it_cancel').addEventListener('click', function () { $('d_editor').hidden = true; editingId = null; });
  $('d_it_photos').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []).slice(0, 4 - edPhotos.length);
    (function next() {
      var f = files.shift(); if (!f) { e.target.value = ''; return; }
      BizDyali.media.fileToImageDataURL(f, 900).then(function (url) {
        edPhotos.push(url); renderEdMedia(); next();
      }).catch(function (e2) { showErr(e2.message); next(); });
    })();
  });
  $('d_it_video').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    BizDyali.media.fileToVideoDataURL(f, 10).then(function (url) {
      edVideo = url; renderEdMedia(); e.target.value = '';
    }).catch(function (e2) { showErr(e2.message); e.target.value = ''; });
  });
  $('d_it_save').addEventListener('click', function () {
    var name = $('d_it_name').value.trim();
    if (name.length < 2) return showErr('Please give this ' + edKind + ' a name.');
    var pr = $('d_it_price').value;
    var price = pr === '' ? null : Math.max(0, Number(pr));
    var prev = editingId ? biz.items.find(function (x) { return x.id === editingId; }) : null;
    var prevPhotoCount = prev ? (prev.photos || []).length : 0;
    var prevHadVideo = !!(prev && prev.video);
    var base = { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id };
    function itemLog(type, details) {
      var o = { actor: base.actor, actorName: base.actorName, businessId: base.businessId, businessName: base.businessName, ownerId: base.ownerId, details: details };
      BizDyali.logEvent(type, o);
    }
    if (editingId) {
      var it = prev;
      if (it) { it.name = name; it.description = $('d_it_desc').value.trim(); it.price = price; it.photos = edPhotos; it.video = edVideo; }
    } else {
      biz.items.push({ id: 'it_' + Date.now().toString(36) + Math.floor(Math.random() * 999), kind: edKind, name: name, description: $('d_it_desc').value.trim(), price: price, photos: edPhotos, video: edVideo, order: biz.items.length });
    }
    $('d_editor').hidden = true; editingId = null;
    if (persist()) {
      var kindWord = edKind === 'service' ? 'service' : 'product';
      itemLog(prev ? kindWord + '_edited' : kindWord + '_added', name + (price != null ? ' — ' + price + ' MAD' : ''));
      if (edPhotos.length > prevPhotoCount) itemLog('image_uploaded', name + ': ' + (edPhotos.length - prevPhotoCount) + ' photo(s) added');
      if (edVideo && !prevHadVideo) itemLog('video_uploaded', name + ': video attached');
      renderItems();
    }
  });

  // ---- Tabs + switcher ----
  document.querySelectorAll('[data-tab]').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('[data-tab]').forEach(function (q) { q.setAttribute('aria-selected', q === t); });
      document.querySelectorAll('[data-panel]').forEach(function (p) {
        p.classList.toggle('active', p.dataset.panel === t.dataset.tab);
      });
    });
  });
  $('bizSelect').addEventListener('change', function (e) {
    biz = BizDyali.getBusiness(e.target.value);
    fillAll();
  });

  function fillAll() { hideMsgs(); renderTrial(); renderOverview(); fillInfo(); fillBranding(); renderItems(); }

  load(params.get('biz'));
})();
