/* Applies supabase/migrations/*.sql in sorted order. Owner-run tooling only:
 * never shipped, never imported by the site.
 *
 *   SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres' \
 *     node scripts/apply-migrations.js [0007]
 *
 * Optional trailing arg applies a single file (recovery). Stops at the first
 * failure printing filename + error. Needs the `pg` package (not a site
 * dependency -- install ad hoc: `npm i --no-save pg`).
 */
const fs = require('fs');
const path = require('path');
let Client;
try {
  Client = require('pg').Client;
} catch (e) {
  console.error("Missing dependency: run `npm i --no-save pg` first (tooling only, not shipped).");
  process.exit(2);
}
(async () => {
  const url = process.env.SUPABASE_DB_URL || '';
  if (!url) { console.error('Set SUPABASE_DB_URL to the pooler connection string.'); process.exit(2); }
  const only = process.argv[2] || null;
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    .filter(f => !only || f.startsWith(only));
  if (!files.length) { console.error('No migration files match.'); process.exit(2); }
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 20000 });
  await c.connect();
  for (const f of files) {
    try {
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      console.log('MIG-OK', f);
    } catch (e) {
      console.error('MIG-FAIL', f, '-', String(e.message).slice(0, 300));
      process.exitCode = 1;
      break;
    }
  }
  await c.end().catch(() => {});
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
