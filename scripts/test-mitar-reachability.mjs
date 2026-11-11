// בדיקת קישוריות עצמאית וחסרת תלויות ל-apps.education.gov.il.
// הרצה: node test-mitar-reachability.mjs
// מיועד להרצה משרת/שירות כלשהו (Railway, Fly.io, VPS וכו') כדי לבדוק
// בלי לפרוס את כל האפליקציה אם ה-IP היוצא שלו מצליח להגיע לאתר.

const url = 'https://apps.education.gov.il/mtrnet/';
const started = Date.now();

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const ms = Date.now() - started;
  console.log(`✅ הצלחה — סטטוס ${res.status}, ${ms}ms`);
  process.exit(0);
} catch (err) {
  const ms = Date.now() - started;
  const cause = err && typeof err === 'object' && 'cause' in err ? err.cause : undefined;
  console.log(`❌ נכשל אחרי ${ms}ms`);
  console.log('error:', err instanceof Error ? err.message : String(err));
  if (cause) console.log('cause:', cause instanceof Error ? `${cause.name}: ${cause.message} (${cause.code ?? ''})` : String(cause));
  process.exit(1);
}
