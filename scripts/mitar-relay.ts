// סנכרון מית"ר ממחשב בישראל אל השרת שבענן.
//
// אתר מית"ר (apps.education.gov.il) חוסם גישה משרתי ענן בחו"ל, והמסד רץ ב-Railway ברשת
// פרטית בלבד. לכן הסקריפט הזה מוריד את ה-ZIP החודשי מהמחשב (שיש לו IP ישראלי) ושולח אותו
// ב-HTTPS ל-/api/mitar-sync/ingest בשרת הייצור, שמייבא אותו למסד. אין גישה ישירה למסד.
//
// הגדרות (מ-.env.local או ממשתני סביבה):
//   MITAR_INGEST_URL    כתובת ה-endpoint בייצור, למשל https://<הדומיין>/api/mitar-sync/ingest
//   MITAR_INGEST_TOKEN  אותו טוקן שמוגדר בשרת
//
// הרצה ידנית:   npx tsx scripts/mitar-relay.ts
// הרצה מתוזמנת: scripts/mitar-relay.cmd (כותב ל-logs/mitar-sync.log). רישום חד-פעמי
// ב-Windows Task Scheduler, כולל השלמת ריצה שהוחמצה כשהמחשב היה כבוי (PowerShell):
//   Register-ScheduledTask -TaskName "maetar2-mitar-sync" `
//     -Action (New-ScheduledTaskAction -Execute "<נתיב הפרויקט>\scripts\mitar-relay.cmd") `
//     -Trigger (New-ScheduledTaskTrigger -Daily -At 07:30) `
//     -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable)

import path from 'path';

process.chdir(path.resolve(__dirname, '..'));
try {
  process.loadEnvFile('.env.local');
} catch {
  // משתני הסביבה יכולים להגיע גם מהתהליך עצמו
}

import { openMitarSession, listAvailableMonths, downloadMonthZip } from '../lib/mitar-client';

const BENEFICIARY_CODE = process.env.MITAR_BENEFICIARY_CODE || '10402469';
const MONTHS_PER_RUN = Number(process.env.MITAR_SYNC_MONTHS_PER_RUN || 2);
const INGEST_URL = process.env.MITAR_INGEST_URL;
const INGEST_TOKEN = process.env.MITAR_INGEST_TOKEN;

interface IngestSummaryItem {
  collection: string;
  rows: number;
  status: string;
  error?: string;
}

async function main() {
  if (!INGEST_URL || !INGEST_TOKEN) {
    console.error('חובה להגדיר MITAR_INGEST_URL ו-MITAR_INGEST_TOKEN (ב-.env.local או בסביבה)');
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] פותח session מול מית"ר (מוטב ${BENEFICIARY_CODE})...`);
  const cookie = await openMitarSession(BENEFICIARY_CODE);
  const available = await listAvailableMonths(cookie);
  const toCheck = available.slice(0, MONTHS_PER_RUN);
  console.log(`נמצאו ${available.length} חודשים זמינים, בודק ${toCheck.length} החדשים ביותר.`);

  let hadError = false;

  for (const { month, year } of toCheck) {
    try {
      const zipBuf = await downloadMonthZip(cookie, month, year);

      const form = new FormData();
      form.set('month', String(month));
      form.set('year', String(year));
      form.set('file', new Blob([new Uint8Array(zipBuf)]), `${month}_${year}.zip`);

      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'x-mitar-ingest-token': INGEST_TOKEN },
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        hadError = true;
        console.error(`  ${month}/${year}: נכשל (סטטוס ${res.status}) — ${data?.error ?? data?.result?.error ?? ''}`);
        continue;
      }

      const summary: IngestSummaryItem[] = data?.result?.summary ?? [];
      const imported = summary.filter((s) => s.status === 'imported');
      const failed = summary.filter((s) => s.status === 'error');
      console.log(
        `  ${month}/${year}: ${imported.length} קבצים חדשים (${imported.reduce((n, s) => n + s.rows, 0)} שורות), ` +
          `${summary.length - imported.length - failed.length} כבר קיימים` +
          (failed.length ? `, ${failed.length} נכשלו: ${failed.map((s) => `${s.collection} (${s.error})`).join('; ')}` : '')
      );
      if (failed.length) hadError = true;
    } catch (err) {
      hadError = true;
      console.error(`  ${month}/${year}: שגיאה — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[${new Date().toISOString()}] הסתיים — ${hadError ? 'עם שגיאות' : 'תקין'}.`);
  process.exit(hadError ? 1 : 0);
}

main().catch((err) => {
  console.error('ריצת ה-relay נכשלה:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
