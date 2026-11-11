// סנכרון מית"ר ממחשב בישראל, ישירות למסד הנתונים (בלי לעבור דרך שרת ה-production).
//
// אתר מית"ר (apps.education.gov.il) חוסם גישה משרתי ענן בחו"ל, ולכן הסנכרון המתוזמן
// שרץ בשרת עצמו נכשל תמיד. הסקריפט הזה מריץ את אותה לוגיקה בדיוק (runMitarSync) ממחשב
// שכן מגיע לאתר, וכותב ל-MongoDB לפי MONGODB_URI שב-.env.local.
//
// הרצה ידנית:   npx tsx scripts/mitar-sync-local.ts
// הרצה מתוזמנת: scripts/mitar-sync-local.cmd (כותב ל-logs/mitar-sync.log). רישום חד-פעמי
// ב-Windows Task Scheduler, כולל השלמת ריצה שהוחמצה כשהמחשב היה כבוי (PowerShell):
//   Register-ScheduledTask -TaskName "maetar2-mitar-sync" `
//     -Action (New-ScheduledTaskAction -Execute "<נתיב הפרויקט>\scripts\mitar-sync-local.cmd") `
//     -Trigger (New-ScheduledTaskTrigger -Daily -At 07:30) `
//     -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)
//
// MITAR_SYNC_DNS (אופציונלי): שרתי DNS מופרדים בפסיק, למחשב שבו ה-resolver המקומי לא
// מחזיר רשומות SRV של MongoDB Atlas.

import dns from 'dns';
import path from 'path';

process.chdir(path.resolve(__dirname, '..'));
process.loadEnvFile('.env.local');

const dnsServers = (process.env.MITAR_SYNC_DNS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (dnsServers.length) dns.setServers(dnsServers);

async function main() {
  const { runMitarSync } = await import('../lib/mitar-sync');
  console.log(`[${new Date().toISOString()}] מתחיל סנכרון מית"ר מקומי...`);
  const result = await runMitarSync('local');

  for (const r of result.results) {
    if (r.status === 'error') {
      console.error(`  ${r.month}/${r.year}: שגיאה — ${r.error}`);
      continue;
    }
    const imported = (r.summary ?? []).filter((s) => s.status === 'imported');
    const failed = (r.summary ?? []).filter((s) => s.status === 'error');
    console.log(
      `  ${r.month}/${r.year}: ${imported.length} קבצים חדשים (${imported.reduce((n, s) => n + s.rows, 0)} שורות), ` +
        `${(r.summary ?? []).length - imported.length - failed.length} כבר קיימים` +
        (failed.length ? `, ${failed.length} נכשלו: ${failed.map((s) => `${s.collection} (${s.error})`).join('; ')}` : '')
    );
  }
  if (result.error) console.error(`  שגיאה: ${result.error}`);

  const fileErrors = result.results.some((r) => (r.summary ?? []).some((s) => s.status === 'error'));
  console.log(`[${new Date().toISOString()}] הסתיים — ${result.ok && !fileErrors ? 'תקין' : 'עם שגיאות'}.`);
  process.exit(result.ok && !fileErrors ? 0 : 1);
}

main().catch((err) => {
  console.error('הסנכרון נכשל:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
