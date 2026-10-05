/* RLS + RPC verification matrix. Plain node, zero dependencies.
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... [SUPABASE_JWT_SECRET=...] node tests/rls.js
 * Keys come ONLY from the environment: never committed, never in browser code.
 * Auth: mints HMAC test JWTs (sub=A/B/admin) when the project uses a symmetric
 * secret; or set TEST_TOKEN_A/B/ADMIN to use real sessions instead.
 * Covers: anon, user A, user B, admin — incl. INSERT paths and every
 * docs/AUTH.md Phase-3 amendment (forced owner_id, trigger-only phone,
 * no client log_event, revoked functions, minimal public surface, bucket limits).
 */
const BASE = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || SERVICE;
if (!BASE || !ANON || !SERVICE) { console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY env.'); process.exit(2); }
const crypto = require('crypto');
let pass = 0, fail = 0;
function t(n, cond, got) { if (cond) pass++; else { fail++; console.log('  FAIL:', n, got === undefined ? '' : JSON.stringify(got).slice(0, 200)); } }
function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function mint(sub, phone) {
  const h = b64url({ alg: 'HS256', typ: 'JWT' });
  const p = b64url(Object.assign({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 }, phone ? { phone } : {}));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest('base64url');
  return h + '.' + p + '.' + sig;
}
const TOK = {
  anon: null,
  A: process.env.TEST_TOKEN_A || mint('11111111-1111-1111-1111-111111111111', '15550001111'),
  B: process.env.TEST_TOKEN_B || mint('22222222-2222-2222-2222-222222222222', '15550002222'),
  admin: process.env.TEST_TOKEN_ADMIN || mint('33333333-3333-3333-3333-333333333333', '15550003333'),
  svc: null
};
async function req(who, path, opts) {
  opts = opts || {};
  const headers = { apikey: ANON, 'Content-Type': 'application/json' };
  if (who === 'svc') headers.apikey = SERVICE;
  else if (TOK[who]) headers.Authorization = 'Bearer ' + TOK[who];
  const r = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, json };
}
const rest = (who, table, q, opts) => req(who, '/rest/v1/' + table + (q || ''), opts);
const rpc = (who, fn, body) => req(who, '/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(body || {}) });
(async () => {
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', AD = '33333333-3333-3333-3333-333333333333';
  // Seed (service role bypasses RLS by design).
  await req('svc', '/rest/v1/profiles', { method: 'POST', body: JSON.stringify([
    { id: A, phone: '15550001111', name: 'User A' },
    { id: B, phone: '15550002222', name: 'User B' },
    { id: AD, phone: '15550003333', name: 'Admin' }]) });
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

  // ANON surface.
  let r = await rest('anon', 'businesses', '?select=id&limit=1');
  t('anon: no direct table reads', Array.isArray(r.json) && r.json.length === 0, r.status + ':' + JSON.stringify(r.json).slice(0, 60));
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
  t('anon: no profile reads', Array.isArray(r.json) && r.json.length === 0, r.status);

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

  // Owner cannot move server columns (trigger reverts).
  await req('A', '/rest/v1/businesses?slug=eq.rls-a-live', { method: 'PATCH', body: JSON.stringify({ trial_end: new Date(Date.now() + 999 * 86400000).toISOString(), subscription: 'active', suspended: true, name: 'A Renamed' }) });
  r = await rest('A', 'businesses', '?slug=eq.rls-a-live&select=name,subscription,suspended,trial_end');
  const row = (r.json || [])[0] || {};
  t('A: name write works', row.name === 'A Renamed', row);
  t('A: subscription/suspended reverted', row.subscription === 'none' && row.suspended === false, row);
  t('A: trial_end not extended', row.trial_end && new Date(row.trial_end).getTime() < Date.now() + 100 * 86400000, row.trial_end);

  // INSERT paths: forged owner forced, server cols reset.
  r = await req('A', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify({ owner_id: B, slug: 'rls-forged', name: 'Forged Biz', category: 'Café', description: '0123456789abcdef', published: true, subscription: 'active', trial_end: new Date(Date.now() + 999 * 86400000).toISOString() }) });
  t('A: forged insert accepted-but-sanitized', r.status === 201 || r.status === 200, r.status);
  r = await rest('A', 'businesses', '?slug=eq.rls-forged&select=owner_id,published,subscription,trial_end');
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
  t('A: admins table invisible', Array.isArray(r.json) && r.json.length === 0, r.status);

  // log_event not client-callable.
  r = await rpc('A', 'log_event', { p_type: 'x', p_actor: 'owner', p_actor_name: 'x', p_business_id: null, p_business_name: 'x', p_owner_id: A, p_details: 'x' });
  t('A: log_event denied', r.status === 404 || r.status === 403 || (r.json && r.json.code), r.status);

  // publish_business: validates, sets trial once, never extends.
  r = await rpc('A', 'publish_business', { p_slug: 'bad slug!!', p_data: {} });
  t('publish: bad slug rejected', r.status === 400 || (r.json && (r.json.code || r.json.message)), r.status);
  const before = await rest('A', 'businesses', '?slug=eq.rls-a-live&select=trial_end');
  r = await rpc('A', 'publish_business', { p_slug: 'rls-a-live', p_data: { name: 'A Live Again', category: 'Café', description: '0123456789abcdef' } });
  const afterPub = await rest('A', 'businesses', '?slug=eq.rls-a-live&select=trial_end');
  t('publish: trial never extended', JSON.stringify((before.json || [])[0]) === JSON.stringify((afterPub.json || [])[0]), [before.json, afterPub.json]);

  // Admin paths: direct writes pass through (server-verified), owners revert.
  r = await req('admin', '/rest/v1/businesses?slug=eq.rls-b-live', { method: 'PATCH', body: JSON.stringify({ subscription: 'active' }) });
  const admRow = await rest('admin', 'businesses', '?slug=eq.rls-b-live&select=subscription');
  t('admin: direct status write allowed', ((admRow.json || [])[0] || {}).subscription === 'active', admRow.json);
  r = await rpc('A', 'admin_set_status', { p_business_id: '00000000-0000-0000-0000-000000000000', p_trial_end: null, p_subscription: 'active', p_suspended: false });
  t('A: admin RPC denied', r.status === 400 || (r.json && (r.json.code || r.json.message)), r.status);
  const bizId = ((await rest('admin', 'businesses', '?slug=eq.rls-b-live&select=id')).json || [])[0].id;
  r = await rpc('admin', 'admin_set_status', { p_business_id: bizId, p_trial_end: new Date(Date.now() + 30 * 86400000).toISOString(), p_subscription: null, p_suspended: null });
  t('admin: set_status extends trial', r.json && r.json.slug === 'rls-b-live', (r.json || {}).slug);
  const logs = await rest('admin', 'activity_log', '?select=type&limit=5');
  t('admin: action logged', Array.isArray(logs.json) && logs.json.some(x => x.type === 'admin_action'), logs.json);

  // Drafts isolation.
  await req('A', '/rest/v1/drafts', { method: 'POST', body: JSON.stringify({ owner_id: A, data: { a: 1 } }) });
  r = await rest('B', 'drafts', '?select=owner_id');
  t('B: cannot read A draft', Array.isArray(r.json) && r.json.length === 0, r.json);

  // Storage: anon write denied; owner path allowed; forged path denied.
  const up = await fetch(BASE + '/storage/v1/object/business-media/anon/x.jpg', { method: 'POST', headers: { apikey: ANON }, body: 'x' });
  t('storage: anon write denied', up.status === 401 || up.status === 403, up.status);
  const ownPath = '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';
  const upOwn = await fetch(BASE + '/storage/v1/object/business-media/' + ownPath, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + TOK.A, 'Content-Type': 'image/jpeg' }, body: 'x' });
  t('storage: owner path writable', upOwn.status === 200 || upOwn.status === 201, upOwn.status);
  const upForged = await fetch(BASE + '/storage/v1/object/business-media/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.jpg', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + TOK.A, 'Content-Type': 'image/jpeg' }, body: 'x' });
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
  t('A: activity log hidden', Array.isArray(r.json) && r.json.length === 0, r.status);
  r = await rest('admin', 'profiles', '?select=phone');
  t('admin: reads profiles', Array.isArray(r.json) && r.json.length >= 3, (r.json || []).length);

  // Constraint matrix: one positive, one negative per rule (A inserts, A reads back).
  const GOOD_PHOTO = 'https://xyz123abc.supabase.co/storage/v1/object/public/business-media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';
  const baseBiz = (slug, patch) => Object.assign({ owner_id: 'A', slug, name: 'Constraint Biz', category: 'Café',
    description: '0123456789abcdef', phone: '+1000', whatsapp: '+1000', city: 'X', hours: 'h',
    logo: GOOD_PHOTO, cover: GOOD_PHOTO,
    items: [{ id: 'i1', kind: 'product', name: 'P', photos: [GOOD_PHOTO], video: null }],
    theme: { accent: '#0A6B4F' }, testimonials: [], trust: [] }, patch || {});
  async function tryInsert(slug, patch) {
    const rr = await req('A', '/rest/v1/businesses', { method: 'POST', body: JSON.stringify(baseBiz(slug, patch)) });
    return rr.status;
  }
  const newSlugs = [];
  t('constraint: valid full row accepted', (await (async () => { const st = await tryInsert('rls-ok-full', {}); newSlugs.push('rls-ok-full'); return st; })()) === 201, 'valid insert');
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
    const st = await tryInsert(slug, negs[i][1]);
    t('constraint rejects: ' + negs[i][0], st >= 400, st);
  }

  // Cleanup (service role).
  for (const slug of ['rls-a-live', 'rls-b-live', 'rls-b-expired', 'rls-b-susp', 'rls-forged', 'rls-ok-full'])
    await req('svc', '/rest/v1/businesses?slug=eq.' + slug, { method: 'DELETE' });
  for (const id of [A, B, AD]) {
    await req('svc', '/rest/v1/admins?user_id=eq.' + id, { method: 'DELETE' });
    await req('svc', '/rest/v1/profiles?id=eq.' + id, { method: 'DELETE' });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
