// Diagnostic endpoint — visit /api/health to check config without revealing secrets.
export default async function handler(req, res) {
  // Best-effort DB + schema check (don't fail the whole response if it errors).
  let db = 'unknown';
  try {
    const { sql, ensureSchema } = await import('./_lib/db.js');
    await ensureSchema();
    await sql`SELECT 1`;
    db = 'ok';
  } catch (e) {
    db = 'error: ' + (e && e.message ? e.message : String(e)).slice(0, 200);
  }

  return res.status(200).json({
    passwordConfigured: Boolean(process.env.APP_PASSWORD),
    passwordLength: (process.env.APP_PASSWORD || '').length,
    secretConfigured: Boolean(process.env.APP_SECRET),
    db,
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    runtime: process.version,
  });
}
