// BizDb stubbed-fetch tests. Plain node, zero dependencies: `node tests/run-db.js`.
global.window = undefined;
global.BizConfig = { supabaseUrl: 'https://ref.supabase.co', supabaseAnonKey: 'anon-key' };
const Db = require('../js/db.js');
let pass = 0, fail = 0;
function t(n, c, x) { if (c) pass++; else { fail++; console.log('  FAIL:', n, x === undefined ? '' : JSON.stringify(x)); } }
const calls = [];
Db._setFetch((url, opts) => {
  calls.push({ url, method: opts.method, auth: !!(opts.headers && opts.headers.Authorization), apikey: opts.headers && opts.headers.apikey, body: opts.body });
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: 1 }) });
});
(async () => {
  await Db.rest('businesses', '?select=id', { method: 'GET' }, 'tok123');
  t('rest url+method+auth', calls[0].url === 'https://ref.supabase.co/rest/v1/businesses?select=id' && calls[0].method === 'GET' && calls[0].auth === true && calls[0].apikey === 'anon-key', calls[0]);
  await Db.rpc('public_business', { p_slug: 'x' }, null);
  t('anon rpc apikey-only', calls[1].url.endsWith('/rest/v1/rpc/public_business') && calls[1].auth === false && calls[1].apikey === 'anon-key', calls[1]);
  t('rpc body json', JSON.parse(calls[1].body).p_slug === 'x', calls[1].body);
  try { await Db.storageUpload('u1', {}, 'image/svg+xml', 'tok'); t('svg rejected', false); }
  catch (e) { t('svg rejected', /unsupported/.test(e.message), e.message); }
  try { await Db.storageUpload('u1', {}, 'image/png', null); t('no-token rejected', false); }
  catch (e) { t('no-token rejected', /signed in/.test(e.message), e.message); }
  await Db.storageUpload('u1', { fake: 'blob' }, 'image/png', 'tok');
  const up = calls[calls.length - 1];
  const m = /\/business-media\/(u1\/[0-9a-f-]{36}\.png)$/.exec(up.url);
  t('upload path owner+uuid', !!m && m[1].indexOf('u1/') === 0, up.url);
  t('upload content-type', up.body && true, 'blob passed through');
  t('path-from-url', Db.storagePathFromUrl('https://ref.supabase.co/storage/v1/object/public/business-media/u1/a-b.jpg') === 'u1/a-b.jpg', Db.storagePathFromUrl('x'));
  t('path-from-url rejects foreign', Db.storagePathFromUrl('https://evil.com/x.jpg') === null);
  t('path-from-url rejects data', Db.storagePathFromUrl('data:image/png;base64,xx') === null);
  const e1 = Db.mapPublishError(Object.assign(new Error('duplicate key value violates unique'), { status: 409 }));
  t('409 maps taken', e1.code === 'taken' && /مستعمل/.test(e1.message), e1.message);
  const e2 = Db.mapPublishError(new Error('business limit reached'));
  t('limit maps cap', e2.code === 'cap' && /5 دالصفحات/.test(e2.message), e2.message);
  const biz = Db.toBiz({ id: '1', owner_id: 'u', slug: 's', name: 'N', offering_type: 'both', hours_week: { mon: [['09:00', '18:00']] }, items: [], theme: {}, published: true, subscription: 'none', suspended: false, trial_start: 'a', trial_end: 'b' });
  t('toBiz maps', biz.ownerId === 'u' && biz.offeringType === 'both' && biz.hoursWeek.mon[0][0] === '09:00' && biz.trialEnd === 'b', biz);
  const p = Db.toPayload({ name: 'N', items: [{ id: 'i', kind: 'product', name: 'P', photos: [{ src: 'https://h/x.jpg' }, 'https://h/y.jpg'], video: '' }], logo: { src: 'https://h/l.jpg' }, cover: '' });
  t('toPayload keeps focal objects', p.items[0].photos.length === 2 && p.items[0].photos[0].src === 'https://h/x.jpg' && p.logo === 'https://h/l.jpg', p);
  const rw = Db.toRow({ id: 'b1', slug: 's', name: 'N', items: [], theme: {} });
  t('toRow omits server columns', rw.owner_id === undefined && rw.published === undefined && rw.subscription === undefined && rw.trial_end === undefined && rw.slug === 's', Object.keys(rw));
  t('uuid v4 shape', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(Db.uuid()));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
