/* BizDyali business dashboard: edit everything, trial status, share link. */
(function () {
  'use strict';
  BizDyali.seedDemo();
  document.body.style.visibility = 'hidden';
  setTimeout(function () { document.body.style.visibility = ''; }, 1500); // failsafe
  var user = (window.BizAuth && BizAuth.getUser()) || BizDyali.currentUser();
  if (!user) { location.replace('auth.html?next=dashboard.html'); return; }
  document.body.style.visibility = '';
  document.getElementById('whoAmI').textContent = (user.name || user.phone || '') + ' • ';
  document.getElementById('logoutBtn').addEventListener('click', function () {
    if (window.BizAuth) BizAuth.signOut();
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
    w.textContent = '🎉 تنشرات الصفحة ديالك! بدات الفترة الفابور ديال 14 يوم. پارطاجي الرابط ديالك لتحت.';
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
      $('bizTitle').textContent = 'الصفحات ديالك';
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
    if (!silent) showOk('تسجّل ✓ — الصفحة ديالك تحدّثات.');
    return true;
  }

  // ---- Trial banner ----
  function renderTrial() {
    var banner = $('trialBanner');
    BizDyali.checkAndLogExpiry(biz); // record expiry once, the first time it is seen
    var st = BizDyali.trialState(biz);
    $('trialMeta').innerHTML =
      '<span>البداية: ' + BizDyali.fmtDate(biz.trialStart) + '</span>' +
      '<span>النهاية: ' + BizDyali.fmtDate(biz.trialEnd) + '</span>' +
      '<span>' + (st.daysLeft == null ? '—' : (st.daysLeft === 1 ? 'باقي نهار واحد' : 'باقي ' + st.daysLeft + ' أيام')) + '</span>';
    $('trialMeta').hidden = (st.status === 'draft');
    if (st.status === 'draft') {
      banner.className = 'trial-banner expired';
      $('trialTitle').textContent = 'الصفحة ديالك ما تنشراتش.';
      $('trialText').innerHTML = 'الصفحة رجعات برويون، الزبناء ما يقدروش يشوفوها. المعلومات ديالك <strong>محفوظة</strong> — تواصل مع BizDyali باش ترجعها.';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'الصفحة دابا ما بايناش للزبناء. المعلومات ديالك محفوظة هنا.';
    } else if (st.status === 'subscribed') {
      banner.className = 'trial-banner trial';
      $('trialTitle').textContent = 'الصفحة ديالك خدامة — مخلّص.';
      $('trialText').innerHTML = 'الاشتراك ديالك (100 درهم فالشهر) مخلّي الصفحة باينة للزبناء. شكرا!';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'الصفحة ديالك خدامة — پارطاجي الرابط مع الزبناء ديالك.';
    } else if (st.status === 'suspended') {
      banner.className = 'trial-banner expired';
      $('trialTitle').textContent = 'الصفحة ديالك واقفة مؤقتا.';
      $('trialText').innerHTML = 'الإدارة وقفات الصفحة ديالك مؤقتا. المعلومات ديالك <strong>محفوظة</strong> — تواصل مع دعم BizDyali.';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'الزبناء ما كيشوفوش الصفحة دابا. المعلومات ديالك محفوظة هنا.';
    } else if (st.status === 'expired') {
      banner.className = 'trial-banner expired';
      $('trialTitle').textContent = 'سالات الفترة الفابور ديالك.';
      $('trialText').innerHTML = 'المعلومات ديالك <strong>محفوظة</strong>. خلّص <strong>100 درهم فالشهر</strong> باش ترجع الصفحة باينة للزبناء.';
      $('subscribeRow').hidden = false;
      $('visNote').textContent = 'الزبناء كيشوفو دابا “سالات الفترة” بلاصة الصفحة ديالك. المعلومات محفوظة هنا.';
    } else {
      banner.className = 'trial-banner trial';
      $('trialTitle').textContent = 'الصفحة ديالك فابور لمدة 14 يوم.';
      $('trialText').innerHTML = 'تمتّع بالفترة الفابور — من بعد، خلّي الصفحة باينة بـ<strong>100 درهم فالشهر</strong>. ما كتخلّص والو اليوم.';
      $('subscribeRow').hidden = true;
      $('visNote').textContent = 'الصفحة ديالك خدامة — پارطاجي الرابط مع الزبناء ديالك.';
    }
  }
  $('subscribeBtn').addEventListener('click', function () {
    showErr('الاشتراك (100 درهم فالشهر) ما زال ما واجد — هاد النسخة ما كتخلّصش. المعلومات ديالك محفوظة.');
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
      $('viewPageBtn').textContent = live ? 'شوف صفحة الزبناء ←' : 'شوف شنو كيشوفو الزبناء ←';
    }
  }
  $('copyLinkBtn').addEventListener('click', function () {
    var url = BizDyali.publicUrl(biz.slug);
    function done() { showOk('تنسخ الرابط ✓ — لصّقو فواتساب، إنستغرام ولا فالمنشورات.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallback(); });
    } else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = url; document.body.appendChild(t);
      t.select(); try { document.execCommand('copy'); done(); } catch (e) { showErr('نسخ هاد الرابط: ' + url); }
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
    if (biz.name.length < 2) return showErr('سمية المشروع ضرورية.');
    if (persist()) {
      BizDyali.logEvent('info_changed', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Name, contact, hours, location or social links updated' });
      renderTrial(); renderOverview(); refreshSelect();
    }
  });
  $('deleteBtn').addEventListener('click', function () {
    if (!confirm('مسح "' + biz.name + '" نهائيا؟ هادي ما كترجعش.')) return;
    BizDyali.deleteBusiness(biz.id);
    biz = null; load(null);
  });

  // ---- Branding tab (uploads prefer IndexedDB blobs, data-URL fallback) ----
  function dropRef(ref) {
    if (BizDyali.media.refKind(ref) === 'idb') {
      var id = String((ref && ref.src) || ref).slice(4);
      BizDyali.media.idbDelete(id);
    }
  }
  function uploadImage(file, maxFull, done) {
    var useIdb = BizDyali.media.idbSupported();
    BizDyali.media.processImage(file, { maxFull: maxFull, store: useIdb ? 'idb' : undefined }).then(function (o) {
      done(o.ref ? { src: o.ref, thumb: o.thumb } : o.full);
    }).catch(function (e2) {
      if (useIdb) {
        BizDyali.media.processImage(file, { maxFull: maxFull }).then(function (o) { done(o.full); }).catch(function (e3) { showErr(e3.message); });
      } else showErr(e2.message);
    });
  }
  function resolvePreview(img, ref) {
    if (!ref) { img.hidden = true; return; }
    BizDyali.media.resolveRef(ref).then(function (u) {
      img.src = (u && u.src) || u; img.hidden = false;
    }, function () { img.hidden = true; });
  }
  function fillBranding() {
    resolvePreview($('d_logoPrev'), biz.logo);
    resolvePreview($('d_coverPrev'), biz.cover);
  }
  $('d_logo').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    uploadImage(f, 600, function (ref) {
      dropRef(biz.logo); biz.logo = ref;
      if (persist()) {
        BizDyali.logEvent('image_uploaded', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Logo updated' });
        fillBranding();
      }
    });
    e.target.value = '';
  });
  $('d_cover').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    uploadImage(f, 1400, function (ref) {
      dropRef(biz.cover); biz.cover = ref;
      if (persist()) {
        BizDyali.logEvent('image_uploaded', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Cover image updated' });
        fillBranding();
      }
    });
    e.target.value = '';
  });
  $('removeLogo').addEventListener('click', function () { dropRef(biz.logo); biz.logo = null; if (persist()) fillBranding(); });
  $('removeCover').addEventListener('click', function () { dropRef(biz.cover); biz.cover = null; if (persist()) fillBranding(); });

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
      var kind = document.createElement('span'); kind.className = 'item-kind'; kind.textContent = it.kind === 'service' ? 'خدمة' : 'برودوي';
      var title = document.createElement('b'); title.textContent = it.name;
      var small = document.createElement('small');
      small.textContent = (it.price != null && it.price !== '' ? it.price + ' درهم • ' : '') + (it.description || '').slice(0, 60);
      wrap.appendChild(kind); wrap.appendChild(document.createTextNode(' '));
      wrap.appendChild(title); wrap.appendChild(small);
      li.appendChild(wrap);
      var acts = document.createElement('div'); acts.className = 'item-actions';
      [['↑', 'طلّع', function () { moveItem(it.id, -1); }],
       ['↓', 'نزّل', function () { moveItem(it.id, 1); }],
       ['✏️', 'بدّل', function () { openEditor(it.kind, it.id); }],
       ['🗑️', 'مسح', function () {
          if (confirm('مسح "' + it.name + '"؟')) {
            (it.photos || []).forEach(function (ph) { dropRef(ph && ph.src ? ph.src : ph); });
            biz.items = biz.items.filter(function (x) { return x.id !== it.id; });
            renumber();
            if (persist(true)) {
              BizDyali.logEvent(it.kind === 'service' ? 'service_deleted' : 'product_deleted', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: it.name });
              renderItems(); showOk('تمسحات.');
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
      $('d_it_section').value = ex.section || ''; $('d_it_badge').value = ex.badge || '';
      $('d_it_duration').value = ex.duration || '';
    } else { $('d_it_name').value = ''; $('d_it_desc').value = ''; $('d_it_price').value = ''; $('d_it_section').value = ''; $('d_it_badge').value = ''; $('d_it_duration').value = ''; }
    $('d_editorTitle').textContent = (ex ? 'بدّل ' : 'زيد ') + (kind === 'product' ? 'برودوي' : 'خدمة');
    $('d_nameLabel').textContent = (kind === 'product' ? 'سمية البرودوي' : 'سمية الخدمة') + ' *';
    $('d_editor').hidden = false; renderEdMedia();
    $('d_it_name').focus();
  }
  function edThumb(p) {
    if (p && typeof p === 'object') return p.thumb || p.src || '';
    return p || '';
  }
  var focalIdx = -1;
  function renderEdMedia() {
    var t = $('d_it_thumbs'); t.innerHTML = '';
    $('d_focalBox').hidden = true; focalIdx = -1;
    edPhotos.forEach(function (p, i) {
      var d = document.createElement('div'); d.className = 'thumb-x';
      var img = document.createElement('img'); img.src = edThumb(p); img.alt = '';
      img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--line);cursor:crosshair';
      img.title = 'برك باش تحدّد البلاصة المهمة';
      img.addEventListener('click', function () { openFocal(i); });
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'حيّد التصويرة';
      x.addEventListener('click', function (ev2) {
        ev2.stopPropagation();
        var gone = edPhotos.splice(i, 1)[0];
        dropRef(gone && gone.src ? gone.src : gone);
        renderEdMedia();
      });
      d.appendChild(img); d.appendChild(x); t.appendChild(d);
    });
    $('d_it_vhint').textContent = edVideo ? 'الفيديو تزاد ✓' : 'ما زال ما زدتي حتى فيديو.';
  }
  function openFocal(i) {
    var p = edPhotos[i];
    if (!p) return;
    focalIdx = i;
    $('d_focalBox').hidden = false;
    BizDyali.media.resolveRef(p.src || p).then(function (u) {
      var img = $('d_focalImg');
      delete img.dataset.ready;
      img.onload = function () { img.dataset.ready = '1'; placeDot(); };
      img.onerror = function () { showErr('التصويرة ما تحمّلاتش للمعاينة.'); };
      img.src = (u && u.src) || u;
      if (img.complete && img.naturalWidth) img.dataset.ready = '1';
    });
    function placeDot() { placeDotAt(p); }
  }
  function placeDotAt(p) {
    var dot = $('d_focalDot');
    var o = BizDyali.media.normalizePhoto(p) || { fx: 50, fy: 50 };
    dot.style.left = o.fx + '%'; dot.style.top = o.fy + '%';
  }
  $('d_focalImg').addEventListener('click', function (e) {
    if (focalIdx < 0 || !edPhotos[focalIdx]) return;
    if (!e.target.dataset.ready) { showErr('التصويرة ما زال كتحمّل — عاود من بعد شوية.'); return; }
    var r = e.target.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var fx = Math.round((e.clientX - r.left) / r.width * 100);
    var fy = Math.round((e.clientY - r.top) / r.height * 100);
    var cur = edPhotos[focalIdx];
    var src = (cur && cur.src) || cur;
    edPhotos[focalIdx] = { src: src, thumb: edThumb(cur), fx: fx, fy: fy };
    placeDotAt(edPhotos[focalIdx]);
  });
  $('d_focalDone').addEventListener('click', function () { $('d_focalBox').hidden = true; focalIdx = -1; renderEdMedia(); });
  $('d_addProduct').addEventListener('click', function () { openEditor('product'); });
  $('d_addService').addEventListener('click', function () { openEditor('service'); });
  $('d_it_cancel').addEventListener('click', function () { $('d_editor').hidden = true; editingId = null; });
  $('d_it_photos').addEventListener('change', function (e) {
    var useIdb = BizDyali.media.idbSupported();
    var files = Array.prototype.slice.call(e.target.files || []).slice(0, 4 - edPhotos.length);
    (function next() {
      var f = files.shift(); if (!f) { e.target.value = ''; return; }
      BizDyali.media.processImage(f, { maxFull: 900, store: useIdb ? 'idb' : undefined }).then(function (o) {
        edPhotos.push(o.ref ? { src: o.ref, thumb: o.thumb, fx: 50, fy: 50 } : o.full);
        renderEdMedia(); next();
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
    if (name.length < 2) return showErr('عطي شي سمية لهاد ' + (edKind === 'service' ? 'الخدمة' : 'البرودوي') + '.');
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
    var extra = { section: $('d_it_section').value.trim(), badge: $('d_it_badge').value, duration: $('d_it_duration').value.trim() };
    if (editingId) {
      var it = prev;
      if (it) { it.name = name; it.description = $('d_it_desc').value.trim(); it.price = price; it.photos = edPhotos; it.video = edVideo; it.section = extra.section; it.badge = extra.badge; it.duration = extra.duration; }
    } else {
      biz.items.push({ id: 'it_' + Date.now().toString(36) + Math.floor(Math.random() * 999), kind: edKind, name: name, description: $('d_it_desc').value.trim(), price: price, photos: edPhotos, video: edVideo, order: biz.items.length, section: extra.section, badge: extra.badge, duration: extra.duration });
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

  // ---- Design, hours & QR tab ----
  var designLook = '', designAccentMode = 'auto';
  function fillDesign() {
    var th = biz.theme || {};
    designLook = th.look || '';
    designAccentMode = th.accent ? 'custom' : 'auto';
    document.querySelectorAll('#d_lookPills .pill').forEach(function (b) {
      b.setAttribute('aria-pressed', (b.dataset.look || '') === designLook);
    });
    document.querySelectorAll('#d_accentPills .pill').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.accentmode === designAccentMode);
    });
    $('d_customColorWrap').hidden = designAccentMode !== 'custom';
    if (th.accent) $('d_accentColor').value = th.accent;
    $('d_lang').value = biz.lang || '';
    $('d_mode').value = (th.mode === 'dark') ? 'dark' : '';
    $('d_basket').value = th.basket ? 'on' : '';
    $('previewDesignBtn').href = BizDyali.publicUrl(biz.slug) + '&preview=1';
    buildHoursEditor();
  }
  document.querySelectorAll('#d_lookPills .pill').forEach(function (b) {
    b.addEventListener('click', function () {
      designLook = b.dataset.look || '';
      document.querySelectorAll('#d_lookPills .pill').forEach(function (q) { q.setAttribute('aria-pressed', q === b); });
    });
  });
  document.querySelectorAll('#d_accentPills .pill').forEach(function (b) {
    b.addEventListener('click', function () {
      designAccentMode = b.dataset.accentmode;
      document.querySelectorAll('#d_accentPills .pill').forEach(function (q) { q.setAttribute('aria-pressed', q === b); });
      $('d_customColorWrap').hidden = designAccentMode !== 'custom';
    });
  });
  $('saveDesignBtn').addEventListener('click', function () {
    hideMsgs();
    var th = biz.theme || {};
    if (designLook) th.look = designLook; else delete th.look;
    if (designAccentMode === 'custom' && /^#[0-9a-f]{6}$/i.test($('d_accentColor').value)) th.accent = $('d_accentColor').value;
    else delete th.accent;
    var mode = $('d_mode').value;
    if (mode === 'dark') th.mode = 'dark'; else delete th.mode;
    if ($('d_basket').value === 'on') th.basket = true; else delete th.basket;
    if (Object.keys(th).length) biz.theme = th; else delete biz.theme;
    biz.lang = $('d_lang').value || undefined;
    if (!biz.lang) delete biz.lang;
    if (persist()) {
      BizDyali.logEvent('admin_action', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Updated design settings' });
      showOk('تسجّل الديزاين ✓ — شوف الصفحة باش تشوفو.');
    }
  });
  var WEEKDAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  function buildHoursEditor() {
    var host = $('d_hoursWeek'); host.innerHTML = '';
    var hw = biz.hoursWeek || {};
    WEEKDAYS.forEach(function (d) {
      var key = d[0], label = d[1];
      var ranges = hw[key] || [];
      var open = ranges.length > 0;
      var o = open ? ranges[0][0] : '09:00';
      var c = open ? ranges[0][1] : '18:00';
      var row = document.createElement('div');
      row.className = 'two-col';
      row.innerHTML = '<label class="field" style="font-size:.85rem"><span><input type="checkbox" data-hw-day="' + key + '"' + (open ? ' checked' : '') + ' /> ' + label + '</span></label>' +
        '<span style="display:flex;gap:.4rem;align-items:center"><input type="time" data-hw-open="' + key + '" value="' + o + '" aria-label="' + label + ' opens" />–<input type="time" data-hw-close="' + key + '" value="' + c + '" aria-label="' + label + ' closes" /></span>';
      host.appendChild(row);
    });
  }
  $('saveHoursBtn').addEventListener('click', function () {
    hideMsgs();
    var hw = {};
    WEEKDAYS.forEach(function (d) {
      var key = d[0];
      var on = host_query(key);
      if (on) {
        var o = document.querySelector('[data-hw-open="' + key + '"]').value || '09:00';
        var c = document.querySelector('[data-hw-close="' + key + '"]').value || '18:00';
        hw[key] = [[o, c]];
      }
    });
    function host_query(k) { var el = document.querySelector('[data-hw-day="' + k + '"]'); return el && el.checked; }
    if (Object.keys(hw).length) biz.hoursWeek = hw; else delete biz.hoursWeek;
    if (persist()) {
      BizDyali.logEvent('info_changed', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Updated structured opening hours' });
      showOk('تسجّل التوقيت ✓ — “حال دابا” خدامة دابا.');
    }
  });
  $('clearHoursBtn').addEventListener('click', function () {
    delete biz.hoursWeek;
    if (persist()) { buildHoursEditor(); showOk('تمسح التوقيت المفصّل — التوقيت المكتوب هو اللي خدام.'); }
  });
  $('qrPosterBtn').addEventListener('click', function () {
    if (typeof qrcode === 'undefined') return showErr('مكتبة QR ما تحمّلاتش. شوف الكونكسيون وعاود.');
    var url = BizDyali.publicUrl(biz.slug);
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    var img = qr.createDataURL(8, 8);
    var w = window.open('', '_blank');
    if (!w) return showErr('سمح بالنوافذ المنبثقة باش تحل لآفيش.');
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR poster — ' + biz.name.replace(/</g, '&lt;') + '</title>' +
      '<style>body{font-family:Georgia,serif;text-align:center;padding:48px;color:#101814}h1{font-size:42px;margin:0 0 8px}.sub{color:#555;margin:0 0 24px}img{width:320px;height:320px}.url{font-family:monospace;font-size:13px;color:#555;margin-top:16px;word-break:break-all}.bar{width:120px;height:4px;background:#0A6B4F;margin:24px auto}@media print{.noprint{display:none}}</style></head><body>' +
      '<div class="bar"></div><h1>' + biz.name.replace(/</g, '&lt;') + '</h1>' +
      '<p class="sub">' + (biz.city || '').replace(/</g, '&lt;') + '</p>' +
      '<img src="' + img + '" alt="QR code" /><p class="url">' + url.replace(/</g, '&lt;') + '</p>' +
      '<p class="noprint"><button onclick="window.print()">Print poster</button> <a href="' + img + '" download="bizdyali-qr.png">Download QR PNG</a></p></body></html>');
    w.document.close();
    BizDyali.logEvent('admin_action', { actor: 'owner', actorName: user.name, businessId: biz.id, businessName: biz.name, ownerId: user.id, details: 'Opened QR poster' });
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

  function fillAll() { hideMsgs(); renderTrial(); renderOverview(); fillInfo(); fillBranding(); renderItems(); fillDesign(); }

  load(params.get('biz'));
})();
