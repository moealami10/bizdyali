-- 0006: Demo rows. Media lives in the repo (assets/demo/*), NOT storage:
-- these paths are served by static hosting. Real owner uploads go to the
-- business-media bucket (see 0005). Trial windows are computed at seed time
-- so the demo is always in a sensible state (one live, one expiring, one expired).
insert into public.businesses
  (id, owner_id, slug, name, category, description, phone, whatsapp, address, city,
   hours, facebook, instagram, offering_type, logo, cover, items, published,
   trial_start, trial_end, subscription, suspended, is_demo)
values
  ('00000000-0000-0000-0000-000000000001', NULL,
   'cafe-nassim', 'Café Nassim', 'Café',
   'A cozy neighbourhood café in Maârif. Fresh msemen every morning, great espresso, sunny terrace.',
   '+212 6 61 00 00 00', '+212661000000', '12 Rue Yacoub El Mansour, Maârif', 'Casablanca',
   'Mon – Sat: 8:00 – 23:00', 'https://facebook.com/', 'https://instagram.com/', 'both',
   '', 'assets/demo/cafe-cover.jpg',
   ('[{"id":"di1","kind":"product","name":"Espresso","description":"Rich single-origin espresso.","price":15,"photos":["assets/demo/espresso-1.jpg","assets/demo/espresso-2.jpg"],"video":null,"order":0},'
   || '{"id":"di2","kind":"product","name":"Msemen & Honey","description":"Fresh griddle bread, served warm.","price":8,"photos":["assets/demo/msemen.jpg"],"video":null,"order":1},'
   || '{"id":"di4","kind":"product","name":"Tiramisu","description":"Creamy mascarpone, cocoa dust.","price":28,"photos":["assets/demo/tiramisu.jpg"],"video":null,"order":2},'
   || '{"id":"di3","kind":"service","name":"Birthday Table Setup","description":"We decorate a table for your celebration.","price":150,"photos":["assets/demo/birthday.jpg"],"video":null,"order":3}]')::jsonb,
   true, now() - interval '1 day', now() + interval '13 days', 'none', false, true)
on conflict (slug) do nothing;
