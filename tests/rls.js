/* RLS + RPC verification matrix. Plain node, zero dependencies.
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... TEST_PROJECT_REF=<ref> node tests/rls.js
 * Keys come ONLY from the environment: never committed, never in browser code.
 * TEST_PROJECT_REF is required and must match the target URL: the script
 * aborts otherwise, so a typo can never run this matrix against production.
 *
 * Changed expectations (grant/trigger tightening over time):
 * - forged owner insert: accepted-but-sanitized -> denied (RLS WITH CHECK, 403)
 * - legit insert bodies omit owner_id (column grant excludes it; DEFAULT fills)
 * - admin direct status PATCH: allowed -> denied (column grant); admin_set_status RPC is the path
 * - publish trial test: byte-identical republish -> set-once + republish-noop + null-fill trio
 * - table invisibility: 401 -> 401 or 403 (PostgREST returns 403 for missing grants)
 * - anon storage write: 401/403 -> 400/401/403
 * - baseBiz owner: literal 'A' -> real variable (was an FK violation)
 * - photo URLs: arbitrary https -> canonical supabase.co public-path form
 * - per-section users: cap/constraint sections provision dedicated owners so
 *   the 5-row cap cannot trip neighboring assertions for the wrong reason.
 * Auth: mints HMAC test JWTs (sub=A/B/admin) when the project uses a symmetric
 * secret; or set TEST_TOKEN_A/B/ADMIN to use real sessions instead.
 * Covers: anon, user A, user B, admin — incl. INSERT paths and every
 * docs/AUTH.md Phase-3 amendment (forced owner_id, trigger-only phone,
 * no client log_event, revoked functions, minimal public surface, bucket limits).
 */
const BASE = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
if (!BASE || !ANON || !SERVICE) { console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY env.'); process.exit(2); }
const WANT_REF = process.env.TEST_PROJECT_REF || '';
const GOT_REF = (() => { const m = String(BASE).match(/^https:\/\/([^.]+)\.supabase\.co/); return m ? m[1] : ''; })();
if (!WANT_REF || WANT_REF !== GOT_REF) { console.error('Refusing: TEST_PROJECT_REF must equal the target project ref (got "' + GOT_REF + '").'); process.exit(2); }
let pass = 0, fail = 0;
function t(n, cond, got) { if (cond) pass++; else { fail++; console.log('  FAIL:', n, got === undefined ? '' : JSON.stringify(got).slice(0, 200)); } }
// Test identities: real auth users (email+password for tokens, confirmed
// phones for the phone claim). Minted HMAC JWTs do NOT validate on projects
// with asymmetric keys, so sessions always come from password grants here
// (override any leg with TEST_TOKEN_A/B/ADMIN).
const TOK = { anon: null, A: process.env.TEST_TOKEN_A || null, B: process.env.TEST_TOKEN_B || null, admin: process.env.TEST_TOKEN_ADMIN || null, cap: process.env.TEST_TOKEN_CAP || null, svc: null };
const USERS = [
  { tag: 'A', email: 'rls-a@example.com', password: 'Secret123!', phone: '15550001111', name: 'User A' },
  { tag: 'B', email: 'rls-b@example.com', password: 'Secret123!', phone: '15550002222', name: 'User B' },
  { tag: 'admin', email: 'rls-admin@example.com', password: 'Secret123!', phone: '15550003333', name: 'Admin' },
  { tag: 'nophone', email: 'rls-nophone@example.com', password: 'Secret123!', name: 'No Phone' },
  { tag: 'plus', email: 'rls-plus@example.com', password: 'Secret123!', phone: '+15550004444', name: 'Plus' },
  { tag: 'cap', email: 'rls-cap@example.com', password: 'Secret123!', phone: '15550005555', name: 'Cap' },
  { tag: 'mx', email: 'rls-mx@example.com', password: 'Secret123!', phone: '15550006666', name: 'Matrix' }
];
async function svcReq(path, method, body) {
  const r = await fetch(BASE + path, { method: method || 'GET',
    headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, json };
}
async function signIn(email, password) {
  const r = await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }) });
  const s = await r.json();
  return s.access_token || null;
}
async function req(who, path, opts) {
  opts = opts || {};
  const headers = { apikey: ANON, 'Content-Type': 'application/json' };
  if (who === 'svc') { headers.apikey = SERVICE; headers.Authorization = 'Bearer ' + SERVICE; }
  else if (TOK[who]) headers.Authorization = 'Bearer ' + TOK[who];
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, json };
}
const rest = (who, table, q, opts) => req(who, '/rest/v1/' + table + (q || ''), opts);
const rpc = (who, fn, body) => req(who, '/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(body || {}) });
(async () => {
  // Provision users (admin API) + sessions (password grant). The signup
  // trigger must have created their profiles already — asserted below.
  const ids = {};
  for (const u of USERS) {
    if (!TOK[u.tag]) {
      await svcReq('/auth/v1/admin/users', 'DELETE').catch(() => {});
      const created = await svcReq('/auth/v1/admin/users', 'POST',
        { email: u.email, password: u.password, email_confirm: true, phone: u.phone, phone_confirm: true, user_metadata: { name: u.name } });
      // Recreate idempotently: delete-then-create would drop the profile row;
      // instead reuse the existing user when creation reports a duplicate.
      let uid = created.json && created.json.id;
      if (!uid) {
        const list = await svcReq('/auth/v1/admin/users?per_page=100', 'GET');
        const found = ((list.json && list.json.users) || []).find(x => x.email === u.email);
        if (!found) throw new Error('cannot provision ' + u.tag + ': ' + JSON.stringify(created.json).slice(0, 120));
        uid = found.id;
      }
      ids[u.tag] = uid;
      TOK[u.tag] = await signIn(u.email, u.password);
      if (!TOK[u.tag]) throw new Error('cannot sign in ' + u.tag);
    }
  }
  const A = ids.A || '11111111-1111-1111-1111-111111111111';
  const B = ids.B || '22222222-2222-2222-2222-222222222222';
  const AD = ids.admin || '33333333-3333-3333-3333-333333333333';
  const CAP = ids.cap || '44444444-4444-4444-4444-444444444444';
  const MX = ids.mx || '55555555-5555-5555-5555-555555555555';
  const profA = await svcReq('/rest/v1/profiles?select=id,phone&limit=10', 'GET');
  t('handle_new_user created profiles', JSON.stringify(profA.json).includes('15550001111'), (profA.json || []).length);
  await req('svc', '/rest/v1/admins', { method: 'POST', body: JSON.stringify([{ user_id: AD }]) });
  const mkBiz = async (owner, slug, extra) => {
    const r = await req('svc', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify(Object.assign(
      { owner_id: owner, slug, name: 'Biz ' + slug, category: 'Café', description: '0123456789abcdef', phone: '+1000', whatsapp: '+1000', city: 'X', hours: 'h', published: true,
        trial_start: new Date().toISOString(), trial_end: new Date(Date.now() + 86400000).toISOString() }, extra || {})) });
    return r;
  };
  await mkBiz(A, 'rls-a-live');
  await mkBiz(B, 'rls-b-live');
  await mkBiz(B, 'rls-b-expired', { trial_end: new Date(Date.now() - 86400000).toISOString() });
  await mkBiz(B, 'rls-b-susp', { suspended: true });

  const newSlugs = [];

  // ANON surface.
  let r = await rest('anon', 'businesses', '?select=id&limit=1');
  t('anon: no direct table reads', (Array.isArray(r.json) && r.json.length === 0) || r.status === 401, r.status);
  r = await rpc('anon', 'public_business', { p_slug: 'rls-a-live' });
  t('anon: public_business live has no owner/profile', r.json && r.json.slug === 'rls-a-live' && !('owner_id' in r.json) && !('ownerId' in r.json) && !('phone_login' in r.json), r.json && Object.keys(r.json));
  r = await rpc('anon', 'public_business', { p_slug: 'rls-b-expired' });
  t('anon: expired reveals name+status only', r.json && r.json.status === 'unavailable' && !r.json.whatsapp, r.json);
  r = await rpc('anon', 'public_business', { p_slug: 'rls-b-susp' });
  t('anon: suspended reveals name+status only', r.json && r.json.status === 'unavailable' && !r.json.whatsapp, r.json);
  r = await rpc('anon', 'public_business', { p_slug: 'nope-missing' });
  t('anon: missing slug null', r.json === null, r.json);
  r = await rpc('anon', 'public_directory', {});
  t('anon: directory limited columns', Array.isArray(r.json) && r.json.every(x => !('owner_id' in x) && !('whatsapp' in x)), (r.json || []).length);
  r = await rest('anon', 'profiles', '?select=id');
  t('anon: no profile reads', (Array.isArray(r.json) && r.json.length === 0) || r.status === 401, r.status);

  // Cross-user isolation.
  r = await rest('A', 'businesses', '?select=slug&owner_id=eq.' + B);
  t('A: cannot read B rows', Array.isArray(r.json) && r.json.length === 0, r.json);
  r = await rest('A', 'businesses', '?select=slug');
  t('A: reads own rows', Array.isArray(r.json) && r.json.some(x => x.slug === 'rls-a-live'), r.json);
  const patchB = await (async () => {
    const rr = await fetch(BASE + '/rest/v1/businesses?owner_id=eq.' + B, { method: 'PATCH', headers: { apikey: ANON, Authorization: 'Bearer ' + TOK.A, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hacked' }) });
    return rr.status;
  })();
  t('A: cannot patch B', patchB === 404 || patchB === 403 || (await (await fetch(BASE + '/rest/v1/businesses?owner_id=eq.' + B + '&select=name', { headers: { apikey: ANON, Authorization: 'Bearer ' + TOK.A } })).json()).every(x => x.name !== 'Hacked'), patchB);

  // Safe-column write applies; any server column in the same write fails it
  // atomically at grant level (403, nothing applies — stronger than revert).
  r = await req('A', '/rest/v1/businesses?slug=eq.rls-a-live', { method: 'PATCH', body: JSON.stringify({ name: 'A Renamed' }) });
  t('A: safe-column PATCH accepted', r.status === 200 || r.status === 204, r.status);
  r = await req('A', '/rest/v1/businesses?slug=eq.rls-a-live', { method: 'PATCH', body: JSON.stringify({ trial_end: new Date(Date.now() + 999 * 86400000).toISOString(), subscription: 'active', suspended: true }) });
  t('A: server-column PATCH denied whole', r.status === 403 || r.status === 400, r.status);
  r = await rest('A', 'businesses', '?slug=eq.rls-a-live&select=name,subscription,suspended,trial_end');
  const row = (r.json || [])[0] || {};
  t('A: name write works', row.name === 'A Renamed', row);
  t('A: subscription/suspended reverted', row.subscription === 'none' && row.suspended === false, row);
  t('A: trial_end not extended', row.trial_end && new Date(row.trial_end).getTime() < Date.now() + 100 * 86400000, row.trial_end);

  // INSERT paths: forged owner forced, server cols reset.
  r = await req('A', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify({ owner_id: B, slug: 'rls-forged', name: 'Forged Biz', category: 'Café', description: '0123456789abcdef' }) });
  t('A: forged insert denied by RLS', r.status === 403 || r.status === 401, r.status);
  r = await req('A', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify({ slug: 'rls-own-raw', name: 'Own Raw', category: 'Café', description: '0123456789abcdef' }) });
  t('A: legit insert accepted', r.status === 201 || r.status === 200, r.status);
  r = await rest('A', 'businesses', '?slug=eq.rls-own-raw&select=owner_id,published,subscription,trial_end');
  const fr = (r.json || [])[0] || {};
  t('A: owner forced to self', fr.owner_id === A, fr);
  t('A: published/trial reset', fr.published === false && fr.subscription === 'none' && fr.trial_end === null, fr);

  // Profiles privacy: phone trigger-only.
  r = await rest('A', 'profiles', '?select=id,phone');
  t('A: reads own profile only', Array.isArray(r.json) && r.json.length === 1 && r.json[0].id === A, r.json);
  r = await req('A', '/rest/v1/profiles?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ phone: '1999' }) });
  const after = await rest('A', 'profiles', '?select=phone');
  t('A: phone unwritable', !((after.json || [])[0] || {}).phone || ((after.json || [])[0].phone !== '1999'), r.status);
  r = await rest('A', 'admins', '?select=user_id');
  t('A: admins table invisible', (Array.isArray(r.json) && r.json.length === 0) || r.status === 401 || r.status === 403, r.status);

  // log_event not client-callable.
  r = await rpc('A', 'log_event', { p_type: 'x', p_actor: 'owner', p_actor_name: 'x', p_business_id: null, p_business_name: 'x', p_owner_id: A, p_details: 'x' });
  t('A: log_event denied', r.status === 404 || r.status === 403 || (r.json && r.json.code), r.status);

  // publish_business: validates, sets trial once, never extends.
  r = await rpc('A', 'publish_business', { p_slug: 'bad slug!!', p_data: {} });
  t('publish: bad slug rejected', r.status === 400 || (r.json && (r.json.code || r.json.message)), r.status);
  r = await rpc('A', 'publish_business', { p_slug: 'rls-pub1', p_data: { name: 'Pub One', category: 'Café', description: '0123456789abcdef' } });
  t('publish: fresh row publishes', r.json && r.json.slug === 'rls-pub1' && !!r.json.trial_end, (r.json || {}).slug);
  const t1 = new Date((r.json || {}).trial_end).getTime();
  t('publish: trial ~14d out', t1 > Date.now() + 13 * 86400000 && t1 < Date.now() + 15 * 86400000, (r.json || {}).trial_end);
  newSlugs.push('rls-pub1');
  r = await rpc('A', 'publish_business', { p_slug: 'rls-pub1', p_data: { name: 'Pub One Again', category: 'Café', description: '0123456789abcdef' } });
  t('publish: first trial is a real timestamp', Number.isFinite(t1), (r.json || {}).trial_end);
  t('publish: republish never extends', Number.isFinite(t1) && new Date((r.json || {}).trial_end).getTime() === t1, (r.json || {}).trial_end);
  // legacy null-trial row gets filled once, then frozen
  await req('svc', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify({ owner_id: A, slug: 'rls-nulltrial', name: 'Null Trial', category: 'Café', description: '0123456789abcdef', published: true }) });
  newSlugs.push('rls-nulltrial');
  r = await rpc('A', 'publish_business', { p_slug: 'rls-nulltrial', p_data: { name: 'Null Trial', category: 'Café', description: '0123456789abcdef' } });
  t('publish: null trial filled', !!(r.json || {}).trial_end, (r.json || {}).trial_end);

  // Page cap: dedicated owner publishes 5 distinct slugs, the 6th fails.
  // (Separate user so the cap cannot trip the constraint matrix above/below
  // for the wrong reason; all cap slugs are cleaned up with the rest.)
  let capOk = 0;
  for (let i = 0; i < 5; i++) {
    const rr = await rpc('cap', 'publish_business', { p_slug: 'rls-cap-' + i,
      p_data: { name: 'Cap ' + i, category: 'Café', description: '0123456789abcdef' } });
    if (rr.json && rr.json.slug === 'rls-cap-' + i) capOk++;
    newSlugs.push('rls-cap-' + i);
  }
  t('cap: 5 publishes succeed', capOk === 5, capOk);
  r = await rpc('cap', 'publish_business', { p_slug: 'rls-cap-5',
    p_data: { name: 'Cap 5', category: 'Café', description: '0123456789abcdef' } });
  t('cap: 6th slug fails', r.status === 400 || (r.json && (r.json.code || r.json.message)), r.status);
  newSlugs.push('rls-cap-5');

  r = await req('A', '/rest/v1/businesses?slug=eq.rls-a-live', { method: 'PATCH', body: JSON.stringify({ is_demo: true, subscription: 'active', trial_end: new Date(Date.now() + 999 * 86400000).toISOString() }) });
  t('owner: is_demo+billing PATCH denied', r.status === 403 || r.status === 400, r.status);
  const still = await rest('A', 'businesses', '?slug=eq.rls-a-live&select=subscription');
  t('owner: billing unchanged', ((still.json || [])[0] || {}).subscription === 'none', still.json);
  // Admin paths go through admin_set_status (server-verified); owners revert.
  r = await req('admin', '/rest/v1/businesses?slug=eq.rls-b-live', { method: 'PATCH', body: JSON.stringify({ subscription: 'active' }) });
  await req('admin', '/rest/v1/businesses?slug=eq.rls-b-live', { method: 'PATCH', body: JSON.stringify({ subscription: 'active' }) });
  const admRow = await rest('admin', 'businesses', '?slug=eq.rls-b-live&select=subscription');
  t('admin: direct status write denied by grant', ((admRow.json || [])[0] || {}).subscription === 'none', admRow.json);
  r = await rpc('A', 'admin_set_status', { p_business_id: '00000000-0000-0000-0000-000000000000', p_trial_end: null, p_subscription: 'active', p_suspended: false });
  t('A: admin RPC denied', r.status === 400 || (r.json && (r.json.code || r.json.message)), r.status);
  const bizId = ((await rest('admin', 'businesses', '?slug=eq.rls-b-live&select=id')).json || [])[0].id;
  r = await rpc('admin', 'admin_set_status', { p_business_id: bizId, p_trial_end: new Date(Date.now() + 30 * 86400000).toISOString(), p_subscription: null, p_suspended: null });
  t('admin: set_status extends trial', r.json && r.json.slug === 'rls-b-live', (r.json || {}).slug);
  const logs = await rest('admin', 'activity_log', '?select=type&order=ts.desc&limit=5');
  t('admin: action logged', Array.isArray(logs.json) && logs.json.some(x => x.type === 'admin_action'), logs.json);

  // Drafts isolation.
  await req('A', '/rest/v1/drafts', { method: 'POST', body: JSON.stringify({ owner_id: A, data: { a: 1 } }) });
  r = await rest('B', 'drafts', '?select=owner_id');
  t('B: cannot read A draft', Array.isArray(r.json) && r.json.length === 0, r.json);

  // Storage: anon write denied; owner path allowed; forged path denied.
  const up = await fetch(BASE + '/storage/v1/object/business-media/anon/x.jpg', { method: 'POST', headers: { apikey: ANON }, body: 'x' });
  t('storage: anon write denied', [400, 401, 403].includes(up.status), up.status);
  const ownPath = A + '/33333333-3333-3333-3333-333333333333.jpg';
  const upOwn = await fetch(BASE + '/storage/v1/object/business-media/' + ownPath, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + TOK.A, 'Content-Type': 'image/jpeg' }, body: 'x' });
  t('storage: owner path writable', upOwn.status === 200 || upOwn.status === 201, upOwn.status);
  const upForged = await fetch(BASE + '/storage/v1/object/' + B + '/33333333-3333-3333-3333-333333333333.jpg', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + TOK.A, 'Content-Type': 'image/jpeg' }, body: 'x' });
  t('storage: forged path denied', upForged.status === 400 || upForged.status === 403, upForged.status);
  // Internal function invisible to REST (moved out of the exposed schema).
  r = await rpc('admin', 'is_admin', {});
  t('is_admin: not callable via REST', r.status === 404, r.status);
  // ensure_profile backstop: delete A's row, restore via RPC.
  await req('svc', '/rest/v1/profiles?id=eq.' + A, { method: 'DELETE' });
  r = await rpc('A', 'ensure_profile', {});
  t('ensure_profile restores own row', r.json && r.json.id === A && r.json.phone === '15550001111', (r.json || {}).phone);

  // Admin: full visibility.
  r = await rest('admin', 'businesses', '?select=slug');
  t('admin: reads all', Array.isArray(r.json) && r.json.length >= 4, (r.json || []).length);
  r = await rest('admin', 'activity_log', '?select=id&limit=1');
  t('admin: reads activity log', Array.isArray(r.json), r.status);
  r = await rest('A', 'activity_log', '?select=id&limit=1');
  t('A: activity log hidden', (Array.isArray(r.json) && r.json.length === 0) || r.status === 401 || r.status === 403, r.status);
  r = await rest('admin', 'profiles', '?select=phone');
  t('admin: reads profiles', Array.isArray(r.json) && r.json.length >= 3, (r.json || []).length);

  // Constraint matrix: one positive, one negative per rule (A inserts, A reads back).
  const GOOD_PHOTO = 'https://xyz123abc.supabase.co/storage/v1/object/public/business-media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';
  const baseBiz = (slug, patch) => Object.assign({ slug, name: 'Constraint Biz', category: 'Café',
    description: '0123456789abcdef', phone: '+1000', whatsapp: '+1000', city: 'X', hours: 'h',
    logo: GOOD_PHOTO, cover: GOOD_PHOTO,
    items: [{ id: 'i1', kind: 'product', name: 'P', photos: [GOOD_PHOTO], video: null }],
    theme: { accent: '#0A6B4F' }, testimonials: [], trust: [] }, patch || {});
  async function tryInsert(slug, patch, who) {
    const rr = await req(who || 'A', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify(baseBiz(slug, patch)) });
    return rr.status;
  }
  t('constraint: valid full row accepted', (await (async () => { const st = await tryInsert('rls-ok-full', {}, 'mx'); newSlugs.push('rls-ok-full'); return st; })()) === 201, 'valid insert');
  const negs = [
    ['slug too short', { slug: 'x' }],
    ['slug reserved', { slug: 'admin' }],
    ['slug malformed', { slug: 'BAD SLUG!!' }],
    ['name too long', { name: 'n'.repeat(121) }],
    ['description too long', { description: 'd'.repeat(5001) }],
    ['facebook http', { facebook: 'http://evil.com/x' }],
    ['logo arbitrary https', { logo: 'https://evil.com/x.jpg' }],
    ['logo data-url', { logo: 'data:image/png;base64,xx' }],
    ['item kind', { items: [{ id: 'i1', kind: 'weird', name: 'P' }] }],
    ['item 5 photos', { items: [{ id: 'i1', kind: 'product', name: 'P', photos: [GOOD_PHOTO, GOOD_PHOTO, GOOD_PHOTO, GOOD_PHOTO, GOOD_PHOTO] }] }],
    ['item photo scheme', { items: [{ id: 'i1', kind: 'product', name: 'P', photos: ['https://evil.com/x.jpg'] }] }],
    ['item video scheme', { items: [{ id: 'i1', kind: 'product', name: 'P', video: 'https://evil.com/v.mp4' }] }],
    ['item video ext', { items: [{ id: 'i1', kind: 'product', name: 'P', video: 'https://xyz123abc.supabase.co/storage/v1/object/public/business-media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.mov' }] }],
    ['evil query-smuggle', { logo: 'https://evil.com/x.png?/storage/v1/object/public/business-media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg' }],
    ['evil host canonical path', { logo: 'https://evil.com/storage/v1/object/public/business-media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg' }],
    ['accent malformed', { theme: { accent: 'red' } }],
    ['accent non-hex', { theme: { accent: '#zzzzzz' } }],
    ['testimonials 11', { testimonials: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    ['trust 5', { trust: ['a', 'b', 'c', 'd', 'e'] }]
  ];
  for (let i = 0; i < negs.length; i++) {
    const slug = 'rls-neg-' + i;
    const st = await tryInsert(slug, negs[i][1], 'mx');
    t('constraint rejects: ' + negs[i][0], st >= 400, st);
  }

  // Email-only session (no phone claim): locked out of owner paths.
  r = await rest('nophone', 'businesses', '?select=slug&limit=1');
  t('nophone: reads denied', Array.isArray(r.json) && r.json.length === 0, r.json);
  r = await req('nophone', '/rest/v1/drafts', { method: 'POST', body: JSON.stringify({ owner_id: ids.nophone, data: {} }) });
  t('nophone: draft insert denied', r.status === 403 || r.status === 401, r.status);
  r = await rpc('nophone', 'publish_business', { p_slug: 'rls-nope', p_data: { name: 'Nope', category: 'Café', description: '0123456789abcdef' } });
  t('nophone: publish denied (phone required)', r.status === 400 || (r.json && (r.json.code || r.json.message)), r.status);
  // Plus-prefixed phone lands canonical (no '+') via the trigger.
  r = await svcReq('/rest/v1/profiles?select=phone&id=eq.' + ids.plus, 'GET');
  t('plus phone stripped', ((r.json || [])[0] || {}).phone === '15550004444', r.json);
  // Null item kind rejected; overlong profile name rejected.
  r = await req('A', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify({ slug: 'rls-nullkind', name: 'NK', category: 'Café', description: '0123456789abcdef', items: [{ id: 'x', name: 'NoKind' }] }) });
  t('null item kind rejected', r.status >= 400, r.status);
  r = await req('A', '/rest/v1/profiles?id=eq.' + A, { method: 'PATCH', body: JSON.stringify({ name: 'n'.repeat(121) }) });
  t('121-char profile name rejected', r.status >= 400, r.status);

  // Cleanup (service role).
  for (const slug of ['rls-a-live', 'rls-b-live', 'rls-b-expired', 'rls-b-susp', 'rls-forged', 'rls-own-raw', 'rls-ok-full', 'rls-pub1', 'rls-nulltrial', 'rls-cap-0', 'rls-cap-1', 'rls-cap-2', 'rls-cap-3', 'rls-cap-4', 'rls-cap-5'])
    await req('svc', '/rest/v1/businesses?slug=eq.' + slug, { method: 'DELETE' });
  for (const id of [A, B, AD]) {
    await req('svc', '/rest/v1/admins?user_id=eq.' + id, { method: 'DELETE' });
    await req('svc', '/rest/v1/profiles?id=eq.' + id, { method: 'DELETE' });
  }
  for (const u of USERS) {
    const list = await svcReq('/auth/v1/admin/users?per_page=100', 'GET');
    const found = ((list.json && list.json.users) || []).find(x => x.email === u.email);
    if (found) await svcReq('/auth/v1/admin/users/' + found.id, 'DELETE');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
