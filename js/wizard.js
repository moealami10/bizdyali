/* BizDyali page-creator wizard (5 steps). Requires login; draft autosaves per user. */
(function () {
  'use strict';
  BizDyali.seedDemo();
  var user = BizDyali.currentUser();
  if (!user) { location.replace('auth.html?next=create.html'); return; }
  document.getElementById('whoAmI').textContent = user.name + ' • ';

  var draft = BizDyali.loadDraft(user.id) || BizDyali.blankBusiness(user.id);
  draft.ownerId = user.id;
  // Prefill business name from homepage CTA (?biz=...), if draft is still empty.
  try {
    var prefill = new URLSearchParams(location.search).get('biz');
    if (prefill && !draft.name) draft.name = prefill.slice(0, 60);
  } catch (e) { /* ignore */ }
  var step = 1;
  var editingItemId = null;
  var editorPhotos = [];
  var editorVideo = null;
  var confirmEmptyPublish = false;
  var publishBtnLabel = null;

  var $ = function (id) { return document.getElementById(id); };
  var err = $('wizErr');
  function showErr(msg) { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
  function hideErr() { err.hidden = true; }
  function touchSave() {
    $('saveState').textContent = 'Saving…';
    collectStep(step);
    BizDyali.saveDraft(user.id, draft);
    $('saveState').textContent = 'Draft saved ✓';
  }

  // ---- Fill form from draft ----
  function fill() {
    $('f_name').value = draft.name || '';
    $('f_category').value = draft.category || '';
    $('f_description').value = draft.description || '';
    $('f_phone').value = draft.phone || '';
    $('f_whatsapp').value = draft.whatsapp || '';
    $('f_address').value = draft.address || '';
    $('f_city').value = draft.city || '';
    $('f_hours').value = draft.hours || '';
    $('f_facebook').value = draft.facebook || '';
    $('f_instagram').value = draft.instagram || '';
    if (draft.logo) { $('logoPreview').src = draft.logo; $('logoPreview').hidden = false; }
    if (draft.cover) { $('coverPreview').src = draft.cover; $('coverPreview').hidden = false; }
    refreshPills(); renderItems();
    $('f_slug').value = BizDyali.slugify(draft.name || 'my-business');
  }

  function collectStep(s) {
    if (s === 1) {
      draft.name = $('f_name').value.trim();
      draft.category = $('f_category').value;
      draft.description = $('f_description').value.trim();
      draft.phone = $('f_phone').value.trim();
      draft.whatsapp = $('f_whatsapp').value.trim();
      draft.address = $('f_address').value.trim();
      draft.city = $('f_city').value.trim();
      draft.hours = $('f_hours').value.trim();
      draft.facebook = $('f_facebook').value.trim();
      draft.instagram = $('f_instagram').value.trim();
    }
  }

  function validStep1() {
    collectStep(1);
    if (draft.name.length < 2) return 'Please enter your business name.';
    if (!draft.category) return 'Please choose a business category.';
    if (draft.description.length < 10) return 'Please write a short description (at least 10 characters).';
    if (draft.phone.length < 6) return 'Please enter a valid phone number.';
    if (draft.whatsapp.length < 6) return 'Please enter a valid WhatsApp number.';
    if (draft.city.length < 2) return 'Please enter your city.';
    if (draft.hours.length < 3) return 'Please enter your opening hours.';
    return null;
  }

  // ---- Step navigation ----
  var bar = $('stepsBar').querySelectorAll('li');
  function go(n) {
    hideErr();
    if (n > step) {
      if (step === 1) { var e = validStep1(); if (e) { showErr(e); return; } }
      collectStep(step);
    } else { collectStep(step); }
    step = n;
    BizDyali.saveDraft(user.id, draft);
    document.querySelectorAll('.wizard-step').forEach(function (s) {
      s.classList.toggle('active', Number(s.dataset.step) === step);
    });
    bar.forEach(function (li) {
      var k = Number(li.dataset.s);
      li.classList.toggle('active', k === step);
      li.classList.toggle('done', k < step);
    });
    if (step === 4) BizRender.renderPublicPage(draft, $('previewMount'));
    if (step === 5 && !$('f_slug').value) $('f_slug').value = BizDyali.slugify(draft.name);
    // Leaving step 5 resets the empty-catalog confirmation.
    if (n !== 5 && publishBtnLabel !== null) {
      confirmEmptyPublish = false;
      $('pubWarn').hidden = true;
      $('publishBtn').textContent = publishBtnLabel;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('[data-next]').forEach(function (b) { b.addEventListener('click', function () { go(step + 1); touchSave(); }); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { go(step - 1); }); });
  document.querySelectorAll('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { go(Number(b.dataset.goto)); }); });

  // ---- Step 2: branding uploads ----
  $('f_logo').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    BizDyali.media.fileToImageDataURL(f, 600).then(function (url) {
      draft.logo = url; touchSave();
      $('logoPreview').src = url; $('logoPreview').hidden = false;
    }).catch(function (err2) { showErr(err2.message); });
  });
  $('f_cover').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    BizDyali.media.fileToImageDataURL(f, 1400).then(function (url) {
      draft.cover = url; touchSave();
      $('coverPreview').src = url; $('coverPreview').hidden = false;
    }).catch(function (err2) { showErr(err2.message); });
  });

  // ---- Step 3: offering type + items ----
  function refreshPills() {
    document.querySelectorAll('[data-offer]').forEach(function (p) {
      p.setAttribute('aria-pressed', p.dataset.offer === draft.offeringType);
    });
    var showP = draft.offeringType !== 'services';
    var showS = draft.offeringType !== 'products';
    $('addProductBtn').style.display = showP ? '' : 'none';
    $('addServiceBtn').style.display = showS ? '' : 'none';
  }
  document.querySelectorAll('[data-offer]').forEach(function (p) {
    p.addEventListener('click', function () { draft.offeringType = p.dataset.offer; refreshPills(); touchSave(); });
  });

  function visibleItems() {
    return (draft.items || []).slice().sort(function (a, b) { return a.order - b.order; })
      .filter(function (it) {
        if (draft.offeringType === 'products') return it.kind === 'product';
        if (draft.offeringType === 'services') return it.kind === 'service';
        return true;
      });
  }

  function renderItems() {
    var list = $('itemList'); list.innerHTML = '';
    var items = visibleItems();
    $('itemEmpty').style.display = items.length ? 'none' : '';
    items.forEach(function (it, idx) {
      var li = document.createElement('li');
      li.className = 'item-row';
      var thumb = (it.photos && it.photos[0])
        ? '<div class="item-thumb" style="background-image:url(\'' + it.photos[0] + '\')"></div>'
        : '<div class="item-thumb">' + BizRender.esc((it.name || '?').charAt(0).toUpperCase()) + '</div>';
      li.innerHTML = thumb + '<div style="min-width:0"><span class="item-kind">' + it.kind + '</span> <b>' +
        BizRender.esc(it.name) + '</b><small>' +
        (it.price !== '' && it.price != null ? esc2(it.price) + ' MAD • ' : '') +
        BizRender.esc((it.description || '').slice(0, 60)) + '</small></div>';
      var acts = document.createElement('div');
      acts.className = 'item-actions';
      [['↑', 'Move up', function () { move(it.id, -1); }],
       ['↓', 'Move down', function () { move(it.id, 1); }],
       ['✏️', 'Edit', function () { openEditor(it.kind, it.id); }],
       ['🗑️', 'Delete', function () {
          if (confirm('Delete "' + it.name + '"?')) {
            draft.items = draft.items.filter(function (x) { return x.id !== it.id; });
            renumber(); touchSave(); renderItems();
          }
        }]].forEach(function (cfg) {
        var b = document.createElement('button');
        b.className = 'icon-btn'; b.textContent = cfg[0]; b.title = cfg[1]; b.type = 'button';
        b.addEventListener('click', cfg[2]); acts.appendChild(b);
      });
      li.appendChild(acts);
      list.appendChild(li);
    });
    function esc2(v) { return BizRender.esc(v); }
  }

  function renumber() {
    draft.items.slice().sort(function (a, b) { return a.order - b.order; })
      .forEach(function (it, i) { it.order = i; });
  }
  function move(id, dir) {
    var sorted = draft.items.slice().sort(function (a, b) { return a.order - b.order; });
    var i = sorted.findIndex(function (x) { return x.id === id; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    var t = sorted[i].order; sorted[i].order = sorted[j].order; sorted[j].order = t;
    touchSave(); renderItems();
  }

  function openEditor(kind, id) {
    hideErr();
    editingItemId = id || null;
    editorPhotos = []; editorVideo = null;
    var existing = id ? draft.items.find(function (x) { return x.id === id; }) : null;
    if (existing) {
      editorPhotos = (existing.photos || []).slice();
      editorVideo = existing.video || null;
      $('it_name').value = existing.name;
      $('it_desc').value = existing.description || '';
      $('it_price').value = existing.price == null ? '' : existing.price;
    } else {
      $('it_name').value = ''; $('it_desc').value = ''; $('it_price').value = '';
    }
    $('editorTitle').textContent = (existing ? 'Edit ' : 'Add ') + kind;
    $('itemNameLabel').firstChild.textContent = (kind === 'product' ? 'Product' : 'Service') + ' name * ';
    $('itemEditor').dataset.kind = kind;
    $('itemEditor').hidden = false;
    renderEditorMedia();
    $('it_name').focus();
  }
  function renderEditorMedia() {
    var t = $('itPhotoThumbs'); t.innerHTML = '';
    editorPhotos.forEach(function (p, i) {
      var d = document.createElement('div'); d.className = 'thumb-x';
      d.innerHTML = '<img src="' + p + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--line)" />';
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.title = 'Remove photo';
      x.addEventListener('click', function () { editorPhotos.splice(i, 1); renderEditorMedia(); });
      d.appendChild(x); t.appendChild(d);
    });
    $('itVideoHint').textContent = editorVideo ? 'Video attached ✓ (replace by choosing another file)' : 'No video attached.';
  }
  $('addProductBtn').addEventListener('click', function () { openEditor('product'); });
  $('addServiceBtn').addEventListener('click', function () { openEditor('service'); });
  $('itCancel').addEventListener('click', function () { $('itemEditor').hidden = true; editingItemId = null; });
  $('it_photos').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []).slice(0, 4 - editorPhotos.length);
    (function next() {
      var f = files.shift(); if (!f) { e.target.value = ''; return; }
      BizDyali.media.fileToImageDataURL(f, 900).then(function (url) {
        editorPhotos.push(url); renderEditorMedia(); next();
      }).catch(function (err2) { showErr(err2.message); next(); });
    })();
  });
  $('it_video').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    BizDyali.media.fileToVideoDataURL(f, 10).then(function (url) {
      editorVideo = url; renderEditorMedia(); e.target.value = '';
    }).catch(function (err2) { showErr(err2.message); e.target.value = ''; });
  });
  $('itSave').addEventListener('click', function () {
    var kind = $('itemEditor').dataset.kind || 'product';
    var name = $('it_name').value.trim();
    if (name.length < 2) { showErr('Please give your ' + kind + ' a name.'); return; }
    var priceRaw = $('it_price').value;
    var price = priceRaw === '' ? null : Math.max(0, Number(priceRaw));
    if (editingItemId) {
      var it = draft.items.find(function (x) { return x.id === editingItemId; });
      if (it) { it.name = name; it.description = $('it_desc').value.trim(); it.price = price; it.photos = editorPhotos; it.video = editorVideo; }
    } else {
      draft.items.push({
        id: 'it_' + Date.now().toString(36) + Math.floor(Math.random() * 999),
        kind: kind, name: name, description: $('it_desc').value.trim(),
        price: price, photos: editorPhotos, video: editorVideo, order: draft.items.length
      });
    }
    $('itemEditor').hidden = true; editingItemId = null;
    hideErr(); touchSave(); renderItems();
  });

  // ---- Step 5: publish ----
  if (publishBtnLabel === null) publishBtnLabel = $('publishBtn').textContent;
  $('publishBtn').addEventListener('click', function () {
    collectStep(1);
    // Empty catalog guard: warn once, publish only on explicit second click.
    if ((draft.items || []).length === 0 && !confirmEmptyPublish) {
      confirmEmptyPublish = true;
      $('pubErr').hidden = true;
      $('pubWarn').hidden = false;
      $('publishBtn').textContent = 'Publish anyway — my page has no products or services';
      $('pubWarn').scrollIntoView({ block: 'nearest' });
      return;
    }
    var slug = $('f_slug').value.trim();
    var res = BizDyali.publishBusiness(draft, slug);
    var pe = $('pubErr');
    if (res.error) { pe.textContent = res.error; pe.hidden = false; return; }
    pe.hidden = true;
    BizDyali.clearDraft(user.id);
    location.replace('dashboard.html?biz=' + res.business.id + '&welcome=1');
  });

  // Autosave text inputs (light)
  ['f_name', 'f_category', 'f_description', 'f_phone', 'f_whatsapp', 'f_address', 'f_city', 'f_hours', 'f_facebook', 'f_instagram']
    .forEach(function (id) {
      $(id).addEventListener('input', function () {
        clearTimeout(window.__dz);
        window.__dz = setTimeout(touchSave, 600);
      });
    });

  fill();
  go(1);
})();
