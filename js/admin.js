/* BizDyali admin dashboard.
   Every data call goes through BizDyali.admin* functions, each of which
   re-verifies the admin session. The gate below only controls what is shown;
   authorization is enforced inside the store functions. (True enforcement
   needs a backend — see store.js SECURITY NOTE.) */
(function () {
  'use strict';
  BizDyali.seedDemo();

  var $ = function (id) { return document.getElementById(id); };
  var errBox = $('adminErr'), okBox = $('adminOk');
  function showErr(m) { errBox.textContent = m; errBox.hidden = false; okBox.hidden = true; window.scrollTo({ top: 0 }); }
  function showOk(m) { okBox.textContent = m; okBox.hidden = false; errBox.hidden = true; setTimeout(function () { okBox.hidden = true; }, 4000); }
  function hideMsgs() { errBox.hidden = true; okBox.hidden = true; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtDT(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  }
  function statusPill(st) { return '<span class="status-pill st-' + st + '">' + st + '</span>'; }

  // ---------- Gate ----------
  function refreshGate() {
    var admin = BizDyali.currentAdmin();
    $('gateView').hidden = !!admin;
    $('adminApp').hidden = !admin;
    $('adminLogout').hidden = !admin;
    $('adminWho').textContent = admin ? admin.email + ' • ' : '';
    if (!admin) {
      var needSetup = BizDyali.needsAdminSetup();
      $('setupBox').hidden = !needSetup;
      $('loginBox').hidden = needSetup;
    } else { loadAll(); }
  }
  $('setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var r = BizDyali.setupAdmin($('setupEmail').value, $('setupPw').value);
    if (r.error) { var b = $('setupErr'); b.textContent = r.error; b.hidden = false; return; }
    $('setupEmail').value = '';
    $('setupPw').value = '';
    refreshGate();
  });
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var r = BizDyali.adminLogin($('adminEmail').value, $('adminPw').value);
    if (r.error) { var b = $('loginErr'); b.textContent = r.error; b.hidden = false; return; }
    $('adminEmail').value = '';
    $('adminPw').value = '';
    refreshGate();
  });
  $('adminLogout').addEventListener('click', function () { BizDyali.adminLogout(); selectedId = null; refreshGate(); });

  // ---------- Tabs ----------
  document.querySelectorAll('[data-atab]').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('[data-atab]').forEach(function (q) { q.setAttribute('aria-selected', q === t); });
      document.querySelectorAll('[data-apanel]').forEach(function (p) { p.classList.toggle('active', p.dataset.apanel === t.dataset.atab); });
    });
  });

  var allBiz = [];
  var selectedId = null;

  function loadAll() {
    hideMsgs();
    var r = BizDyali.adminAllBusinesses();
    if (r.error) { showErr(r.error); return; }
    allBiz = r.businesses;
    allBiz.forEach(function (b) { BizDyali.checkAndLogExpiry(b); }); // record any fresh expiries
    renderStats(); renderTable(); renderTrials(); renderLogs();
    if (selectedId) openDetail(selectedId, true);
  }
  $('refreshBtn').addEventListener('click', loadAll);

  // ---------- Overview ----------
  function renderStats() {
    var r = BizDyali.adminStats();
    if (r.error) { showErr(r.error); return; }
    var s = r.stats;
    var cards = [
      ['total', 'Total businesses', ''],
      ['trial', 'On free trial', s.trial ? 'good' : ''],
      ['subscribed', 'Active paid', s.subscribed ? 'good' : ''],
      ['expired', 'Expired trials', s.expired ? 'alert' : ''],
      ['today', 'Created today', ''],
      ['week', 'Created this week', ''],
      ['month', 'Created this month', ''],
      ['suspended', 'Pages disabled', s.suspended ? 'alert' : '']
    ];
    $('statGrid').innerHTML = cards.map(function (c) {
      return '<div class="stat ' + c[2] + '"><b>' + s[c[0]] + '</b><span>' + c[1] + '</span></div>';
    }).join('');
  }

  // ---------- Business list ----------
  function filtered() {
    var q = $('bizSearch').value.trim().toLowerCase();
    var sf = $('statusFilter').value;
    return allBiz.filter(function (b) {
      if (sf && BizDyali.trialState(b).status !== sf) return false;
      if (!q) return true;
      return [b.name, b.ownerName, b.ownerEmail, b.city, b.category, b.slug].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function ownerLabel(b) {
    if (b.ownerName) return esc(b.ownerName) + '<br /><small>' + esc(b.ownerEmail || '') + '</small>';
    return '<small>' + esc(b.ownerId || '—') + '</small>';
  }
  function renderTable() {
    var rows = filtered();
    $('bizRows').innerHTML = rows.map(function (b) {
      var st = BizDyali.trialState(b).status;
      var sub = BizDyali.subscriptionStatus(b);
      return '<tr><td><b>' + esc(b.name || '(unnamed)') + '</b><br /><small>/' + esc(b.slug || '—') + '</small></td>' +
        '<td>' + ownerLabel(b) + '</td>' +
        '<td>' + esc(b.category || '—') + '<br /><small>' + esc(b.city || '') + '</small></td>' +
        '<td><small>' + BizDyali.fmtDate(b.createdAt) + '</small></td>' +
        '<td><small>' + BizDyali.fmtDate(b.trialStart) + ' →<br />' + BizDyali.fmtDate(b.trialEnd) + '</small></td>' +
        '<td>' + statusPill(st) + '</td>' +
        '<td>' + (sub === 'active' ? '<b style="color:#1D3FA8">active</b>' : sub) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-open="' + b.id + '" type="button">Open</button></td></tr>';
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No businesses match.</td></tr>';
    $('bizCount').textContent = rows.length + ' of ' + allBiz.length + ' businesses';
    $('bizRows').querySelectorAll('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDetail(btn.dataset.open); });
    });
  }
  $('bizSearch').addEventListener('input', renderTable);
  $('statusFilter').addEventListener('change', renderTable);

  // ---------- Business detail ----------
  function kvRow(k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
  function openDetail(id, keepPosition) {
    var b = allBiz.find(function (x) { return x.id === id; });
    if (!b) return;
    selectedId = id;
    hideMsgs();
    $('bizDetail').hidden = false;
    $('d_bizName').textContent = b.name || '(unnamed)';
    var st = BizDyali.trialState(b).status;
    $('d_info').innerHTML =
      kvRow('Status', statusPill(st) + (b.suspended ? ' ' + statusPill('suspended') : '')) +
      kvRow('Owner', esc(b.ownerName || '—') + ' (' + esc(b.ownerEmail || b.ownerId) + ')') +
      kvRow('Category', esc(b.category || '—')) +
      kvRow('Description', esc(b.description || '—')) +
      kvRow('Phone', esc(b.phone || '—')) +
      kvRow('WhatsApp', esc(b.whatsapp || '—')) +
      kvRow('Address', esc(b.address || '—') + (b.city ? ', ' + esc(b.city) : '')) +
      kvRow('Hours', esc(b.hours || '—')) +
      kvRow('Facebook', b.facebook ? '<a href="' + esc(b.facebook) + '" target="_blank" rel="noopener">link →</a>' : '—') +
      kvRow('Instagram', b.instagram ? '<a href="' + esc(b.instagram) + '" target="_blank" rel="noopener">link →</a>' : '—') +
      kvRow('Offering', esc(b.offeringType || 'both')) +
      kvRow('Created', BizDyali.fmtDate(b.createdAt)) +
      kvRow('Link', '<code>/' + esc(b.slug || '—') + '</code>');
    $('d_viewPublic').href = b.slug ? BizDyali.publicUrl(b.slug) + '&preview=1' : '#';
    // Drafts have no public page: never link them to the generic directory.
    var hasPage = !!(b.published && b.slug);
    $('d_viewCustomer').hidden = !hasPage;
    $('d_viewPublic').hidden = !hasPage;
    $('d_noPublic').hidden = hasPage;
    if (hasPage) {
      $('d_viewCustomer').href = BizDyali.publicUrl(b.slug); // exactly what visitors see
      $('d_viewPublic').href = BizDyali.publicUrl(b.slug) + '&preview=1'; // bypasses trial/suspension gates
      $('d_viewPublic').title = 'Bypasses expired/suspended notices for inspection';
    }
    // Items
    var items = (b.items || []).slice().sort(function (a, c) { return a.order - c.order; });
    $('d_itemCount').textContent = items.length;
    $('d_items').innerHTML = items.length ? items.map(function (it) {
      return '<div class="item-row"><div style="min-width:0"><span class="item-kind">' + esc(it.kind) + '</span> <b>' + esc(it.name) + '</b><br /><small>' +
        (it.price != null && it.price !== '' ? esc(it.price) + ' MAD • ' : '') + esc((it.description || '').slice(0, 80)) +
        ' • ' + (it.photos || []).length + ' photos' + (it.video ? ' • video ✓' : '') + '</small></div></div>';
    }).join('') : '<div class="empty">No products or services.</div>';
    // Media
    var photos = [];
    if (b.logo) photos.push(['Logo', b.logo]);
    if (b.cover) photos.push(['Cover', b.cover]);
    items.forEach(function (it) { (it.photos || []).forEach(function (p, i) { photos.push([it.name + ' #' + (i + 1), p]); }); });
    var videos = items.filter(function (it) { return it.video; });
    $('d_media').innerHTML =
      (photos.length ? '<p><b>' + photos.length + ' image(s)</b></p><div class="media-strip">' +
        photos.map(function (p) { return '<img src="' + p[1] + '" alt="' + esc(p[0]) + '" title="' + esc(p[0]) + '" loading="lazy" />'; }).join('') + '</div>' : '<p class="page-sub">No images uploaded.</p>') +
      (videos.length ? '<p><b>' + videos.length + ' video(s)</b></p>' + videos.map(function (it) {
        return '<p><small>' + esc(it.name) + '</small><video controls preload="metadata" src="' + it.video + '" style="width:100%;max-height:240px;border-radius:12px;background:#000"></video></p>';
      }).join('') : '<p class="page-sub">No videos uploaded.</p>');
    // Trial box
    $('d_trial').innerHTML =
      kvRow('Trial start', BizDyali.fmtDate(b.trialStart)) +
      kvRow('Trial end', BizDyali.fmtDate(b.trialEnd)) +
      kvRow('Days left', st === 'trial' || st === 'suspended' ? BizDyali.trialState(b).daysLeft : '—') +
      kvRow('Subscription', BizDyali.subscriptionStatus(b));
    $('d_accessNote').textContent = b.suspended
      ? 'Public page is DISABLED — customers see a “paused” notice. Data is kept.'
      : (b.published ? 'Public page is live (subject to trial/subscription status).' : 'Page is a draft — never published, not visible to customers.');
    $('suspendBtn').style.display = b.suspended ? 'none' : '';
    $('unsuspendBtn').style.display = b.suspended ? '' : 'none';
    // Prefill edit form
    ['name', 'category', 'description', 'phone', 'whatsapp', 'address', 'city', 'hours', 'facebook', 'instagram'].forEach(function (k) {
      $('e_' + k).value = b[k] || '';
    });
    $('e_offering').value = b.offeringType || 'both';
    $('d_editForm').hidden = true;
    if (!keepPosition) $('bizDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('backToList').addEventListener('click', function () { selectedId = null; $('bizDetail').hidden = true; window.scrollTo({ top: 0 }); });
  $('d_toggleEdit').addEventListener('click', function () { $('d_editForm').hidden = !$('d_editForm').hidden; });
  $('d_editForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!selectedId) return;
    var fields = {};
    ['name', 'category', 'description', 'phone', 'whatsapp', 'address', 'city', 'hours', 'facebook', 'instagram'].forEach(function (k) {
      fields[k] = $('e_' + k).value.trim();
    });
    fields.offeringType = $('e_offering').value;
    var r = BizDyali.adminUpdateInfo(selectedId, fields, 'Edited via admin dashboard');
    if (r.error) return showErr(r.error);
    showOk('Business information updated ✓');
    loadAll();
  });
  $('extendBtn').addEventListener('click', function () {
    if (!selectedId) return;
    var r = BizDyali.adminExtendTrial(selectedId, $('extendDays').value);
    if (r.error) return showErr(r.error);
    showOk('Trial extended — now ends ' + BizDyali.fmtDate(r.business.trialEnd) + ' ✓');
    loadAll();
  });
  $('subOnBtn').addEventListener('click', function () {
    if (!selectedId) return;
    if (!confirm('Mark this business as a PAID subscriber (100 MAD/month placeholder)? No payment is processed.')) return;
    var r = BizDyali.adminSetSubscription(selectedId, true);
    if (r.error) return showErr(r.error);
    showOk('Marked as paid subscriber ✓');
    loadAll();
  });
  $('subOffBtn').addEventListener('click', function () {
    if (!selectedId) return;
    var r = BizDyali.adminSetSubscription(selectedId, false);
    if (r.error) return showErr(r.error);
    showOk('Subscription removed ✓');
    loadAll();
  });
  $('suspendBtn').addEventListener('click', function () {
    if (!selectedId) return;
    if (!confirm('Disable the public page? Customers will see a “paused” notice. All data is kept.')) return;
    var r = BizDyali.adminSetSuspended(selectedId, true);
    if (r.error) return showErr(r.error);
    showOk('Public page disabled ✓');
    loadAll();
  });
  $('unsuspendBtn').addEventListener('click', function () {
    if (!selectedId) return;
    var r = BizDyali.adminSetSuspended(selectedId, false);
    if (r.error) return showErr(r.error);
    showOk('Public page re-enabled ✓');
    loadAll();
  });
  $('unpublishBtn').addEventListener('click', function () {
    if (!selectedId) return;
    if (!confirm('Unpublish this page back to draft? It will no longer be reachable by customers.')) return;
    var r = BizDyali.adminUnpublish(selectedId);
    if (r.error) return showErr(r.error);
    showOk('Page unpublished (draft) ✓');
    loadAll();
  });
  $('deleteBizBtn').addEventListener('click', function () {
    if (!selectedId) return;
    var b = allBiz.find(function (x) { return x.id === selectedId; });
    if (!b) return;
    if (!confirm('Step 1 of 2: permanently DELETE "' + b.name + '" and ALL its data? This cannot be undone.')) return;
    var typed = prompt('Step 2 of 2: type the business name exactly to confirm deletion:\n\n' + b.name);
    if (typed !== b.name) { showErr('Deletion cancelled — name did not match. Nothing was deleted.'); return; }
    var r = BizDyali.adminDeleteBusiness(selectedId);
    if (r.error) return showErr(r.error);
    selectedId = null;
    $('bizDetail').hidden = true;
    showOk('Business permanently deleted. The action was recorded in the activity log.');
    loadAll();
  });

  // ---------- Trials tab ----------
  function trialRow(b, extra) {
    return '<tr><td><b>' + esc(b.name) + '</b><br /><small>' + esc(b.ownerName || '') + ' • ' + esc(b.city || '') + '</small></td>' +
      '<td><small>ends ' + BizDyali.fmtDate(b.trialEnd) + '</small><br /><b>' + extra + '</b></td>' +
      '<td><button class="btn btn-ghost btn-sm" data-open="' + b.id + '" type="button">Manage</button></td></tr>';
  }
  function renderTrials() {
    var active = [], soon = [], exp = [];
    allBiz.forEach(function (b) {
      if (!b.published || b.subscription === 'active') return;
      var st = BizDyali.trialState(b);
      if (st.status === 'trial') {
        active.push(b);
        if (st.daysLeft <= 3) soon.push(b);
      } else if (st.status === 'expired') exp.push(b);
    });
    $('t_active_n').textContent = active.length;
    $('t_soon_n').textContent = soon.length;
    $('t_exp_n').textContent = exp.length;
    $('t_active').innerHTML = active.map(function (b) { return trialRow(b, BizDyali.trialState(b).daysLeft + ' day(s) left'); }).join('') || '<tr><td class="page-sub">None.</td></tr>';
    $('t_soon').innerHTML = soon.map(function (b) { return trialRow(b, '⚠ ' + BizDyali.trialState(b).daysLeft + ' day(s) left'); }).join('') || '<tr><td class="page-sub">None.</td></tr>';
    $('t_exp').innerHTML = exp.map(function (b) { return trialRow(b, 'ended ' + BizDyali.fmtDate(b.trialEnd)); }).join('') || '<tr><td class="page-sub">None.</td></tr>';
    document.querySelectorAll('#t_active [data-open],#t_soon [data-open],#t_exp [data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelector('[data-atab="businesses"]').click();
        openDetail(btn.dataset.open);
      });
    });
  }

  // ---------- Activity log ----------
  function renderLogs() {
    var r = BizDyali.adminGetLogs(400);
    if (r.error) { showErr(r.error); return; }
    var type = $('logType').value;
    var q = $('logSearch').value.trim().toLowerCase();
    var rows = r.logs.filter(function (l) {
      if (type && l.type !== type) return false;
      if (q && [l.businessName, l.actorName, l.details].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $('logRows').innerHTML = rows.slice(0, 200).map(function (l) {
      return '<tr><td style="white-space:nowrap"><small>' + fmtDT(l.ts) + '</small></td>' +
        '<td><code style="font-size:.78rem">' + esc(l.type) + '</code></td>' +
        '<td><small>' + esc(l.actor) + (l.actorName ? ': ' + esc(l.actorName) : '') + '</small></td>' +
        '<td><small>' + esc(l.businessName || '—') + '</small></td>' +
        '<td><small>' + esc(l.details || '') + '</small></td></tr>';
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No events yet.</td></tr>';
  }
  $('logType').addEventListener('change', renderLogs);
  $('logSearch').addEventListener('input', renderLogs);

  refreshGate();
})();
